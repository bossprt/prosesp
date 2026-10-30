-- 0033 — Reenvio do link de assinatura e validação do modelo sem salvar

alter table public.contrato_assinaturas
  add column reenvios integer not null default 0,
  add column ultimo_reenvio_em timestamptz;

-- Dados para reenviar o link (Edge Function "assinatura", com o login do usuário).
create function public.assinatura_para_reenviar(p_contrato_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.contrato_assinaturas;
  cl public.clientes;
  cv public.convenios;
begin
  if not public.app_equipe_pode('contratos.mover') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if not public.contrato_visivel(p_contrato_id) then
    raise exception 'Contrato não encontrado.';
  end if;
  select * into a from public.contrato_assinaturas where contrato_id = p_contrato_id and situacao = 'enviado';
  if a.id is null then
    raise exception 'Não há envio aguardando assinatura para reenviar.';
  end if;
  select c.* into cl from public.clientes c join public.contratos k on k.cliente_id = c.id where k.id = p_contrato_id;
  select v.* into cv from public.convenios v join public.contratos k on k.convenio_id = v.id where k.id = p_contrato_id;
  return jsonb_build_object(
    'assinatura_id', a.id, 'zapsign_token', a.zapsign_token, 'assinantes', coalesce(a.assinantes, '[]'::jsonb),
    'cliente', jsonb_build_object('nome', cl.nome, 'email', cl.email, 'celular', cl.celular),
    'canais', jsonb_build_object('email', cv.assinatura_email, 'whatsapp', cv.assinatura_whatsapp));
end $$;
revoke execute on function public.assinatura_para_reenviar(uuid) from public, anon;
grant execute on function public.assinatura_para_reenviar(uuid) to authenticated;

create function public._assinatura_reenviada(p_id uuid, p_assinantes jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.contrato_assinaturas set assinantes = coalesce(p_assinantes, assinantes),
    reenvios = reenvios + 1, ultimo_reenvio_em = now()
  where id = p_id and situacao = 'enviado';
end $$;
revoke execute on function public._assinatura_reenviada(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._assinatura_reenviada(uuid, jsonb) to service_role;

-- Prévia: confere os marcadores sem gravar nada.
create function public.validar_modelo_contrato(p_texto text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._modelo_validar(p_texto);
end $$;
revoke execute on function public.validar_modelo_contrato(text) from public, anon;
grant execute on function public.validar_modelo_contrato(text) to authenticated;
