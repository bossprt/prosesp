-- 0020 — Encerramentos, atraso diário, candidatos a prejuízo e cancelamento de mensalidade

create function public.encerrar_contrato(p_id uuid, p_tipo text, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
begin
  if not public.app_equipe_pode('contratos.encerrar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if p_tipo not in ('quitado', 'cancelado', 'prejuizo') then
    raise exception 'Tipo de encerramento inválido.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo.';
  end if;
  select * into k from public.contratos where id = p_id for update;
  if k.id is null or k.situacao not in ('ativo', 'em_atraso') then
    raise exception 'Só é possível encerrar contratos ativos ou em atraso.';
  end if;

  if p_tipo = 'prejuizo' then
    -- a dívida continua existindo; a averbação permanece
    update public.parcelas set status = 'prejuizo' where contrato_id = k.id and status in ('aberta', 'parcial', 'atrasada');
  else
    update public.parcelas set status = 'cancelada' where contrato_id = k.id and status in ('aberta', 'parcial', 'atrasada');
    perform public._pedir_cancelamento_averbacoes(k.id, 'Contrato encerrado (' || p_tipo || '): ' || btrim(p_motivo));
  end if;

  update public.contratos set situacao = p_tipo::public.situacao_contrato where id = k.id;
  insert into public.contrato_eventos (contrato_id, situacao_de, situacao_para, motivo)
  values (k.id, k.situacao, p_tipo::public.situacao_contrato, btrim(p_motivo));
end $$;

-- Roda todo dia (pg_cron). Atraso de mensalidade não marca o contrato de empréstimo.
create function public.recalcular_atrasos(p_hoje date default current_date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.app_equipe_pode('contratos.encerrar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;

  update public.parcelas set status = 'atrasada'
  where status in ('aberta', 'parcial') and vencimento < p_hoje;

  update public.contratos k set situacao = 'em_atraso'
  where k.situacao = 'ativo'
    and exists (select 1 from public.parcelas p where p.contrato_id = k.id and p.status = 'atrasada');
  update public.contratos k set situacao = 'ativo'
  where k.situacao = 'em_atraso'
    and not exists (select 1 from public.parcelas p where p.contrato_id = k.id and p.status = 'atrasada');

  update public.mensalidade_parcelas mp set status = 'atrasada'
  from public.mensalidades m, public.cliente_matriculas cm, public.convenios cv
  where mp.mensalidade_id = m.id and cm.id = m.matricula_id and cv.id = cm.convenio_id
    and mp.status in ('aberta', 'parcial')
    and make_date(extract(year from mp.competencia)::int, extract(month from mp.competencia)::int,
                  coalesce(cv.dia_vencimento, 28)) < p_hoje;
end $$;

select cron.schedule('recalcular-atrasos', '0 4 * * *', $$select public.recalcular_atrasos(current_date)$$);

create view public.v_candidatos_prejuizo with (security_invoker = true) as
  select k.id as contrato_id, k.numero, c.nome as cliente, cv.nome as convenio,
         (current_date - min(p.vencimento))::integer as dias_atraso
  from public.contratos k
  join public.clientes c on c.id = k.cliente_id
  join public.convenios cv on cv.id = k.convenio_id
  join public.parcelas p on p.contrato_id = k.id and p.status = 'atrasada'
  where k.situacao in ('ativo', 'em_atraso')
  group by k.id, k.numero, c.nome, cv.nome, cv.dias_prejuizo
  having current_date - min(p.vencimento) > cv.dias_prejuizo;
revoke all on public.v_candidatos_prejuizo from anon;

create function public.cancelar_mensalidade(p_mensalidade_id uuid, p_documento_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.mensalidades;
  v_cliente uuid;
  a record;
begin
  if not public.app_equipe_pode('mensalidades.cancelar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into m from public.mensalidades where id = p_mensalidade_id and situacao = 'ativa' for update;
  if m.id is null then
    raise exception 'Mensalidade não encontrada ou já cancelada.';
  end if;
  select cm.cliente_id into v_cliente from public.cliente_matriculas cm where cm.id = m.matricula_id;
  if not exists (select 1 from public.cliente_documentos d
                 where d.id = p_documento_id and d.cliente_id = v_cliente and d.tipo = 'requerimento_cancelamento') then
    raise exception 'Anexe o requerimento de cancelamento assinado pelo cliente.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo.';
  end if;

  update public.mensalidades set situacao = 'cancelada', cancelada_em = now(),
    requerimento_documento_id = p_documento_id, motivo_cancelamento = btrim(p_motivo)
  where id = m.id;
  update public.mensalidade_parcelas set status = 'cancelada'
  where mensalidade_id = m.id and status in ('aberta', 'parcial') and competencia >= date_trunc('month', current_date)::date;
  for a in update public.mensalidade_averbacoes set situacao = 'cancelamento_pendente'
           where mensalidade_id = m.id and situacao = 'ativa' returning id loop
    insert into public.pendencias_averbadora (tipo, mensalidade_averbacao_id, motivo)
    values ('cancelar', a.id, 'Mensalidade cancelada a pedido do cliente: ' || btrim(p_motivo));
  end loop;
end $$;

revoke execute on function public.encerrar_contrato(uuid, text, text), public.recalcular_atrasos(date),
  public.cancelar_mensalidade(uuid, uuid, text) from public, anon;
grant execute on function public.encerrar_contrato(uuid, text, text), public.recalcular_atrasos(date),
  public.cancelar_mensalidade(uuid, uuid, text) to authenticated;
