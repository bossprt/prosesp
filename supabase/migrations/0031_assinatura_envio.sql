-- 0031 — Envio para assinatura, aviso da ZapSign e vencimento do prazo

-- A esteira genérica não envia nem aprova assinatura: só as funções desta etapa.
delete from public.fase_transicoes
where (de, para) in (('averbado', 'aguardando_assinatura'), ('aguardando_assinatura', 'aguardando_pagamento'));

-- Contratos que chegaram a "aguardando assinatura" sem envio de verdade voltam para "averbado".
do $$
declare
  k public.contratos;
begin
  for k in select * from public.contratos c where c.fase = 'aguardando_assinatura'
           and not exists (select 1 from public.contrato_assinaturas a where a.contrato_id = c.id) loop
    perform public._registrar_mudanca(k, 'averbado', null, 'Volta para envio pela assinatura eletrônica');
  end loop;
end $$;

-- Confere tudo e cria o envio "preparando". Quem chama: Edge Function "assinatura", com o login do usuário.
create function public.assinatura_preparar(p_contrato_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
  cl public.clientes;
  cv public.convenios;
  md public.contrato_modelos;
  v_dados jsonb;
  v_id uuid;
begin
  if not public.app_equipe_pode('contratos.mover') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into k from public.contratos where id = p_contrato_id for update;
  if k.id is null or not public.contrato_visivel(p_contrato_id) then
    raise exception 'Contrato não encontrado.';
  end if;
  if k.fase <> 'averbado' then
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
  values (k.id, md.id, 'preparando', v_dados -> 'valores', current_date + cv.assinatura_prazo_dias)
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
revoke execute on function public.assinatura_preparar(uuid) from public, anon;
grant execute on function public.assinatura_preparar(uuid) to authenticated;

-- Documento criado na ZapSign: envio "enviado" e contrato em "aguardando assinatura".
create function public._assinatura_registrar_envio(p_id uuid, p_pdf_caminho text, p_zapsign_token text, p_assinantes jsonb)
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
  if k.fase <> 'averbado' then
    raise exception 'O contrato saiu da fase averbado durante o envio.';
  end if;
  update public.contrato_assinaturas set situacao = 'enviado', pdf_caminho = p_pdf_caminho,
    zapsign_token = p_zapsign_token, assinantes = p_assinantes, enviado_em = now()
  where id = p_id;
  perform public._registrar_mudanca(k, 'aguardando_assinatura', null, 'Enviado para assinatura');
end $$;

create function public._assinatura_falhou(p_id uuid, p_erro text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.contrato_assinaturas set situacao = 'falhou', erro = left(p_erro, 1000)
  where id = p_id and situacao = 'preparando';
end $$;

-- Aviso da ZapSign (já confirmado na própria ZapSign). Só age sobre envio "enviado"; repetido não muda nada.
create function public._assinatura_atualizar(p_zapsign_token text, p_situacao text, p_pdf_assinado_caminho text, p_evidencias jsonb)
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
  if a.situacao <> 'enviado' then
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

revoke execute on function public._assinatura_registrar_envio(uuid, text, text, jsonb), public._assinatura_falhou(uuid, text),
  public._assinatura_atualizar(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public._assinatura_registrar_envio(uuid, text, text, jsonb), public._assinatura_falhou(uuid, text),
  public._assinatura_atualizar(text, text, text, jsonb) to service_role;

-- Prazo vencido: o envio sai de "enviado" e aparece na lista para a equipe decidir.
create function public.assinaturas_vencer(p_hoje date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  update public.contrato_assinaturas set situacao = 'vencido' where situacao = 'enviado' and prazo < p_hoje;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.assinaturas_vencer(date) from public, anon, authenticated;

select cron.schedule('assinaturas-vencer', '0 5 * * *', $$select public.assinaturas_vencer(current_date)$$);
