-- 0034 — Correções da revisão da Etapa 4: enviar de novo, invalidação por edição, envio parado,
-- documento órfão na ZapSign, aviso atrasado e links de assinatura escondidos do parceiro.

-- Retrato completo do que vai no PDF (valores e composição): editar qualquer um invalida a assinatura.
create or replace function public._assinatura_valores(k public.contratos) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'valor_parcela', k.valor_parcela::text, 'prazo', k.prazo, 'valor_bruto', k.valor_bruto::text,
    'valor_liquido', k.valor_liquido::text, 'mensalidade_proposta', k.mensalidade_proposta::text,
    'tipo', k.tipo::text, 'matricula_id', k.matricula_id, 'vinculo_id', k.vinculo_id,
    'total_descontos', k.total_descontos::text, 'total_quitado', k.total_quitado::text,
    'total_dividas_externas', k.total_dividas_externas::text)
$$;

-- Envio novo: em "averbado" ou, depois de vencido/recusado/falho, ainda em "aguardando assinatura".
-- Envio parado em "preparando" há mais de 15 minutos é dado como falho.
create or replace function public.assinatura_preparar(p_contrato_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
  cl public.clientes;
  cv public.convenios;
  md public.contrato_modelos;
  v_dados jsonb;
  v_id uuid;
  v_ultima text;
begin
  if not public.app_equipe_pode('contratos.mover') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into k from public.contratos where id = p_contrato_id for update;
  if k.id is null or not public.contrato_visivel(p_contrato_id) then
    raise exception 'Contrato não encontrado.';
  end if;
  update public.contrato_assinaturas set situacao = 'falhou', erro = 'Envio interrompido antes de terminar.'
  where contrato_id = k.id and situacao = 'preparando' and criado_em < now() - interval '15 minutes';
  select situacao into v_ultima from public.contrato_assinaturas where contrato_id = k.id order by criado_em desc limit 1;
  if not (k.fase = 'averbado'
          or (k.fase = 'aguardando_assinatura' and v_ultima in ('vencido', 'recusado_cliente', 'falhou'))) then
    raise exception 'O contrato precisa estar averbado para enviar.';
  end if;
  if k.legado then
    raise exception 'Contrato importado do sistema anterior não é enviado para assinatura.';
  end if;
  if exists (select 1 from public.contrato_assinaturas
             where contrato_id = k.id and situacao in ('preparando', 'enviado', 'assinado')) then
    raise exception 'Este contrato já tem uma assinatura em andamento.';
  end if;
  select * into md from public.contrato_modelos where convenio_id = k.convenio_id and ativo;
  if md.id is null then
    raise exception 'Este convênio ainda não tem modelo de contrato.';
  end if;
  if md.teste and public.config_bool('ambiente_producao') then
    raise exception 'O modelo deste convênio é de teste e não pode ser usado em produção.';
  end if;
  select * into cl from public.clientes where id = k.cliente_id;
  select * into cv from public.convenios where id = k.convenio_id;
  if btrim(coalesce(cl.celular, '')) = '' then
    raise exception 'O cliente não tem celular cadastrado.';
  end if;
  if cv.assinatura_email and btrim(coalesce(cl.email, '')) = '' then
    raise exception 'O cliente não tem e-mail cadastrado.';
  end if;

  v_dados := public.contrato_dados_documento(k.id, current_date);
  insert into public.contrato_assinaturas (contrato_id, modelo_id, situacao, valores, prazo)
  values (k.id, md.id, 'preparando', public._assinatura_valores(k), current_date + cv.assinatura_prazo_dias)
  returning id into v_id;

  return jsonb_build_object(
    'assinatura_id', v_id,
    'contrato_numero', k.numero,
    'modelo', jsonb_build_object('texto', md.texto, 'teste', md.teste, 'versao', md.versao),
    'dados', v_dados,
    'config', jsonb_build_object('selfie', cv.assinatura_selfie, 'documento', cv.assinatura_documento,
                                 'codigo', cv.assinatura_codigo, 'email', cv.assinatura_email,
                                 'whatsapp', cv.assinatura_whatsapp, 'prazo', cv.assinatura_prazo_dias,
                                 'data_limite', current_date + cv.assinatura_prazo_dias),
    'assinantes', jsonb_build_array(jsonb_build_object('nome', cl.nome, 'email', cl.email, 'celular', cl.celular, 'papel', 'cliente'))
                  || coalesce((select jsonb_agg(jsonb_build_object('nome', a.nome, 'email', a.email, 'celular', a.celular, 'papel', a.papel)
                                                order by a.ordem, a.nome)
                               from public.convenio_assinantes a where a.convenio_id = k.convenio_id and a.ativo), '[]'::jsonb)
  );
end $$;

create or replace function public._assinatura_registrar_envio(p_id uuid, p_pdf_caminho text, p_zapsign_token text, p_assinantes jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.contrato_assinaturas;
  k public.contratos;
begin
  select * into a from public.contrato_assinaturas where id = p_id for update;
  if a.id is null or a.situacao <> 'preparando' then
    raise exception 'Este envio não está sendo preparado.';
  end if;
  select * into k from public.contratos where id = a.contrato_id for update;
  if k.fase not in ('averbado', 'aguardando_assinatura') then
    raise exception 'O contrato saiu da fase averbado durante o envio.';
  end if;
  if public._assinatura_valores(k) is distinct from a.valores then
    raise exception 'Os valores do contrato mudaram durante o envio.';
  end if;
  update public.contrato_assinaturas set situacao = 'enviado', pdf_caminho = p_pdf_caminho,
    zapsign_token = p_zapsign_token, assinantes = p_assinantes, enviado_em = now()
  where id = p_id;
  perform public._registrar_mudanca(k, 'aguardando_assinatura', null,
    case when k.fase = 'averbado' then 'Enviado para assinatura' else 'Enviado de novo para assinatura' end);
end $$;

-- Falha no envio. Se o documento já existe na ZapSign e não deu para apagar, guarda o token
-- e deixa na lista "Cancelar na ZapSign".
drop function public._assinatura_falhou(uuid, text);
create function public._assinatura_falhou(p_id uuid, p_erro text, p_zapsign_token text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_zapsign_token is not null then
    update public.contrato_assinaturas set situacao = 'cancelamento_pendente', zapsign_token = p_zapsign_token,
      cancelado_em = null, erro = left(p_erro, 1000)
    where id = p_id and zapsign_token is null and situacao in ('preparando', 'cancelado');
  else
    update public.contrato_assinaturas set situacao = 'falhou', erro = left(p_erro, 1000)
    where id = p_id and situacao = 'preparando';
  end if;
end $$;
revoke execute on function public._assinatura_falhou(uuid, text, text) from public, anon, authenticated;
grant execute on function public._assinatura_falhou(uuid, text, text) to service_role;

-- Aviso atrasado: assinatura feita no prazo mas avisada depois do vencimento ainda vale,
-- desde que seja o envio mais recente do contrato.
create or replace function public._assinatura_atualizar(p_zapsign_token text, p_situacao text, p_pdf_assinado_caminho text, p_evidencias jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  a public.contrato_assinaturas;
begin
  if p_situacao not in ('assinado', 'recusado_cliente') then
    raise exception 'Situação inválida: %.', p_situacao;
  end if;
  select * into a from public.contrato_assinaturas where zapsign_token = p_zapsign_token for update;
  if a.id is null then
    return null;
  end if;
  if not (a.situacao = 'enviado'
          or (a.situacao = 'vencido' and not exists (
                select 1 from public.contrato_assinaturas b where b.contrato_id = a.contrato_id and b.criado_em > a.criado_em))) then
    return a.situacao;
  end if;
  update public.contrato_assinaturas set situacao = p_situacao,
    assinado_em = case when p_situacao = 'assinado' then now() end,
    pdf_assinado_caminho = case when p_situacao = 'assinado' then p_pdf_assinado_caminho end
  where id = a.id;
  if p_evidencias is not null and p_evidencias <> '{}'::jsonb then
    insert into public.contrato_assinatura_evidencias (assinatura_id, dados) values (a.id, p_evidencias)
    on conflict (assinatura_id) do update set dados = excluded.dados;
  end if;
  return p_situacao;
end $$;

-- Edição que muda o conteúdo do PDF invalida qualquer assinatura (em preparo, enviada, assinada ou aprovada).
-- Em "aguardando assinatura/pagamento" volta para averbado; em pendência, volta para averbado ao sair dela.
create or replace function public.editar_contrato(p_id uuid, p_dados jsonb, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_antes jsonb;
  k public.contratos;
begin
  select public._assinatura_valores(c) into v_antes from public.contratos c where c.id = p_id;
  perform public._editar_contrato_interno(p_id, p_dados, p_motivo);
  select * into k from public.contratos where id = p_id for update;
  if public._assinatura_valores(k) is not distinct from v_antes then
    return;
  end if;
  perform public._assinatura_cancelar_aberta(k.id, true);
  if k.fase in ('aguardando_assinatura', 'aguardando_pagamento') then
    perform public._registrar_mudanca(k, 'averbado', null, 'Valores alterados: nova assinatura necessária');
  elsif k.fase = 'pendente' and k.fase_retorno in ('aguardando_assinatura', 'aguardando_pagamento') then
    update public.contratos set fase_retorno = 'averbado' where id = k.id;
  end if;
end $$;

-- Parceiro (e a tela) não leem os links de assinatura nem o token da ZapSign: só as Edge Functions.
revoke select on public.contrato_assinaturas from authenticated;
grant select (id, contrato_id, modelo_id, situacao, valores, pdf_caminho, pdf_assinado_caminho, prazo, erro,
              enviado_por, enviado_em, assinado_em, conferido_por, conferido_em, cancelado_em, criado_em,
              reenvios, ultimo_reenvio_em)
  on public.contrato_assinaturas to authenticated;
