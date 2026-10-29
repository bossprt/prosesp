-- 0008 — Acesso do parceiro a clientes e alterações pendentes
-- O parceiro vê só clientes ligados a ele, nunca escreve direto nas tabelas
-- (tudo passa por RPC) e suas alterações de cadastro esperam aprovação da equipe.

create table public.cliente_parceiros (
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  parceiro_id uuid not null references public.parceiros (id),
  criado_em timestamptz not null default now(),
  primary key (cliente_id, parceiro_id)
);
create index cliente_parceiros_parceiro_idx on public.cliente_parceiros (parceiro_id);

create function public.parceiro_ve_cliente(p_cliente_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cliente_parceiros cp
    where cp.cliente_id = p_cliente_id and cp.parceiro_id = public.app_parceiro_id()
  )
$$;
revoke execute on function public.parceiro_ve_cliente(uuid) from public, anon;
grant execute on function public.parceiro_ve_cliente(uuid) to authenticated;

-- Exige usuário parceiro ativo com a permissão; devolve o id do parceiro.
create function public._exigir_parceiro(p_permissao text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v uuid := public.app_parceiro_id();
begin
  if v is null or not public.app_pode(p_permissao) then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  return v;
end $$;
revoke execute on function public._exigir_parceiro(text) from public, anon, authenticated;

-- Cliente com este CPF E esta matrícula (normalizados), ou null.
create function public._cliente_por_cpf_matricula(p_cpf text, p_matricula text) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id
  from public.clientes c
  join public.cliente_matriculas m on m.cliente_id = c.id
  where c.cpf = public.normalizar_cpf(p_cpf)
    and m.matricula_normalizada = ltrim(btrim(coalesce(p_matricula, '')), '0')
    and ltrim(btrim(coalesce(p_matricula, '')), '0') <> ''
  limit 1
$$;
revoke execute on function public._cliente_por_cpf_matricula(text, text) from public, anon, authenticated;

-- ── Busca (pré-preenchimento) ─────────────────────────────────
create function public.parceiro_buscar_cliente(p_cpf text, p_matricula text)
returns table (
  cliente_id uuid, nome text, celular text, whatsapp text, email text, data_nascimento date,
  rg text, rg_orgao text, nome_mae text, nome_pai text, estado_civil text, escolaridade text, pis text,
  cep text, logradouro text, numero text, complemento text, bairro text, cidade text, uf char(2),
  pep boolean, analfabeto boolean, conjuge_nome text, matriculas jsonb
)
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public._exigir_parceiro('clientes.ver');
  v_id := public._cliente_por_cpf_matricula(p_cpf, p_matricula);
  perform public.registrar_acesso('parceiro_buscar_cliente',
    jsonb_build_object('cpf', public.normalizar_cpf(p_cpf), 'encontrado', v_id is not null));
  return query
    select c.id, c.nome, c.celular, c.whatsapp, c.email, c.data_nascimento,
           c.rg, c.rg_orgao, c.nome_mae, c.nome_pai, c.estado_civil, c.escolaridade, c.pis,
           c.cep, c.logradouro, c.numero, c.complemento, c.bairro, c.cidade, c.uf,
           c.pep, c.analfabeto, c.conjuge_nome,
           (select coalesce(jsonb_agg(jsonb_build_object(
                     'convenio_id', m.convenio_id, 'vinculo_id', m.vinculo_id,
                     'matricula', m.matricula, 'ativa', m.ativa)), '[]'::jsonb)
            from public.cliente_matriculas m where m.cliente_id = c.id)
    from public.clientes c
    where c.id = v_id;
end $$;

-- ── Adotar (passa a ver o cliente) ────────────────────────────
create function public.parceiro_adotar_cliente(p_cpf text, p_matricula text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_parceiro uuid := public._exigir_parceiro('clientes.editar');
  v_id uuid := public._cliente_por_cpf_matricula(p_cpf, p_matricula);
begin
  if v_id is null then
    raise exception 'Cliente não encontrado com este CPF e matrícula.';
  end if;
  insert into public.cliente_parceiros (cliente_id, parceiro_id) values (v_id, v_parceiro)
  on conflict do nothing;
  return v_id;
end $$;

-- ── Cadastro pelo parceiro ────────────────────────────────────
create function public.parceiro_cadastrar_cliente(p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_parceiro uuid := public._exigir_parceiro('clientes.editar');
  v_id uuid;
begin
  if exists (select 1 from public.clientes c where c.cpf = public.normalizar_cpf(p_dados->>'cpf')) then
    raise exception 'Este CPF já está cadastrado. Use a busca por CPF e matrícula.';
  end if;
  insert into public.clientes (cpf, nome, celular, whatsapp, email, data_nascimento)
  values (p_dados->>'cpf', p_dados->>'nome', p_dados->>'celular', p_dados->>'whatsapp',
          nullif(p_dados->>'email', ''), (nullif(p_dados->>'data_nascimento', ''))::date)
  returning id into v_id;
  insert into public.cliente_matriculas (cliente_id, convenio_id, vinculo_id, matricula, orgao)
  values (v_id, (p_dados->>'convenio_id')::uuid, (p_dados->>'vinculo_id')::uuid,
          p_dados->>'matricula', nullif(p_dados->>'orgao', ''));
  insert into public.cliente_parceiros (cliente_id, parceiro_id) values (v_id, v_parceiro);
  return v_id;
end $$;

-- ── Alterações pendentes ──────────────────────────────────────
create table public.cliente_alteracoes_pendentes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  parceiro_id uuid not null references public.parceiros (id),
  tipo text not null check (tipo in ('dados', 'conta', 'matricula')),
  proposta jsonb not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada')),
  motivo text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  decidido_por uuid,
  decidido_em timestamptz,
  check (status <> 'recusada' or btrim(coalesce(motivo, '')) <> '')
);
create index cliente_alteracoes_pendentes_status_idx on public.cliente_alteracoes_pendentes (status, criado_em);

create function public._campos_permitidos(p_tipo text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_tipo
    when 'dados' then array['celular', 'whatsapp', 'email', 'data_nascimento', 'rg', 'rg_orgao',
      'nome_mae', 'nome_pai', 'estado_civil', 'escolaridade', 'pis', 'cep', 'logradouro', 'numero',
      'complemento', 'bairro', 'cidade', 'uf', 'pep', 'analfabeto', 'conjuge_nome', 'conjuge_cpf']
    when 'conta' then array['banco_id', 'agencia', 'conta', 'tipo_conta', 'chave_pix', 'tipo_chave_pix']
    when 'matricula' then array['convenio_id', 'vinculo_id', 'matricula', 'orgao']
  end
$$;

create function public.parceiro_propor_alteracao(p_cliente_id uuid, p_tipo text, p_proposta jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_parceiro uuid := public._exigir_parceiro('clientes.editar');
  v_chave text;
  v_id uuid;
begin
  if not public.parceiro_ve_cliente(p_cliente_id) then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if public._campos_permitidos(p_tipo) is null then
    raise exception 'Tipo de alteração inválido.';
  end if;
  if p_proposta is null or jsonb_typeof(p_proposta) <> 'object' or p_proposta = '{}'::jsonb then
    raise exception 'Informe o que deve ser alterado.';
  end if;
  for v_chave in select jsonb_object_keys(p_proposta) loop
    if not v_chave = any (public._campos_permitidos(p_tipo)) then
      raise exception 'Campo não pode ser alterado por esta proposta: %', v_chave;
    end if;
  end loop;
  insert into public.cliente_alteracoes_pendentes (cliente_id, parceiro_id, tipo, proposta)
  values (p_cliente_id, v_parceiro, p_tipo, p_proposta)
  returning id into v_id;
  return v_id;
end $$;

create function public.aprovar_alteracao(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_alt public.cliente_alteracoes_pendentes;
  v_cli public.clientes;
  v_conta public.cliente_contas;
  v_mat public.cliente_matriculas;
begin
  if not public.app_equipe_pode('clientes.aprovar_alteracoes') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into v_alt from public.cliente_alteracoes_pendentes where id = p_id for update;
  if v_alt.id is null then
    raise exception 'Alteração não encontrada.';
  end if;
  if v_alt.status <> 'pendente' then
    raise exception 'Esta alteração já foi decidida.';
  end if;

  if v_alt.tipo = 'dados' then
    select * into v_cli from public.clientes where id = v_alt.cliente_id;
    v_cli := jsonb_populate_record(v_cli, v_alt.proposta);
    update public.clientes set
      celular = v_cli.celular, whatsapp = v_cli.whatsapp, email = v_cli.email,
      data_nascimento = v_cli.data_nascimento, rg = v_cli.rg, rg_orgao = v_cli.rg_orgao,
      nome_mae = v_cli.nome_mae, nome_pai = v_cli.nome_pai, estado_civil = v_cli.estado_civil,
      escolaridade = v_cli.escolaridade, pis = v_cli.pis, cep = v_cli.cep, logradouro = v_cli.logradouro,
      numero = v_cli.numero, complemento = v_cli.complemento, bairro = v_cli.bairro, cidade = v_cli.cidade,
      uf = v_cli.uf, pep = v_cli.pep, analfabeto = v_cli.analfabeto, conjuge_nome = v_cli.conjuge_nome,
      conjuge_cpf = v_cli.conjuge_cpf
    where id = v_alt.cliente_id;
  elsif v_alt.tipo = 'conta' then
    v_conta := jsonb_populate_record(null::public.cliente_contas, v_alt.proposta);
    insert into public.cliente_contas (cliente_id, banco_id, agencia, conta, tipo_conta, chave_pix, tipo_chave_pix, principal)
    values (v_alt.cliente_id, v_conta.banco_id, v_conta.agencia, v_conta.conta, v_conta.tipo_conta,
            v_conta.chave_pix, v_conta.tipo_chave_pix,
            not exists (select 1 from public.cliente_contas x where x.cliente_id = v_alt.cliente_id and x.principal));
  else
    v_mat := jsonb_populate_record(null::public.cliente_matriculas, v_alt.proposta);
    insert into public.cliente_matriculas (cliente_id, convenio_id, vinculo_id, matricula, orgao)
    values (v_alt.cliente_id, v_mat.convenio_id, v_mat.vinculo_id, v_mat.matricula, v_mat.orgao);
  end if;

  update public.cliente_alteracoes_pendentes
  set status = 'aprovada', decidido_por = auth.uid(), decidido_em = now()
  where id = p_id;
end $$;

create function public.recusar_alteracao(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_equipe_pode('clientes.aprovar_alteracoes') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo da recusa.';
  end if;
  update public.cliente_alteracoes_pendentes
  set status = 'recusada', motivo = btrim(p_motivo), decidido_por = auth.uid(), decidido_em = now()
  where id = p_id and status = 'pendente';
  if not found then
    raise exception 'Alteração não encontrada ou já decidida.';
  end if;
end $$;

revoke execute on function
  public.parceiro_buscar_cliente(text, text), public.parceiro_adotar_cliente(text, text),
  public.parceiro_cadastrar_cliente(jsonb), public.parceiro_propor_alteracao(uuid, text, jsonb),
  public.aprovar_alteracao(uuid), public.recusar_alteracao(uuid, text)
  from public, anon;
grant execute on function
  public.parceiro_buscar_cliente(text, text), public.parceiro_adotar_cliente(text, text),
  public.parceiro_cadastrar_cliente(jsonb), public.parceiro_propor_alteracao(uuid, text, jsonb),
  public.aprovar_alteracao(uuid), public.recusar_alteracao(uuid, text)
  to authenticated;

-- ── RLS ───────────────────────────────────────────────────────
alter table public.cliente_parceiros enable row level security;
alter table public.cliente_alteracoes_pendentes enable row level security;

create policy cliente_parceiros_ler on public.cliente_parceiros for select to authenticated
  using (public.app_equipe_pode('clientes.ver') or parceiro_id = public.app_parceiro_id());
create policy cliente_parceiros_equipe_escrever on public.cliente_parceiros for all to authenticated
  using (public.app_equipe_pode('clientes.editar')) with check (public.app_equipe_pode('clientes.editar'));

create policy alteracoes_ler on public.cliente_alteracoes_pendentes for select to authenticated
  using (public.app_equipe_pode('clientes.ver') or parceiro_id = public.app_parceiro_id());

-- Parceiro: só leitura, só clientes ligados a ele
create policy clientes_parceiro_ler on public.clientes for select to authenticated
  using (public.app_pode('clientes.ver') and public.parceiro_ve_cliente(id));
create policy cliente_matriculas_parceiro_ler on public.cliente_matriculas for select to authenticated
  using (public.app_pode('clientes.ver') and public.parceiro_ve_cliente(cliente_id));
create policy cliente_contas_parceiro_ler on public.cliente_contas for select to authenticated
  using (public.app_pode('clientes.ver') and public.parceiro_ve_cliente(cliente_id));
create policy cliente_beneficiarios_parceiro_ler on public.cliente_beneficiarios for select to authenticated
  using (public.app_pode('clientes.ver') and public.parceiro_ve_cliente(cliente_id));

revoke all on public.cliente_parceiros, public.cliente_alteracoes_pendentes from anon;
revoke insert, update, delete on public.cliente_alteracoes_pendentes from authenticated;

create trigger trg_auditoria after insert or update or delete on public.cliente_parceiros
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.cliente_alteracoes_pendentes
  for each row execute function public.auditar();
