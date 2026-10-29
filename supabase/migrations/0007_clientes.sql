-- 0007 — Clientes, matrículas, contas, beneficiários e histórico
-- Cliente é único por CPF e não pertence a parceiro (quem tem dono é o contrato).

create function public.cpf_valido(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  d text := lpad(public.so_digitos(p), 11, '0');
  s integer;
  dv integer;
begin
  if length(public.so_digitos(p)) not between 1 and 11 or d ~ '^(\d)\1{10}$' then
    return false;
  end if;
  for k in 1..2 loop
    s := 0;
    for i in 1..(8 + k) loop
      s := s + substr(d, i, 1)::integer * (10 + k - i);
    end loop;
    dv := case when s % 11 < 2 then 0 else 11 - s % 11 end;
    if dv <> substr(d, 9 + k, 1)::integer then
      return false;
    end if;
  end loop;
  return true;
end $$;

create function public.normalizar_cpf(p text) returns text
language sql immutable set search_path = '' as $$
  select lpad(public.so_digitos(p), 11, '0')
$$;

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  cpf text not null unique check (cpf ~ '^\d{11}$' and public.cpf_valido(cpf)),
  nome text not null check (btrim(nome) <> ''),
  celular text not null,
  whatsapp text not null,
  email text,
  data_nascimento date,
  rg text,
  rg_orgao text,
  nome_mae text,
  nome_pai text,
  estado_civil text check (estado_civil in ('solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel')),
  escolaridade text,
  pis text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf char(2),
  pep boolean,
  analfabeto boolean,
  conjuge_nome text,
  conjuge_cpf text check (conjuge_cpf is null or public.cpf_valido(conjuge_cpf)),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create function public.trg_clientes_normalizar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.cpf_valido(new.cpf) then
    raise exception 'CPF inválido.';
  end if;
  new.cpf := public.normalizar_cpf(new.cpf);
  if new.conjuge_cpf is not null and btrim(new.conjuge_cpf) <> '' then
    if not public.cpf_valido(new.conjuge_cpf) then
      raise exception 'CPF do cônjuge inválido.';
    end if;
    new.conjuge_cpf := public.normalizar_cpf(new.conjuge_cpf);
  else
    new.conjuge_cpf := null;
  end if;
  new.celular := public.so_digitos(new.celular);
  new.whatsapp := public.so_digitos(new.whatsapp);
  if length(new.celular) not between 10 and 11 or length(new.whatsapp) not between 10 and 11 then
    raise exception 'Celular e WhatsApp são obrigatórios, com DDD (10 ou 11 dígitos).';
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create trigger trg_clientes_normalizar before insert or update on public.clientes
  for each row execute function public.trg_clientes_normalizar();

create table public.cliente_matriculas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  convenio_id uuid not null references public.convenios (id),
  vinculo_id uuid not null references public.convenio_vinculos (id),
  matricula text not null check (btrim(matricula) <> ''),
  matricula_normalizada text generated always as (ltrim(btrim(matricula), '0')) stored,
  orgao text,
  ativa boolean not null default true,
  constraint cliente_matriculas_unica unique (convenio_id, matricula_normalizada)
);

create function public.trg_matricula_vinculo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.convenio_vinculos v
                 where v.id = new.vinculo_id and v.convenio_id = new.convenio_id) then
    raise exception 'O vínculo não pertence a este convênio.';
  end if;
  return new;
end $$;

create trigger trg_matricula_vinculo before insert or update on public.cliente_matriculas
  for each row execute function public.trg_matricula_vinculo();

create table public.cliente_contas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  banco_id uuid not null references public.bancos (id),
  agencia text not null,
  conta text not null,
  tipo_conta text not null check (tipo_conta in ('corrente', 'poupanca', 'pagamento')),
  chave_pix text,
  tipo_chave_pix text check (tipo_chave_pix in ('cpf', 'cnpj', 'email', 'celular', 'aleatoria')),
  principal boolean not null default false,
  check ((chave_pix is null) = (tipo_chave_pix is null))
);
create unique index cliente_contas_uma_principal on public.cliente_contas (cliente_id) where principal;

create table public.cliente_beneficiarios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  cpf text check (cpf is null or (cpf ~ '^\d{11}$' and public.cpf_valido(cpf))),
  parentesco text,
  percentual numeric(5,2) check (percentual > 0 and percentual <= 100)
);

-- ── Histórico de telefone, conta e matrícula ──────────────────
create table public.cliente_historico (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  campo text not null check (campo in ('telefone', 'conta', 'matricula')),
  antes jsonb,
  depois jsonb,
  usuario_id uuid,
  em timestamptz not null default now()
);
create index cliente_historico_cliente_idx on public.cliente_historico (cliente_id, id);

