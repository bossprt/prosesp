-- 0027 — Desfazer uma importação enquanto nenhuma pessoa mexeu no que ela criou

create function public.desfazer_importacao(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  imp public.importacoes;
  v text;
begin
  perform public.app_exigir('importacao.executar');
  select * into imp from public.importacoes where id = p_id for update;
  if imp.id is null or imp.situacao <> 'gravada' then
    raise exception 'Esta importação não pode ser desfeita.';
  end if;
  perform pg_advisory_xact_lock(hashtext('importacao'));

  -- contratos: edição, evento feito depois, pagamento fora do legado, averbação/pendência nova, quitação por contrato de fora
  select k.numero_legado into v from public.contratos k
  where k.importacao_id = p_id and (
       k.versao > 1
    or (select count(*) from public.contrato_eventos e where e.contrato_id = k.id) > 1
    or exists (select 1 from public.parcelas p join public.parcela_pagamentos g on g.parcela_id = p.id
               where p.contrato_id = k.id and g.origem <> 'legado')
    or exists (select 1 from public.contrato_averbacoes a where a.contrato_id = k.id and a.importacao_id is distinct from p_id)
    or exists (select 1 from public.pendencias_averbadora x where x.contrato_id = k.id)
    or exists (select 1 from public.contrato_quitacoes q join public.contratos n on n.id = q.contrato_id
               where q.contrato_quitado_id = k.id and n.importacao_id is distinct from p_id))
  limit 1;
  if v is not null then
    raise exception 'Não dá para desfazer: o contrato antigo nº % já foi alterado.', v;
  end if;

  -- mensalidades: valor novo, cancelamento depois, parcela paga, averbação de fora
  select cm.matricula into v from public.mensalidades m join public.cliente_matriculas cm on cm.id = m.matricula_id
  where m.importacao_id = p_id and (
       exists (select 1 from public.mensalidade_valores x where x.mensalidade_id = m.id and x.criado_em > imp.concluida_em)
    or m.cancelada_em > imp.concluida_em
    or exists (select 1 from public.mensalidade_parcelas x where x.mensalidade_id = m.id and x.status in ('paga', 'parcial'))
    or exists (select 1 from public.mensalidade_averbacoes a where a.mensalidade_id = m.id and a.importacao_id is distinct from p_id))
  limit 1;
  if v is not null then
    raise exception 'Não dá para desfazer: a mensalidade da matrícula % já foi alterada.', v;
  end if;

  -- clientes e matrículas criados: alterados ou usados por algo de fora da importação
  select c.cpf into v from public.clientes c
  where (c.importacao_id = p_id and (
           c.atualizado_em > imp.concluida_em
        or exists (select 1 from public.cliente_contas x where x.cliente_id = c.id)
        or exists (select 1 from public.cliente_beneficiarios x where x.cliente_id = c.id)
        or exists (select 1 from public.cliente_documentos x where x.cliente_id = c.id)
        or exists (select 1 from public.cliente_parceiros x where x.cliente_id = c.id)
        or exists (select 1 from public.cliente_alteracoes_pendentes x where x.cliente_id = c.id)
        or exists (select 1 from public.cliente_matriculas x where x.cliente_id = c.id and x.importacao_id is distinct from p_id)
        or exists (select 1 from public.contratos x where x.cliente_id = c.id and x.importacao_id is distinct from p_id)))
     or exists (select 1 from public.cliente_matriculas cm
                where cm.cliente_id = c.id and cm.importacao_id = p_id and (
                     exists (select 1 from public.contratos x where x.matricula_id = cm.id and x.importacao_id is distinct from p_id)
                  or exists (select 1 from public.mensalidades x where x.matricula_id = cm.id and x.importacao_id is distinct from p_id)
                  or exists (select 1 from public.mensalidade_averbacoes x
                             where x.matricula_id = cm.id and x.importacao_id is distinct from p_id)
                  or exists (select 1 from public.contrato_averbacoes x
                             where x.matricula_id = cm.id and x.importacao_id is distinct from p_id)))
  limit 1;
  if v is not null then
    raise exception 'Não dá para desfazer: o cliente de CPF % já foi alterado.', v;
  end if;

  perform set_config('app.desfazendo_importacao', 'on', true);
  delete from public.mensalidade_valores where mensalidade_id in (select id from public.mensalidades where importacao_id = p_id);
  delete from public.mensalidade_averbacoes where importacao_id = p_id;
  delete from public.mensalidades where importacao_id = p_id;
  -- parcelas antes: elas apontam para as averbações que a cascata do contrato apaga
  delete from public.parcelas where contrato_id in (select id from public.contratos where importacao_id = p_id);
  delete from public.contratos where importacao_id = p_id;
  delete from public.cliente_matriculas where importacao_id = p_id;
  delete from public.clientes where importacao_id = p_id;
  perform set_config('app.desfazendo_importacao', 'off', true);

  update public.importacoes set situacao = 'desfeita', desfeita_em = now(), desfeita_por = auth.uid() where id = p_id;
end $$;

revoke execute on function public.desfazer_importacao(uuid) from public, anon;
grant execute on function public.desfazer_importacao(uuid) to authenticated;
