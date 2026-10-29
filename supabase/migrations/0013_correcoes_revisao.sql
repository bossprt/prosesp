-- 0013 — Correções da revisão da Etapa 1 (code-review + Codex)

-- 1. Usuários nunca são apagados: separa insert/update e não cria policy de delete.
drop policy usuarios_escrever on public.usuarios;
create policy usuarios_inserir on public.usuarios for insert to authenticated
  with check (public.app_pode('usuarios.gerenciar'));
create policy usuarios_atualizar on public.usuarios for update to authenticated
  using (public.app_pode('usuarios.gerenciar')) with check (public.app_pode('usuarios.gerenciar'));
revoke delete on public.usuarios from authenticated;

-- 2. Auditoria de acesso: registro interno (só funções do banco) + público restrito.
create function public._registrar_acesso(p_acao text, p_detalhe jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.auditoria (usuario_id, acao, detalhe) values (auth.uid(), p_acao, p_detalhe)
$$;
revoke execute on function public._registrar_acesso(text, jsonb) from public, anon, authenticated;

create or replace function public.registrar_acesso(p_acao text, p_detalhe jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.app_perfil() is null then
    raise exception 'Você precisa estar logado.' using errcode = '42501';
  end if;
  -- o app só pode registrar estes eventos; os demais são gravados pelas próprias funções do banco
  if p_acao not in ('login', 'download_documento') then
    raise exception 'Ação de acesso inválida.';
  end if;
  perform public._registrar_acesso(p_acao, coalesce(p_detalhe, '{}'::jsonb));
end $$;

create or replace function public.parceiro_buscar_cliente(p_cpf text, p_matricula text)
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
  perform public._registrar_acesso('parceiro_buscar_cliente',
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

-- 3. Só a equipe grava simulação (gravar torna a linha imutável).
create or replace function public._resultado_simulacao(
  p_linha public.tabela_linhas, p_entrada text, p_valor numeric, p_parcela numeric, p_gravar boolean
) returns table (
  linha_id uuid, fator numeric, valor numeric, parcela numeric, valor_mensalidade numeric,
  percentual_comissao numeric, base_comissao public.base_comissao, simulacao_id uuid
)
language plpgsql security definer set search_path = '' as $$
declare
  v_sim uuid;
begin
  if p_gravar then
    if not public.app_equipe_pode('simulador.usar') then
      raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
    end if;
    insert into public.simulacoes (linha_id, entrada, valor, parcela, criado_por)
    values (p_linha.id, p_entrada, p_valor, p_parcela, auth.uid())
    returning id into v_sim;
  end if;
  return query
    select p_linha.id, p_linha.fator, p_valor, p_parcela, p_linha.valor_mensalidade,
           c.percentual, c.base, v_sim
    from (select 1) x
    left join public.tabela_linha_comissoes c on c.linha_id = p_linha.id;
end $$;

-- 4. Cadastro pelo parceiro: recusa sem revelar o motivo (CPF existente ou matrícula em uso)
--    e registra a tentativa. Devolve null em vez de erro para a auditoria não ser desfeita.
create or replace function public.parceiro_cadastrar_cliente(p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_parceiro uuid := public._exigir_parceiro('clientes.editar');
  v_id uuid;
  v_recusa text;
begin
  if exists (select 1 from public.clientes c where c.cpf = public.normalizar_cpf(p_dados->>'cpf')) then
    v_recusa := 'cpf_existente';
  else
    begin
      insert into public.clientes (cpf, nome, celular, whatsapp, email, data_nascimento)
      values (p_dados->>'cpf', p_dados->>'nome', p_dados->>'celular', p_dados->>'whatsapp',
              nullif(p_dados->>'email', ''), (nullif(p_dados->>'data_nascimento', ''))::date)
      returning id into v_id;
      insert into public.cliente_matriculas (cliente_id, convenio_id, vinculo_id, matricula, orgao)
      values (v_id, (p_dados->>'convenio_id')::uuid, (p_dados->>'vinculo_id')::uuid,
              p_dados->>'matricula', nullif(p_dados->>'orgao', ''));
      insert into public.cliente_parceiros (cliente_id, parceiro_id) values (v_id, v_parceiro);
    exception when unique_violation then
      v_id := null;
      v_recusa := 'matricula_em_uso';
    end;
  end if;
  if v_recusa is not null then
    perform public._registrar_acesso('parceiro_cadastrar_recusado',
      jsonb_build_object('cpf', public.normalizar_cpf(p_dados->>'cpf'), 'motivo', v_recusa));
  end if;
  return v_id;
end $$;

-- 5. Propostas: parceiro só lê enquanto tiver a permissão e o vínculo atual com o cliente.
drop policy alteracoes_ler on public.cliente_alteracoes_pendentes;
create policy alteracoes_ler on public.cliente_alteracoes_pendentes for select to authenticated
  using (
    public.app_equipe_pode('clientes.ver')
    or (parceiro_id = public.app_parceiro_id()
        and public.app_pode('clientes.ver')
        and public.parceiro_ve_cliente(cliente_id))
  );

-- 6. Quais linhas já foram usadas (sem baixar as simulações).
create function public.linhas_usadas(p_linha_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select l.id from unnest(p_linha_ids) as l(id)
  where public.app_pode('tabelas.editar')
    and exists (select 1 from public.simulacoes s where s.linha_id = l.id)
$$;
revoke execute on function public.linhas_usadas(uuid[]) from public, anon;
grant execute on function public.linhas_usadas(uuid[]) to authenticated;