-- argumento do trigger: 'telefone' (em clientes), 'conta' ou 'matricula'
create function public.trg_cliente_historico() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_campo text := tg_argv[0];
  v_antes jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_depois jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_cliente uuid;
begin
  if v_campo = 'telefone' then
    if old.celular is not distinct from new.celular and old.whatsapp is not distinct from new.whatsapp then
      return null;
    end if;
    v_cliente := new.id;
    v_antes := jsonb_build_object('celular', old.celular, 'whatsapp', old.whatsapp);
    v_depois := jsonb_build_object('celular', new.celular, 'whatsapp', new.whatsapp);
  else
    v_cliente := (coalesce(v_depois, v_antes)->>'cliente_id')::uuid;
  end if;
  insert into public.cliente_historico (cliente_id, campo, antes, depois, usuario_id)
  values (v_cliente, v_campo, v_antes, v_depois, auth.uid());
  return null;
end $$;

create trigger trg_historico_telefone after update on public.clientes
  for each row execute function public.trg_cliente_historico('telefone');
create trigger trg_historico_conta after insert or update or delete on public.cliente_contas
  for each row execute function public.trg_cliente_historico('conta');
create trigger trg_historico_matricula after insert or update or delete on public.cliente_matriculas
  for each row execute function public.trg_cliente_historico('matricula');

revoke execute on function public.trg_cliente_historico() from public, anon, authenticated;

-- ── Conta principal (troca atômica) ───────────────────────────
create function public.definir_conta_principal_cliente(p_conta_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cliente uuid;
begin
  perform public.app_exigir('clientes.editar');
  if public.app_parceiro_id() is not null then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select cliente_id into v_cliente from public.cliente_contas where id = p_conta_id;
  if v_cliente is null then
    raise exception 'Conta não encontrada.';
  end if;
  update public.cliente_contas set principal = false where cliente_id = v_cliente and principal;
  update public.cliente_contas set principal = true where id = p_conta_id;
end $$;

revoke execute on function public.definir_conta_principal_cliente(uuid) from public, anon;
grant execute on function public.definir_conta_principal_cliente(uuid) to authenticated;

-- ── RLS (equipe interna). A regra do parceiro está na 0008. ───
-- A equipe é quem tem a permissão E não é parceiro.
create function public.app_equipe_pode(p_permissao text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.app_pode(p_permissao) and public.app_parceiro_id() is null
$$;
revoke execute on function public.app_equipe_pode(text) from public, anon;
grant execute on function public.app_equipe_pode(text) to authenticated;

alter table public.clientes enable row level security;
alter table public.cliente_matriculas enable row level security;
alter table public.cliente_contas enable row level security;
alter table public.cliente_beneficiarios enable row level security;
alter table public.cliente_historico enable row level security;

create policy clientes_equipe_ler on public.clientes for select to authenticated
  using (public.app_equipe_pode('clientes.ver'));
create policy clientes_equipe_escrever on public.clientes for all to authenticated
  using (public.app_equipe_pode('clientes.editar')) with check (public.app_equipe_pode('clientes.editar'));

create policy cliente_matriculas_equipe_ler on public.cliente_matriculas for select to authenticated
  using (public.app_equipe_pode('clientes.ver'));
create policy cliente_matriculas_equipe_escrever on public.cliente_matriculas for all to authenticated
  using (public.app_equipe_pode('clientes.editar')) with check (public.app_equipe_pode('clientes.editar'));

create policy cliente_contas_equipe_ler on public.cliente_contas for select to authenticated
  using (public.app_equipe_pode('clientes.ver'));
create policy cliente_contas_equipe_escrever on public.cliente_contas for all to authenticated
  using (public.app_equipe_pode('clientes.editar')) with check (public.app_equipe_pode('clientes.editar'));

create policy cliente_beneficiarios_equipe_ler on public.cliente_beneficiarios for select to authenticated
  using (public.app_equipe_pode('clientes.ver'));
create policy cliente_beneficiarios_equipe_escrever on public.cliente_beneficiarios for all to authenticated
  using (public.app_equipe_pode('clientes.editar')) with check (public.app_equipe_pode('clientes.editar'));

create policy cliente_historico_equipe_ler on public.cliente_historico for select to authenticated
  using (public.app_equipe_pode('clientes.ver'));

revoke all on public.clientes, public.cliente_matriculas, public.cliente_contas,
  public.cliente_beneficiarios, public.cliente_historico from anon;
revoke insert, update, delete on public.cliente_historico from authenticated;

create trigger trg_auditoria after insert or update or delete on public.clientes
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.cliente_matriculas
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.cliente_contas
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.cliente_beneficiarios
  for each row execute function public.auditar();
