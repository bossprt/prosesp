-- 0037 — Tratar linhas do retorno (vincular/ignorar), baixa de diferença, desfazer retorno
-- e proteção do desfazer da importação (Etapa 3) contra dados já usados pelo retorno.

-- Vincular: decisão humana. Aplica o desconto da linha a um contrato (ou mensalidade) do mesmo convênio.
-- p_parcela_id opcional: paga outra parcela (regularização); sem ele, a parcela da competência do retorno.
create function public.retorno_vincular_linha(p_linha_id uuid, p_destino_id uuid, p_parcela_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.retorno_linhas;
  r public.retornos;
  k public.contratos;
  m public.mensalidades;
  v_parcela uuid;
  v_status text;
  v_saldo numeric;
  v_averb uuid;
begin
  if not public.app_equipe_pode('retorno.importar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into l from public.retorno_linhas where id = p_linha_id;
  if l.id is null then
    raise exception 'Linha do retorno não encontrada.';
  end if;
  select * into r from public.retornos where id = l.retorno_id for update;
  select * into l from public.retorno_linhas where id = p_linha_id for update;
  if r.situacao <> 'gravado' then
    raise exception 'Este retorno foi desfeito.';
  end if;
  if l.tratamento is not null then
    raise exception 'Esta linha já foi tratada.';
  end if;
  if r.tipo <> 'descontados' then
    raise exception 'Linhas de não descontados não podem ser vinculadas.';
  end if;
  if l.situacao not in ('nao_encontrada', 'divergente') then
    raise exception 'Só linhas não encontradas ou divergentes podem ser vinculadas.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo.';
  end if;
  if l.valor is null or l.valor <= 0 then
    raise exception 'A linha não tem valor descontado.';
  end if;

  if r.produto = 'parcelas' then
    select * into k from public.contratos where id = p_destino_id for update;
    if k.id is null or k.convenio_id <> r.convenio_id or k.situacao not in ('ativo', 'em_atraso') then
      raise exception 'O contrato precisa ser do mesmo convênio e estar ativo.';
    end if;
    select id, status into v_parcela, v_status from public.parcelas
    where contrato_id = k.id and (case when p_parcela_id is null then competencia = r.competencia else id = p_parcela_id end)
    for update;
    if v_parcela is null then
      raise exception 'O contrato não tem parcela nesta competência.';
    end if;
    if v_status in ('cancelada', 'prejuizo') then
      raise exception 'Parcela cancelada ou em prejuízo.';
    end if;
    select saldo into v_saldo from public.v_parcelas_saldo where parcela_id = v_parcela;
  else
    select * into m from public.mensalidades where id = p_destino_id for update;
    if m.id is null or m.situacao <> 'ativa'
       or (select convenio_id from public.cliente_matriculas where id = m.matricula_id) <> r.convenio_id then
      raise exception 'A mensalidade precisa ser do mesmo convênio e estar ativa.';
    end if;
    select id, status into v_parcela, v_status from public.mensalidade_parcelas
    where mensalidade_id = m.id and (case when p_parcela_id is null then competencia = r.competencia else id = p_parcela_id end)
    for update;
    if v_parcela is null then
      raise exception 'A mensalidade não tem parcela nesta competência.';
    end if;
    if v_status = 'cancelada' then
      raise exception 'Parcela cancelada ou em prejuízo.';
    end if;
    select saldo into v_saldo from public.v_mensalidade_parcelas_saldo where mensalidade_parcela_id = v_parcela;
  end if;
  if v_saldo <= 0 then
    raise exception 'Esta parcela já está paga.';
  end if;
  if l.valor > v_saldo then
    raise exception 'O desconto é maior que o saldo da parcela.';
  end if;

  if r.produto = 'parcelas' then
    select id into v_averb from public.contrato_averbacoes where contrato_id = k.id and situacao = 'ativa';
    insert into public.parcela_pagamentos (parcela_id, valor, competencia_desconto, averbacao_id, origem, retorno_linha_id)
    values (v_parcela, l.valor, r.competencia, v_averb, 'retorno', l.id);
    perform public._recalcular_parcela(v_parcela, current_date);
    perform public._recalcular_situacao_contrato(k.id);
    update public.retorno_linhas set contrato_id = k.id, parcela_id = v_parcela, valor_aplicado = l.valor,
      tratamento = 'vinculada', tratamento_motivo = btrim(p_motivo), tratada_por = auth.uid(), tratada_em = now()
    where id = l.id;
    select status into v_status from public.parcelas where id = v_parcela;
  else
    insert into public.mensalidade_pagamentos (mensalidade_parcela_id, valor, competencia_desconto, origem, retorno_linha_id)
    values (v_parcela, l.valor, r.competencia, 'retorno', l.id);
    perform public._recalcular_mensalidade_parcela(v_parcela, current_date);
    update public.retorno_linhas set mensalidade_id = m.id, mensalidade_parcela_id = v_parcela, valor_aplicado = l.valor,
      tratamento = 'vinculada', tratamento_motivo = btrim(p_motivo), tratada_por = auth.uid(), tratada_em = now()
    where id = l.id;
    select status into v_status from public.mensalidade_parcelas where id = v_parcela;
  end if;
  return jsonb_build_object('status', v_status);
end $$;

create function public.retorno_ignorar_linha(p_linha_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.retorno_linhas;
  r public.retornos;
begin
  if not public.app_equipe_pode('retorno.importar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into l from public.retorno_linhas where id = p_linha_id;
  if l.id is null then
    raise exception 'Linha do retorno não encontrada.';
  end if;
  select * into r from public.retornos where id = l.retorno_id for update;
  select * into l from public.retorno_linhas where id = p_linha_id for update;
  if r.situacao <> 'gravado' then
    raise exception 'Este retorno foi desfeito.';
  end if;
  if l.tratamento is not null then
    raise exception 'Esta linha já foi tratada.';
  end if;
  if l.situacao not in ('nao_encontrada', 'divergente', 'duplicada', 'nao_descontada') then
    raise exception 'Esta linha não precisa de tratamento.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo.';
  end if;
  update public.retorno_linhas set tratamento = 'ignorada', tratamento_motivo = btrim(p_motivo),
    tratada_por = auth.uid(), tratada_em = now()
  where id = l.id;
end $$;

-- Baixa da diferença de desconto (gerente/admin): o saldo restante é dado como resolvido.
create function public.diferenca_baixar(p_parcela_id uuid, p_mensalidade_parcela_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_pago numeric;
  v_saldo numeric;
  v_dono uuid;
begin
  if not public.app_equipe_pode('retorno.baixar_diferenca') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if (p_parcela_id is null) = (p_mensalidade_parcela_id is null) then
    raise exception 'Informe a parcela.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo.';
  end if;
  if p_parcela_id is not null then
    select contrato_id into v_dono from public.parcelas where id = p_parcela_id;
    perform 1 from public.contratos where id = v_dono for update;
    select status into v_status from public.parcelas where id = p_parcela_id for update;
    select pago, saldo into v_pago, v_saldo from public.v_parcelas_saldo where parcela_id = p_parcela_id;
  else
    select mensalidade_id into v_dono from public.mensalidade_parcelas where id = p_mensalidade_parcela_id;
    perform 1 from public.mensalidades where id = v_dono for update;
    select status into v_status from public.mensalidade_parcelas where id = p_mensalidade_parcela_id for update;
    select pago, saldo into v_pago, v_saldo from public.v_mensalidade_parcelas_saldo where mensalidade_parcela_id = p_mensalidade_parcela_id;
  end if;
  if v_status is null then
    raise exception 'Parcela não encontrada.';
  end if;
  if v_status in ('cancelada', 'prejuizo') or coalesce(v_pago, 0) <= 0 or coalesce(v_saldo, 0) <= 0 then
    raise exception 'Só parcelas com desconto parcial têm diferença para dar baixa.';
  end if;
  insert into public.diferenca_baixas (parcela_id, mensalidade_parcela_id, valor, motivo)
  values (p_parcela_id, p_mensalidade_parcela_id, v_saldo, btrim(p_motivo));
  if p_parcela_id is not null then
    perform public._recalcular_parcela(p_parcela_id, current_date);
    perform public._recalcular_situacao_contrato(v_dono);
  else
    perform public._recalcular_mensalidade_parcela(p_mensalidade_parcela_id, current_date);
  end if;
end $$;

-- Desfazer retorno gravado por engano (gerente/admin). As linhas ficam para histórico.
create function public.retorno_desfazer(p_retorno_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.retornos;
  v text;
  v_id uuid;
begin
  if not public.app_equipe_pode('retorno.baixar_diferenca') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo.';
  end if;
  select * into r from public.retornos where id = p_retorno_id;
  if r.id is null then
    raise exception 'Retorno não encontrado.';
  end if;
  perform pg_advisory_xact_lock(hashtext('retorno:' || r.convenio_id::text || ':' || r.produto));
  select * into r from public.retornos where id = p_retorno_id for update;
  if r.situacao <> 'gravado' then
    raise exception 'Este retorno já foi desfeito.';
  end if;
  if exists (select 1 from public.retornos x where x.convenio_id = r.convenio_id and x.produto = r.produto
             and x.situacao = 'gravado' and x.criado_em > r.criado_em) then
    raise exception 'Só o retorno mais recente deste convênio e produto pode ser desfeito.';
  end if;

  if r.produto = 'parcelas' then
    perform 1 from public.contratos k
    where k.id in (select p.contrato_id from public.parcela_pagamentos g join public.parcelas p on p.id = g.parcela_id
                   join public.retorno_linhas l on l.id = g.retorno_linha_id where l.retorno_id = r.id)
    order by k.id for update;
    select k.numero::text into v from public.contratos k
    where k.situacao not in ('ativo', 'em_atraso')
      and k.id in (select p.contrato_id from public.parcela_pagamentos g join public.parcelas p on p.id = g.parcela_id
                   join public.retorno_linhas l on l.id = g.retorno_linha_id where l.retorno_id = r.id)
    limit 1;
    if v is not null then
      raise exception 'Não dá para desfazer: o contrato nº % foi encerrado depois do retorno.', v;
    end if;
    if exists (select 1 from public.diferenca_baixas b
               where b.criado_em > r.criado_em and b.parcela_id in (
                 select g.parcela_id from public.parcela_pagamentos g join public.retorno_linhas l on l.id = g.retorno_linha_id
                 where l.retorno_id = r.id)) then
      raise exception 'Não dá para desfazer: houve baixa de diferença depois deste retorno.';
    end if;
    create temp table _desf (parcela_id uuid, contrato_id uuid) on commit drop;
    insert into pg_temp._desf
    select distinct g.parcela_id, p.contrato_id from public.parcela_pagamentos g join public.parcelas p on p.id = g.parcela_id
    join public.retorno_linhas l on l.id = g.retorno_linha_id where l.retorno_id = r.id;
    delete from public.parcela_pagamentos g using public.retorno_linhas l where l.id = g.retorno_linha_id and l.retorno_id = r.id;
    for v_id in select distinct parcela_id from pg_temp._desf loop
      perform public._recalcular_parcela(v_id, current_date);
    end loop;
    for v_id in select distinct contrato_id from pg_temp._desf loop
      perform public._recalcular_situacao_contrato(v_id);
    end loop;
    drop table pg_temp._desf;
  else
    perform 1 from public.mensalidades m
    where m.id in (select mp.mensalidade_id from public.mensalidade_pagamentos g join public.mensalidade_parcelas mp on mp.id = g.mensalidade_parcela_id
                   join public.retorno_linhas l on l.id = g.retorno_linha_id where l.retorno_id = r.id)
    order by m.id for update;
    select cm.matricula into v from public.mensalidades m join public.cliente_matriculas cm on cm.id = m.matricula_id
    where m.situacao <> 'ativa'
      and m.id in (select mp.mensalidade_id from public.mensalidade_pagamentos g join public.mensalidade_parcelas mp on mp.id = g.mensalidade_parcela_id
                   join public.retorno_linhas l on l.id = g.retorno_linha_id where l.retorno_id = r.id)
    limit 1;
    if v is not null then
      raise exception 'Não dá para desfazer: a mensalidade da matrícula % foi cancelada depois do retorno.', v;
    end if;
    if exists (select 1 from public.diferenca_baixas b
               where b.criado_em > r.criado_em and b.mensalidade_parcela_id in (
                 select g.mensalidade_parcela_id from public.mensalidade_pagamentos g join public.retorno_linhas l on l.id = g.retorno_linha_id
                 where l.retorno_id = r.id)) then
      raise exception 'Não dá para desfazer: houve baixa de diferença depois deste retorno.';
    end if;
    create temp table _desf (parcela_id uuid) on commit drop;
    insert into pg_temp._desf
    select distinct g.mensalidade_parcela_id from public.mensalidade_pagamentos g
    join public.retorno_linhas l on l.id = g.retorno_linha_id where l.retorno_id = r.id;
    delete from public.mensalidade_pagamentos g using public.retorno_linhas l where l.id = g.retorno_linha_id and l.retorno_id = r.id;
    for v_id in select parcela_id from pg_temp._desf loop
      perform public._recalcular_mensalidade_parcela(v_id, current_date);
    end loop;
    drop table pg_temp._desf;
  end if;

  update public.retornos set situacao = 'desfeito', desfeito_em = now(), desfeito_por = auth.uid(), motivo_desfazer = btrim(p_motivo)
  where id = r.id;
end $$;

revoke execute on function public.retorno_vincular_linha(uuid, uuid, uuid, text), public.retorno_ignorar_linha(uuid, text),
  public.diferenca_baixar(uuid, uuid, text), public.retorno_desfazer(uuid, text) from public, anon;
grant execute on function public.retorno_vincular_linha(uuid, uuid, uuid, text), public.retorno_ignorar_linha(uuid, text),
  public.diferenca_baixar(uuid, uuid, text), public.retorno_desfazer(uuid, text) to authenticated;

-- ── Desfazer importação (Etapa 3): recusa se o retorno já usou os dados importados ──
alter function public.desfazer_importacao(uuid) rename to _desfazer_importacao_base;
revoke execute on function public._desfazer_importacao_base(uuid) from public, anon, authenticated;

create function public.desfazer_importacao(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.app_exigir('importacao.executar');
  if exists (
       select 1 from public.contratos k
       where k.importacao_id = p_id and (
            exists (select 1 from public.retorno_linhas l where l.contrato_id = k.id or l.sugestao_contrato_id = k.id)
         or exists (select 1 from public.diferenca_baixas b join public.parcelas p on p.id = b.parcela_id where p.contrato_id = k.id)))
     or exists (
       select 1 from public.mensalidades m
       where m.importacao_id = p_id and (
            exists (select 1 from public.retorno_linhas l where l.mensalidade_id = m.id or l.sugestao_mensalidade_id = m.id)
         or exists (select 1 from public.mensalidade_parcelas mp where mp.mensalidade_id = m.id and (
                 exists (select 1 from public.mensalidade_pagamentos g where g.mensalidade_parcela_id = mp.id)
              or exists (select 1 from public.diferenca_baixas b where b.mensalidade_parcela_id = mp.id))))) then
    raise exception 'Não dá para desfazer: há retorno ou baixa de diferença ligada aos dados desta importação.';
  end if;
  perform public._desfazer_importacao_base(p_id);
end $$;
revoke execute on function public.desfazer_importacao(uuid) from public, anon;
grant execute on function public.desfazer_importacao(uuid) to authenticated;
