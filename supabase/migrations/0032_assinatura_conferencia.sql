-- 0032 — Conferência da assinatura, cancelamento (pendente, recusa, edição de valores) e listas

-- Retrato dos valores que vão no PDF (mesmas chaves de contrato_dados_documento -> 'valores').
create function public._assinatura_valores(k public.contratos) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'valor_parcela', k.valor_parcela::text, 'prazo', k.prazo, 'valor_bruto', k.valor_bruto::text,
    'valor_liquido', k.valor_liquido::text, 'mensalidade_proposta', k.mensalidade_proposta::text)
$$;
revoke execute on function public._assinatura_valores(public.contratos) from public, anon, authenticated;

-- Invalida a assinatura do contrato. Link ainda no ar (enviado) → pedir cancelamento na ZapSign;
-- já assinado (ou aprovado, se p_incluir_aprovado) ou sem documento criado → cancelado aqui mesmo.
create function public._assinatura_cancelar_aberta(p_contrato_id uuid, p_incluir_aprovado boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.contrato_assinaturas set
    situacao = case when situacao = 'enviado' and zapsign_token is not null then 'cancelamento_pendente' else 'cancelado' end,
    cancelado_em = case when situacao = 'enviado' and zapsign_token is not null then null else now() end
  where contrato_id = p_contrato_id
    and (situacao in ('preparando', 'enviado', 'assinado') or (p_incluir_aprovado and situacao = 'aprovado'));
end $$;
revoke execute on function public._assinatura_cancelar_aberta(uuid, boolean) from public, anon, authenticated;

-- Pendente/recusa cancelam a assinatura em aberto; pendente durante a assinatura volta para "averbado".
create or replace function public._registrar_mudanca(
  p_contrato public.contratos, p_para public.fase_contrato, p_situacao public.situacao_contrato, p_motivo text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_para in ('pendente', 'recusado') then
    perform public._assinatura_cancelar_aberta(p_contrato.id, false);
  end if;
  update public.contratos set
    fase = p_para,
    fase_desde = case when p_para is distinct from p_contrato.fase then now() else fase_desde end,
    situacao = coalesce(p_situacao, situacao),
    fase_retorno = case when p_para <> 'pendente' then null
                        when p_contrato.fase = 'aguardando_assinatura' then 'averbado'
                        else p_contrato.fase end,
    valores_travados_em = case when p_para = 'em_averbacao' then coalesce(valores_travados_em, now())
                               else valores_travados_em end
  where id = p_contrato.id;
  insert into public.contrato_eventos (contrato_id, de, para, situacao_de, situacao_para, motivo)
  values (p_contrato.id, p_contrato.fase, p_para, p_contrato.situacao, coalesce(p_situacao, p_contrato.situacao),
          nullif(btrim(p_motivo), ''));
end $$;

-- Edição: valores mudaram durante a assinatura (ou depois de aprovada) → nova assinatura.
alter function public.editar_contrato(uuid, jsonb, text) rename to _editar_contrato_interno;
revoke execute on function public._editar_contrato_interno(uuid, jsonb, text) from public, anon, authenticated;

create function public.editar_contrato(p_id uuid, p_dados jsonb, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_antes jsonb;
  k public.contratos;
begin
  select public._assinatura_valores(c) into v_antes from public.contratos c where c.id = p_id;
  perform public._editar_contrato_interno(p_id, p_dados, p_motivo);
  select * into k from public.contratos where id = p_id for update;
  if k.fase in ('aguardando_assinatura', 'aguardando_pagamento') and public._assinatura_valores(k) is distinct from v_antes then
    perform public._assinatura_cancelar_aberta(k.id, true);
    perform public._registrar_mudanca(k, 'averbado', null, 'Valores alterados: nova assinatura necessária');
  end if;
end $$;
revoke execute on function public.editar_contrato(uuid, jsonb, text) from public, anon;
grant execute on function public.editar_contrato(uuid, jsonb, text) to authenticated;

-- Conferência manual: só com envio assinado e valores iguais aos do PDF.
create function public.aprovar_assinatura(p_contrato_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
  a public.contrato_assinaturas;
begin
  if not public.app_equipe_pode('contratos.mover') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into k from public.contratos where id = p_contrato_id for update;
  if k.id is null or not public.contrato_visivel(p_contrato_id) then
    raise exception 'Contrato não encontrado.';
  end if;
  select * into a from public.contrato_assinaturas where contrato_id = k.id and situacao = 'assinado' for update;
  if a.id is null or k.fase <> 'aguardando_assinatura' then
    raise exception 'Não há assinatura para conferir.';
  end if;
  if public._assinatura_valores(k) is distinct from a.valores then
    raise exception 'Os valores do contrato mudaram depois do envio. Envie de novo.';
  end if;
  update public.contrato_assinaturas set situacao = 'aprovado', conferido_por = auth.uid(), conferido_em = now()
  where id = a.id;
  perform public._registrar_mudanca(k, 'aguardando_pagamento', null, 'Assinatura conferida');
end $$;
revoke execute on function public.aprovar_assinatura(uuid) from public, anon;
grant execute on function public.aprovar_assinatura(uuid) to authenticated;

-- Resultado do pedido de cancelamento na ZapSign (Edge Function).
create function public._assinatura_cancelamento_feito(p_id uuid, p_ok boolean, p_erro text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.contrato_assinaturas set
    situacao = case when p_ok then 'cancelado' else situacao end,
    cancelado_em = case when p_ok then now() else cancelado_em end,
    erro = case when p_ok then null else left(p_erro, 1000) end
  where id = p_id and situacao = 'cancelamento_pendente';
end $$;
revoke execute on function public._assinatura_cancelamento_feito(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public._assinatura_cancelamento_feito(uuid, boolean, text) to service_role;

-- Listas da tela "Assinaturas" (só o envio mais recente de cada contrato).
create function public.assinaturas_lista(p_tipo text) returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_situacao text;
begin
  if not public.app_equipe_pode('contratos.ver') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  v_situacao := case p_tipo when 'conferir' then 'assinado' when 'vencidas' then 'vencido'
                            when 'recusadas' then 'recusado_cliente' when 'cancelar' then 'cancelamento_pendente' end;
  if v_situacao is null then
    raise exception 'Lista inválida.';
  end if;
  return query
  select jsonb_build_object(
    'assinatura_id', a.id, 'contrato_id', k.id, 'contrato_numero', k.numero, 'fase', k.fase,
    'cliente', cl.nome, 'cpf', cl.cpf, 'convenio', cv.nome, 'situacao', a.situacao,
    'enviado_em', a.enviado_em, 'assinado_em', a.assinado_em, 'prazo', a.prazo, 'erro', a.erro)
  from public.contrato_assinaturas a
  join public.contratos k on k.id = a.contrato_id
  join public.clientes cl on cl.id = k.cliente_id
  join public.convenios cv on cv.id = k.convenio_id
  where a.situacao = v_situacao
    and (v_situacao = 'cancelamento_pendente' or not exists (
      select 1 from public.contrato_assinaturas b where b.contrato_id = a.contrato_id and b.criado_em > a.criado_em))
  order by coalesce(a.assinado_em, a.enviado_em, a.criado_em);
end $$;
revoke execute on function public.assinaturas_lista(text) from public, anon;
grant execute on function public.assinaturas_lista(text) to authenticated;
