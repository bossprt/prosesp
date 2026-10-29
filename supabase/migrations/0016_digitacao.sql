-- 0016 — Digitação, pré-digitação e edição de contratos
-- Os valores vêm da simulação na tabela vigente e ficam congelados no contrato (fotografia).

-- Provisória: a 0019 substitui pela mensalidade real da matrícula.
create function public.mensalidade_vigente(p_matricula_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select 0::numeric
$$;
revoke execute on function public.mensalidade_vigente(uuid) from public, anon;

create function public._exigir_cliente_para_contrato(p_cliente_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_falta text[];
begin
  select array_remove(array[
           case when c.data_nascimento is null then 'data de nascimento' end,
           case when btrim(coalesce(c.email, '')) = '' then 'e-mail' end
         ], null)
  into v_falta
  from public.clientes c where c.id = p_cliente_id;
  if v_falta is null then
    raise exception 'Cliente não encontrado.';
  end if;
  if cardinality(v_falta) > 0 then
    raise exception 'Para digitar o contrato, complete no cadastro: %.', array_to_string(v_falta, ', ');
  end if;
end $$;

-- Simula na tabela vigente e devolve a fotografia de valores.
create function public._calcular_contrato(p_dados jsonb, p_gravar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_convenio uuid;
  v_vinculo uuid;
  v_nasc date;
  v_tipo public.tipo_contrato := (p_dados->>'tipo')::public.tipo_contrato;
  v_prazo integer := (p_dados->>'prazo')::integer;
  v_quantia numeric := (p_dados->>'quantia')::numeric;
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

-- Descontos, quitações e dívidas externas; recalcula os totais do contrato.
create function public._aplicar_satelites(p_contrato_id uuid, p_dados jsonb) returns void
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
    values (k.id, (d->>'tipo_desconto_id')::uuid, (d->>'valor')::numeric);
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
    insert into public.contrato_quitacoes (contrato_id, contrato_quitado_id, saldo_devedor, fonte, observacao)
    values (k.id, v_quitado.id, (q->>'saldo_devedor')::numeric, q->>'fonte', nullif(q->>'observacao', ''));
  end loop;

  if k.tipo <> 'compra' and jsonb_array_length(coalesce(p_dados->'dividas_externas', '[]'::jsonb)) > 0 then
    raise exception 'Dívidas em outro banco só existem em contrato de compra.';
  end if;
  for d in select * from jsonb_array_elements(coalesce(p_dados->'dividas_externas', '[]'::jsonb)) loop
    insert into public.contrato_dividas_externas (contrato_id, credor, numero_contrato_externo, saldo, favorecido, observacao)
    values (k.id, d->>'credor', nullif(d->>'numero_contrato_externo', ''), (d->>'saldo')::numeric,
            nullif(d->>'favorecido', ''), nullif(d->>'observacao', ''));
  end loop;

  update public.contratos set
    total_descontos = coalesce((select sum(valor) from public.contrato_descontos where contrato_id = k.id), 0),
    total_quitado = coalesce((select sum(saldo_devedor) from public.contrato_quitacoes where contrato_id = k.id), 0),
    total_dividas_externas = coalesce((select sum(saldo) from public.contrato_dividas_externas where contrato_id = k.id), 0)
  where id = k.id;
end $$;

-- Grava a fotografia atual como versão (dados + comissão separada).
create function public._gravar_versao(p_contrato_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
begin
  select * into k from public.contratos where id = p_contrato_id;
  insert into public.contrato_versoes (contrato_id, versao, dados, motivo)
  values (k.id, k.versao, to_jsonb(k) || jsonb_build_object(
            'descontos', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.contrato_descontos x where x.contrato_id = k.id),
            'quitacoes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.contrato_quitacoes x where x.contrato_id = k.id),
            'dividas_externas', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.contrato_dividas_externas x where x.contrato_id = k.id)),
          p_motivo);
  insert into public.contrato_versoes_comissao (contrato_id, versao, percentual, base)
  select k.id, k.versao, r.percentual, r.base from public.contrato_comissao_regra r where r.contrato_id = k.id;
end $$;

create function public._gravar_comissao(p_contrato_id uuid, p_calc jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.contrato_comissao_regra where contrato_id = p_contrato_id;
  if p_calc->>'percentual' is not null then
    insert into public.contrato_comissao_regra (contrato_id, percentual, base)
    values (p_contrato_id, (p_calc->>'percentual')::numeric, (p_calc->>'base')::public.base_comissao);
  end if;
end $$;

-- Cria o contrato a partir dos dados (comum à digitação e à pré-digitação).
create function public._criar_contrato(p_dados jsonb, p_fase public.fase_contrato, p_parceiro_id uuid, p_gravar boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_calc jsonb;
  v_id uuid;
  v_mensalidade numeric;
begin
  perform public._exigir_cliente_para_contrato((p_dados->>'cliente_id')::uuid);
  v_calc := public._calcular_contrato(p_dados, p_gravar);
  v_mensalidade := (v_calc->>'valor_mensalidade_tabela')::numeric;

  insert into public.contratos (
    cliente_id, matricula_id, tipo, parceiro_id, agente_id, origem_id, fase,
    linha_tabela_id, fator, prazo, valor_parcela, valor_bruto, valor_mensalidade_tabela, mensalidade_proposta)
  values (
    (p_dados->>'cliente_id')::uuid, (p_dados->>'matricula_id')::uuid, (p_dados->>'tipo')::public.tipo_contrato,
    p_parceiro_id, (nullif(p_dados->>'agente_id', ''))::uuid, (nullif(p_dados->>'origem_id', ''))::uuid, p_fase,
    (v_calc->>'linha_tabela_id')::uuid, (v_calc->>'fator')::numeric, (v_calc->>'prazo')::integer,
    (v_calc->>'valor_parcela')::numeric, (v_calc->>'valor_bruto')::numeric, v_mensalidade,
    case when v_mensalidade > public.mensalidade_vigente((p_dados->>'matricula_id')::uuid) then v_mensalidade end)
  returning id into v_id;

  perform public._gravar_comissao(v_id, v_calc);
  perform public._aplicar_satelites(v_id, p_dados);
  perform public._gravar_versao(v_id, null);
  insert into public.contrato_eventos (contrato_id, de, para, situacao_para) values (v_id, null, p_fase, 'em_andamento');
  return v_id;
end $$;

create function public.digitar_contrato(p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_equipe_pode('contratos.digitar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  return public._criar_contrato(p_dados, 'digitado', (nullif(p_dados->>'parceiro_id', ''))::uuid, true);
end $$;

create function public.pre_digitar_contrato(p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_parceiro uuid := public._exigir_parceiro('contratos.digitar');
begin
  if not public.parceiro_ve_cliente((p_dados->>'cliente_id')::uuid) then
    raise exception 'Busque o cliente por CPF e matrícula antes de pré-digitar.';
  end if;
  -- simulação sem gravar: o parceiro não trava linhas de tabela
  return public._criar_contrato(p_dados, 'pre_digitacao', v_parceiro, false);
end $$;

create function public.editar_contrato(p_id uuid, p_dados jsonb, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
  v_parceiro uuid := public.app_parceiro_id();
  v_calc jsonb;
  v_mensalidade numeric;
begin
  select * into k from public.contratos where id = p_id for update;
  if k.id is null or not public.contrato_visivel(p_id) then
    raise exception 'Contrato não encontrado.';
  end if;
  if k.fase in ('credito_liberado', 'recusado', 'cancelado') then
    raise exception 'Este contrato não pode mais ser editado.';
  end if;

  if v_parceiro is not null then
    if k.parceiro_id is distinct from v_parceiro or k.fase <> 'pre_digitacao' or not public.app_pode('contratos.digitar') then
      raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
    end if;
  elsif k.valores_travados_em is not null then
    if not public.app_equipe_pode('contratos.editar_averbado') then
      raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
    end if;
    if btrim(coalesce(p_motivo, '')) = '' then
      raise exception 'Informe o motivo da edição de um contrato já averbado.';
    end if;
  else
    if not public.app_equipe_pode('contratos.digitar') then
      raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
    end if;
  end if;

  if (p_dados->>'cliente_id')::uuid is distinct from k.cliente_id then
    raise exception 'O cliente do contrato não pode ser trocado. Recuse e digite um novo contrato.';
  end if;

  perform public._exigir_cliente_para_contrato(k.cliente_id);
  v_calc := public._calcular_contrato(p_dados, v_parceiro is null);
  v_mensalidade := (v_calc->>'valor_mensalidade_tabela')::numeric;

  update public.contratos set
    matricula_id = (p_dados->>'matricula_id')::uuid,
    tipo = (p_dados->>'tipo')::public.tipo_contrato,
    agente_id = (nullif(p_dados->>'agente_id', ''))::uuid,
    origem_id = (nullif(p_dados->>'origem_id', ''))::uuid,
    linha_tabela_id = (v_calc->>'linha_tabela_id')::uuid,
    fator = (v_calc->>'fator')::numeric,
    prazo = (v_calc->>'prazo')::integer,
    valor_parcela = (v_calc->>'valor_parcela')::numeric,
    valor_bruto = (v_calc->>'valor_bruto')::numeric,
    total_descontos = 0, total_quitado = 0, total_dividas_externas = 0,
    valor_mensalidade_tabela = v_mensalidade,
    mensalidade_proposta = case when v_mensalidade > public.mensalidade_vigente((p_dados->>'matricula_id')::uuid)
                                then v_mensalidade end,
    versao = versao + 1
  where id = p_id;

  perform public._gravar_comissao(p_id, v_calc);
  perform public._aplicar_satelites(p_id, p_dados);
  perform public._gravar_versao(p_id, nullif(btrim(p_motivo), ''));
  insert into public.contrato_eventos (contrato_id, de, para, motivo)
  values (p_id, k.fase, k.fase, coalesce(nullif(btrim(p_motivo), ''), 'Contrato editado'));
end $$;

revoke execute on function
  public._exigir_cliente_para_contrato(uuid), public._calcular_contrato(jsonb, boolean),
  public._aplicar_satelites(uuid, jsonb), public._gravar_versao(uuid, text),
  public._gravar_comissao(uuid, jsonb), public._criar_contrato(jsonb, public.fase_contrato, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.digitar_contrato(jsonb), public.pre_digitar_contrato(jsonb),
  public.editar_contrato(uuid, jsonb, text) from public, anon;
grant execute on function public.digitar_contrato(jsonb), public.pre_digitar_contrato(jsonb),
  public.editar_contrato(uuid, jsonb, text) to authenticated;
