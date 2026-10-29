-- 0021 — Correções da revisão da Etapa 2 (code-review + Codex)

-- 1. Desde quando o contrato está na fase (a esteira não precisa baixar todos os eventos)
alter table public.contratos add column fase_desde timestamptz not null default now();

create or replace function public._registrar_mudanca(
  p_contrato public.contratos, p_para public.fase_contrato, p_situacao public.situacao_contrato, p_motivo text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.contratos set
    fase = p_para,
    fase_desde = case when p_para is distinct from p_contrato.fase then now() else fase_desde end,
    situacao = coalesce(p_situacao, situacao),
    fase_retorno = case when p_para = 'pendente' then p_contrato.fase else null end,
    valores_travados_em = case when p_para = 'em_averbacao' then coalesce(valores_travados_em, now())
                               else valores_travados_em end
  where id = p_contrato.id;
  insert into public.contrato_eventos (contrato_id, de, para, situacao_de, situacao_para, motivo)
  values (p_contrato.id, p_contrato.fase, p_para, p_contrato.situacao, coalesce(p_situacao, p_contrato.situacao),
          nullif(btrim(p_motivo), ''));
end $$;

-- 2. Dinheiro vindo do app: recusa texto inválido, NaN e infinito
create function public._dinheiro(p text) returns numeric
language plpgsql immutable set search_path = '' as $$
declare
  v numeric;
begin
  if p is null or btrim(p) = '' then
    return null;
  end if;
  begin
    v := btrim(p)::numeric;
  exception when others then
    raise exception 'Valor inválido: %.', p;
  end;
  if v = 'NaN'::numeric or v = 'Infinity'::numeric or v = '-Infinity'::numeric then
    raise exception 'Valor inválido: %.', p;
  end if;
  return v;
end $$;
revoke execute on function public._dinheiro(text) from public, anon, authenticated;

create or replace function public._calcular_contrato(p_dados jsonb, p_gravar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_convenio uuid;
  v_vinculo uuid;
  v_nasc date;
  v_tipo public.tipo_contrato := (p_dados->>'tipo')::public.tipo_contrato;
  v_prazo integer := (p_dados->>'prazo')::integer;
  v_quantia numeric := public._dinheiro(p_dados->>'quantia');
  r record;
begin
  select m.convenio_id, m.vinculo_id into v_convenio, v_vinculo
  from public.cliente_matriculas m
  where m.id = (p_dados->>'matricula_id')::uuid and m.cliente_id = (p_dados->>'cliente_id')::uuid and m.ativa;
  if v_convenio is null then
    raise exception 'A matrícula não pertence a este cliente ou está inativa.';
  end if;
  select c.data_nascimento into v_nasc from public.clientes c where c.id = (p_dados->>'cliente_id')::uuid;

  if coalesce(p_dados->>'modo', 'valor') = 'valor' then
    select * into r from public.simular_por_valor(v_convenio, v_vinculo, v_tipo, v_prazo, v_quantia, v_nasc, current_date, p_gravar);
  else
    select * into r from public.simular_por_parcela(v_convenio, v_vinculo, v_tipo, v_prazo, v_quantia, v_nasc, current_date, p_gravar);
  end if;

  return jsonb_build_object(
    'linha_tabela_id', r.linha_id, 'fator', r.fator, 'prazo', v_prazo,
    'valor_parcela', r.parcela, 'valor_bruto', r.valor,
    'valor_mensalidade_tabela', r.valor_mensalidade,
    'percentual', r.percentual_comissao, 'base', r.base_comissao);
end $$;

create or replace function public._aplicar_satelites(p_contrato_id uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
  q jsonb;
  d jsonb;
  v_quitado public.contratos;
begin
  select * into k from public.contratos where id = p_contrato_id;

  delete from public.contrato_descontos where contrato_id = k.id;
  delete from public.contrato_quitacoes where contrato_id = k.id;
  delete from public.contrato_dividas_externas where contrato_id = k.id;

  for d in select * from jsonb_array_elements(coalesce(p_dados->'descontos', '[]'::jsonb)) loop
    insert into public.contrato_descontos (contrato_id, tipo_desconto_id, valor)
    values (k.id, (d->>'tipo_desconto_id')::uuid, public._dinheiro(d->>'valor'));
  end loop;

  if k.tipo <> 'refinanciamento' and jsonb_array_length(coalesce(p_dados->'quitacoes', '[]'::jsonb)) > 0 then
    raise exception 'Contrato novo não quita outros contratos. Use refinanciamento.';
  end if;
  if k.tipo = 'refinanciamento' and jsonb_array_length(coalesce(p_dados->'quitacoes', '[]'::jsonb)) = 0 then
    raise exception 'Refinanciamento precisa de ao menos um contrato a quitar.';
  end if;
  for q in select * from jsonb_array_elements(coalesce(p_dados->'quitacoes', '[]'::jsonb)) loop
    select * into v_quitado from public.contratos x
    where x.id = (q->>'contrato_quitado_id')::uuid
      and x.cliente_id = k.cliente_id and x.matricula_id = k.matricula_id
      and x.situacao in ('ativo', 'em_atraso');
    if v_quitado.id is null then
      raise exception 'Só é possível quitar contratos ativos do mesmo cliente e matrícula.';
    end if;
    if exists (select 1 from public.contrato_quitacoes x where x.contrato_quitado_id = v_quitado.id and x.reservado) then
      raise exception 'Este contrato já está sendo quitado por outro refinanciamento.';
    end if;
    begin
      insert into public.contrato_quitacoes (contrato_id, contrato_quitado_id, saldo_devedor, fonte, observacao)
      values (k.id, v_quitado.id, public._dinheiro(q->>'saldo_devedor'), q->>'fonte', nullif(q->>'observacao', ''));
    exception when unique_violation then
      -- outro refinanciamento reservou o mesmo contrato ao mesmo tempo
      raise exception 'Este contrato já está sendo quitado por outro refinanciamento.';
    end;
  end loop;

  if k.tipo <> 'compra' and jsonb_array_length(coalesce(p_dados->'dividas_externas', '[]'::jsonb)) > 0 then
    raise exception 'Dívidas em outro banco só existem em contrato de compra.';
  end if;
  for d in select * from jsonb_array_elements(coalesce(p_dados->'dividas_externas', '[]'::jsonb)) loop
    insert into public.contrato_dividas_externas (contrato_id, credor, numero_contrato_externo, saldo, favorecido, observacao)
    values (k.id, d->>'credor', nullif(d->>'numero_contrato_externo', ''), public._dinheiro(d->>'saldo'),
            nullif(d->>'favorecido', ''), nullif(d->>'observacao', ''));
  end loop;

  update public.contratos set
    total_descontos = coalesce((select sum(valor) from public.contrato_descontos where contrato_id = k.id), 0),
    total_quitado = coalesce((select sum(saldo_devedor) from public.contrato_quitacoes where contrato_id = k.id), 0),
    total_dividas_externas = coalesce((select sum(saldo) from public.contrato_dividas_externas where contrato_id = k.id), 0)
  where id = k.id;
end $$;

-- 3. Mudança de matrícula num contrato averbado também precisa de ajuste na averbadora
create or replace function public.trg_contrato_ajustar_averbadora() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.valores_travados_em is not null and (
       new.valor_parcela is distinct from old.valor_parcela
    or new.prazo is distinct from old.prazo
    or new.valor_bruto is distinct from old.valor_bruto
    or (new.matricula_id is distinct from old.matricula_id
        -- migrar_matricula já cria a averbação nova na matrícula nova
        and not exists (select 1 from public.contrato_averbacoes a
                        where a.contrato_id = new.id and a.situacao = 'ativa' and a.matricula_id = new.matricula_id))) then
    insert into public.pendencias_averbadora (tipo, contrato_id, averbacao_id, motivo)
    values ('ajustar', new.id,
            (select a.id from public.contrato_averbacoes a where a.contrato_id = new.id and a.situacao = 'ativa'),
            format('Contrato alterado depois de averbado: parcela %s → %s, prazo %s → %s%s',
                   old.valor_parcela, new.valor_parcela, old.prazo, new.prazo,
                   case when new.matricula_id is distinct from old.matricula_id then ', matrícula trocada' else '' end));
  end if;
  return null;
end $$;

-- 4. Averbação só em contratos vivos
create or replace function public._contrato_para_averbacao(p_id uuid) returns public.contratos
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
begin
  if not public.app_equipe_pode('contratos.mover') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into k from public.contratos where id = p_id for update;
  if k.id is null then
    raise exception 'Contrato não encontrado.';
  end if;
  if k.situacao not in ('em_andamento', 'ativo', 'em_atraso') or k.fase in ('recusado', 'cancelado') then
    raise exception 'Este contrato não aceita mudança de averbação na situação atual.';
  end if;
  return k;
end $$;

-- 5. ADE: serializa a mesma chave (convênio + ADE) para não duplicar entre contrato e mensalidade
create or replace function public._validar_ade(p_convenio_id uuid, p_ade text, p_confirmacao text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ade text := btrim(coalesce(p_ade, ''));
  cv public.convenios;
begin
  select * into cv from public.convenios where id = p_convenio_id;
  if v_ade = '' then
    raise exception 'Informe o ADE.';
  end if;
  if cv.ade_modo = 'seguro' and v_ade is distinct from btrim(coalesce(p_confirmacao, '')) then
    raise exception 'As duas digitações do ADE não são iguais.';
  end if;
  if cv.ade_regex is not null and v_ade !~ cv.ade_regex then
    raise exception 'ADE fora do formato do convênio: %.', coalesce(cv.ade_descricao, cv.ade_regex);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_convenio_id::text || ':' || v_ade, 0));
  if exists (select 1 from public.contrato_averbacoes a where a.convenio_id = p_convenio_id and a.ade = v_ade and a.situacao <> 'cancelada')
     or exists (select 1 from public.mensalidade_averbacoes a where a.convenio_id = p_convenio_id and a.ade = v_ade and a.situacao <> 'cancelada') then
    raise exception 'Este ADE já está em uso neste convênio.';
  end if;
  return v_ade;
end $$;

-- 6. Liberação: confere ajustes, ADE da mensalidade e os contratos quitados (depois do lock)
create or replace function public.liberar_credito(p_id uuid, p_data date default current_date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
  v_comp date;
  v_dia smallint;
  v_averbacao uuid;
  v_quitado public.contratos;
  v_prop public.mensalidade_averbacoes;
  q record;
begin
  if not public.app_equipe_pode('contratos.liberar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into k from public.contratos where id = p_id for update;
  if k.id is null then
    raise exception 'Contrato não encontrado.';
  end if;
  if k.fase = 'credito_liberado' then
    raise exception 'Este crédito já foi liberado.';
  end if;
  if k.fase <> 'aguardando_pagamento' then
    raise exception 'Só é possível liberar contratos aguardando pagamento.';
  end if;
  if exists (select 1 from public.pendencias_averbadora pa where pa.contrato_id = k.id and pa.tipo = 'ajustar' and pa.resolvida_em is null) then
    raise exception 'Há ajuste pendente na averbadora para este contrato. Resolva antes de liberar.';
  end if;
  if k.mensalidade_proposta is not null then
    select * into v_prop from public.mensalidade_averbacoes
    where contrato_origem_id = k.id and situacao = 'proposta' for update;
    if v_prop.id is null then
      raise exception 'Falta registrar o ADE da mensalidade deste contrato.';
    end if;
    if v_prop.valor_averbado <> k.mensalidade_proposta then
      raise exception 'O ADE da mensalidade foi registrado com outro valor. Cancele-o na averbadora e registre de novo.';
    end if;
  end if;

  v_comp := public.primeira_competencia(k.convenio_id, p_data);
  select dia_vencimento into v_dia from public.convenios where id = k.convenio_id;
  select id into v_averbacao from public.contrato_averbacoes where contrato_id = k.id and situacao = 'ativa';

  insert into public.parcelas (contrato_id, numero, competencia, vencimento, valor, averbacao_id)
  select k.id, n, (v_comp + make_interval(months => n - 1))::date,
         make_date(extract(year from v_comp + make_interval(months => n - 1))::int,
                   extract(month from v_comp + make_interval(months => n - 1))::int, v_dia),
         k.valor_parcela, v_averbacao
  from generate_series(1, k.prazo) n;

  for q in select x.* from public.contrato_quitacoes x where x.contrato_id = k.id and x.reservado loop
    select * into v_quitado from public.contratos where id = q.contrato_quitado_id for update;
    if v_quitado.situacao not in ('ativo', 'em_atraso')
       or v_quitado.cliente_id <> k.cliente_id or v_quitado.matricula_id <> k.matricula_id then
      raise exception 'O contrato nº % que seria quitado não está mais ativo nesta matrícula. Revise o refinanciamento.', v_quitado.numero;
    end if;
    update public.parcelas set status = 'cancelada'
    where contrato_id = v_quitado.id and competencia >= v_comp and status in ('aberta', 'parcial', 'atrasada');
    update public.contrato_averbacoes set situacao = 'cancelada' where contrato_id = v_quitado.id and situacao = 'ativa';
    update public.contratos set situacao = 'renovado' where id = v_quitado.id;
    insert into public.contrato_eventos (contrato_id, situacao_de, situacao_para, motivo)
    values (v_quitado.id, v_quitado.situacao, 'renovado', 'Quitado pelo refinanciamento nº ' || k.numero);
    update public.contrato_quitacoes set reservado = false where id = q.id;
  end loop;

  perform public._mensalidade_na_liberacao(k, v_comp);

  update public.contratos set data_liberacao = p_data,
    primeiro_vencimento = (select min(vencimento) from public.parcelas where contrato_id = k.id)
  where id = k.id;
  perform public._registrar_mudanca(k, 'credito_liberado', 'ativo', 'Crédito liberado em ' || to_char(p_data, 'DD/MM/YYYY'));
end $$;

-- 7. Mensalidade de uma matrícula só pelas telas da equipe (função interna)
revoke execute on function public.mensalidade_vigente(uuid) from authenticated;
