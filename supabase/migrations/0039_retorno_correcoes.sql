-- 0039 — Correções da revisão final da Etapa 5 (revisor + Codex):
-- classificação em conjunto (retornos de 20.000 linhas dentro do limite de tempo), travas em ordem fixa,
-- desconto repetido em outro arquivo, competência inválida, ADE alfanumérico, recálculo sem update à toa,
-- averbação certa ao vincular, auditoria das linhas tratadas, ausentes por parcela, remessa de mensalidade
-- limitada ao averbado e trava no desfazer da importação.

alter table public.retorno_linhas add column averbacao_id uuid; -- averbação de contrato ou de mensalidade, conforme o produto
create trigger trg_auditoria after update on public.retorno_linhas
  for each row execute function public.auditar();

-- Chave de comparação do ADE: sem zeros à esquerda só quando é todo numérico.
create function public._ade_chave(p text) returns text
language sql immutable set search_path = '' as $$
  select case when p ~ '^\d+$' then coalesce(nullif(ltrim(p, '0'), ''), '0') else p end
$$;

-- Valor vindo do arquivo (texto "1234.56"); null se não for um valor válido para desconto.
create function public._dinheiro_seguro(p text) returns numeric
language sql immutable set search_path = '' as $$
  select case when btrim(coalesce(p, '')) ~ '^\d{1,12}(\.\d{1,2})?$' and btrim(p)::numeric > 0 then btrim(p)::numeric end
$$;

create function public._situacao_rotulo(p public.situacao_contrato) returns text
language sql immutable set search_path = '' as $$
  select case p when 'em_andamento' then 'em andamento' when 'ativo' then 'ativo' when 'em_atraso' then 'em atraso'
                when 'quitado' then 'quitado' when 'renovado' then 'renovado' when 'cancelado' then 'cancelado'
                when 'prejuizo' then 'prejuízo' end
$$;

-- ── Recálculo em lote (só atualiza o que muda) ────────────────
create function public._recalcular_parcelas(p_ids uuid[], p_hoje date default current_date) returns void
language sql security definer set search_path = '' as $$
  update public.parcelas p set status = n.novo
  from (select x.id, case when x.valor - coalesce(g.pago, 0) - coalesce(b.baixado, 0) <= 0 then 'paga'
                          when x.vencimento < p_hoje then 'atrasada'
                          when coalesce(g.pago, 0) + coalesce(b.baixado, 0) > 0 then 'parcial'
                          else 'aberta' end as novo
        from public.parcelas x
        left join lateral (select sum(valor) as pago from public.parcela_pagamentos where parcela_id = x.id) g on true
        left join lateral (select sum(valor) as baixado from public.diferenca_baixas where parcela_id = x.id) b on true
        where x.id = any (p_ids) and x.status not in ('cancelada', 'prejuizo')) n
  where p.id = n.id and p.status is distinct from n.novo
$$;

create function public._recalcular_mensalidade_parcelas(p_ids uuid[], p_hoje date default current_date) returns void
language sql security definer set search_path = '' as $$
  update public.mensalidade_parcelas p set status = n.novo
  from (select x.id, case when x.valor - coalesce(g.pago, 0) - coalesce(b.baixado, 0) <= 0 then 'paga'
                          when make_date(extract(year from x.competencia)::int, extract(month from x.competencia)::int,
                                         coalesce(cv.dia_vencimento, 28)) < p_hoje then 'atrasada'
                          when coalesce(g.pago, 0) + coalesce(b.baixado, 0) > 0 then 'parcial'
                          else 'aberta' end as novo
        from public.mensalidade_parcelas x
        join public.mensalidades m on m.id = x.mensalidade_id
        join public.cliente_matriculas cm on cm.id = m.matricula_id
        join public.convenios cv on cv.id = cm.convenio_id
        left join lateral (select sum(valor) as pago from public.mensalidade_pagamentos where mensalidade_parcela_id = x.id) g on true
        left join lateral (select sum(valor) as baixado from public.diferenca_baixas where mensalidade_parcela_id = x.id) b on true
        where x.id = any (p_ids) and x.status <> 'cancelada') n
  where p.id = n.id and p.status is distinct from n.novo
$$;

create function public._recalcular_situacao_contratos(p_ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  update public.contratos k set situacao = n.novo
  from (select x.id, case when exists (select 1 from public.parcelas p where p.contrato_id = x.id and p.status = 'atrasada')
                          then 'em_atraso'::public.situacao_contrato else 'ativo'::public.situacao_contrato end as novo
        from public.contratos x where x.id = any (p_ids) and x.situacao in ('ativo', 'em_atraso')) n
  where k.id = n.id and k.situacao is distinct from n.novo
$$;

create or replace function public._recalcular_parcela(p_id uuid, p_hoje date default current_date) returns void
language sql security definer set search_path = '' as $$
  select public._recalcular_parcelas(array[p_id], p_hoje)
$$;
create or replace function public._recalcular_mensalidade_parcela(p_id uuid, p_hoje date default current_date) returns void
language sql security definer set search_path = '' as $$
  select public._recalcular_mensalidade_parcelas(array[p_id], p_hoje)
$$;
create or replace function public._recalcular_situacao_contrato(p_contrato_id uuid) returns void
language sql security definer set search_path = '' as $$
  select public._recalcular_situacao_contratos(array[p_contrato_id])
$$;

-- O recálculo diário trava parcela antes de contrato; as escritas do retorno fazem o contrário.
-- Uma trava compartilhada serializa os dois e evita o impasse (deadlock).
create or replace function public.recalcular_atrasos(p_hoje date default current_date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.app_equipe_pode('contratos.encerrar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('recalcular_atrasos'));

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

-- ── Classificação em conjunto ─────────────────────────────────
drop function public._retorno_classificar(uuid, text, text, date, jsonb, boolean);
create function public._retorno_classificar(p_convenio_id uuid, p_produto text, p_tipo text, p_competencia date,
                                            p_linhas jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  rr record;
  v_atual uuid;
  v_rest numeric;
  v_ini numeric;
  v_sit text;
  v_motivo text;
  v_aplic numeric;
begin
  drop table if exists pg_temp._ret;
  create temp table _ret (
    id uuid primary key default gen_random_uuid(), ord integer, linha integer, dados jsonb,
    ade text, ade_chave text, cpf text, matricula text, nome text, valor_txt text, valor numeric(14,2),
    comp_txt text, competencia_arquivo date, observacao text, situacao text, motivo text,
    averbacao_id uuid, averb_sit public.situacao_averbacao, dono uuid, averb_mat uuid, ambiguo boolean,
    contrato_id uuid, mensalidade_id uuid, dono_sit text, cli_cpf text, mat_txt text,
    parcela_id uuid, mensalidade_parcela_id uuid, parcela_status text, saldo numeric(14,2),
    sugestao_contrato_id uuid, sugestao_mensalidade_id uuid, valor_aplicado numeric(14,2)
  ) on commit drop;

  insert into pg_temp._ret (ord, linha, dados, ade, cpf, matricula, nome, valor_txt, comp_txt, observacao)
  select x.ord, case when coalesce(x.l ->> 'linha', '') ~ '^\d{1,9}$' then (x.l ->> 'linha')::integer else x.ord::integer end,
         case when jsonb_typeof(x.l -> 'dados') = 'object' then x.l -> 'dados' else '{}'::jsonb end,
         nullif(btrim(coalesce(x.l ->> 'ade', '')), ''),
         nullif(regexp_replace(coalesce(x.l ->> 'cpf', ''), '\D', '', 'g'), ''),
         nullif(btrim(coalesce(x.l ->> 'matricula', '')), ''),
         nullif(btrim(coalesce(x.l ->> 'nome', '')), ''),
         nullif(btrim(coalesce(x.l ->> 'valor', '')), ''),
         nullif(btrim(coalesce(x.l ->> 'competencia', '')), ''),
         nullif(btrim(coalesce(x.l ->> 'observacao', '')), '')
  from jsonb_array_elements(p_linhas) with ordinality as x(l, ord);
  update pg_temp._ret set ade_chave = public._ade_chave(ade), valor = public._dinheiro_seguro(valor_txt),
    competencia_arquivo = case when comp_txt ~ '^\d{4}-(0[1-9]|1[0-2])-01$' then comp_txt::date end;

  -- 1. dados mínimos  2. competência  3. ADE repetido no arquivo
  update pg_temp._ret set situacao = 'ignorada', motivo = 'Linha sem dados suficientes.'
  where ade is null and cpf is null or (p_tipo = 'descontados' and valor_txt is null);
  update pg_temp._ret set situacao = 'ignorada', motivo = 'Valor inválido.'
  where situacao is null and p_tipo = 'descontados' and valor is null;
  update pg_temp._ret set situacao = 'divergente', motivo = 'Competência inválida no arquivo.'
  where situacao is null and comp_txt is not null and competencia_arquivo is null;
  update pg_temp._ret set situacao = 'divergente', motivo = 'Competência do arquivo diferente da escolhida.'
  where situacao is null and competencia_arquivo <> p_competencia;
  update pg_temp._ret r set situacao = 'duplicada', motivo = 'ADE repetido no arquivo.'
  from (select ord, row_number() over (partition by ade_chave order by ord) as n
        from pg_temp._ret where situacao is null and ade is not null) d
  where d.ord = r.ord and d.n > 1;

  -- 4. averbação pelo ADE: texto exato primeiro, depois sem zeros à esquerda (só números); melhor situação
  if p_produto = 'parcelas' then
    update pg_temp._ret r set averbacao_id = b.id, averb_sit = b.situacao, dono = b.dono, averb_mat = b.matricula_id, ambiguo = b.amb
    from (select r2.ord, c.* from pg_temp._ret r2 cross join lateral (
            select (array_agg(a.id order by a.id))[1] as id, (array_agg(a.situacao))[1] as situacao,
                   (array_agg(a.contrato_id order by a.contrato_id))[1] as dono,
                   (array_agg(a.matricula_id order by a.contrato_id))[1] as matricula_id,
                   count(distinct a.contrato_id) > 1 as amb
            from (select a.*, rank() over (order by (a.ade = r2.ade) desc, public._ade_prioridade(a.situacao)) as rk
                  from public.contrato_averbacoes a
                  where a.convenio_id = p_convenio_id and ltrim(a.ade, '0') = ltrim(r2.ade, '0')
                    and (a.ade = r2.ade or (a.ade ~ '^\d+$' and r2.ade ~ '^\d+$'))) a
            where a.rk = 1) c
          where r2.situacao is null and r2.ade is not null) b
    where b.ord = r.ord;
  else
    update pg_temp._ret r set averbacao_id = b.id, averb_sit = b.situacao, dono = b.dono, averb_mat = b.matricula_id, ambiguo = b.amb
    from (select r2.ord, c.* from pg_temp._ret r2 cross join lateral (
            select (array_agg(a.id order by a.id))[1] as id, (array_agg(a.situacao))[1] as situacao,
                   (array_agg(a.mensalidade_id order by a.mensalidade_id nulls last))[1] as dono,
                   (array_agg(a.matricula_id order by a.mensalidade_id nulls last))[1] as matricula_id,
                   count(distinct coalesce(a.mensalidade_id, a.id)) > 1 as amb
            from (select a.*, rank() over (order by (a.ade = r2.ade) desc, public._ade_prioridade(a.situacao)) as rk
                  from public.mensalidade_averbacoes a
                  where a.convenio_id = p_convenio_id and ltrim(a.ade, '0') = ltrim(r2.ade, '0')
                    and (a.ade = r2.ade or (a.ade ~ '^\d+$' and r2.ade ~ '^\d+$'))) a
            where a.rk = 1) c
          where r2.situacao is null and r2.ade is not null) b
    where b.ord = r.ord;
  end if;
  update pg_temp._ret set situacao = 'nao_encontrada', motivo = 'ADE não encontrado no sistema.'
  where situacao is null and averbacao_id is null;
  update pg_temp._ret set situacao = 'divergente', motivo = case
      when ambiguo then 'Mais de um cadastro com este ADE.'
      when averb_sit = 'cancelada' then 'ADE cancelado no sistema.'
      when averb_sit = 'cancelamento_pendente' then 'ADE com cancelamento pendente na averbadora.'
      when p_produto = 'parcelas' then 'ADE de contrato ainda não liberado.'
      else 'ADE de mensalidade ainda não liberado.' end
  where situacao is null and (ambiguo or averb_sit in ('cancelada', 'cancelamento_pendente', 'proposta') or dono is null);

  -- sugestão por CPF + matrícula (um único cadastro elegível)
  if exists (select 1 from pg_temp._ret where situacao = 'nao_encontrada' and cpf is not null and matricula is not null) then
    if p_produto = 'parcelas' then
      update pg_temp._ret r set sugestao_contrato_id = s.id
      from (select z.cpf, z.mat, (array_agg(z.id))[1] as id from (
              select k.id, regexp_replace(cl.cpf, '\D', '', 'g') as cpf, public._mat_norm(cm.matricula) as mat
              from public.contratos k
              join public.clientes cl on cl.id = k.cliente_id
              join public.cliente_matriculas cm on cm.id = k.matricula_id
              where k.convenio_id = p_convenio_id and k.situacao in ('ativo', 'em_atraso')
                and exists (select 1 from public.parcelas p where p.contrato_id = k.id and p.competencia = p_competencia)) z
            group by z.cpf, z.mat having count(distinct z.id) = 1) s
      where r.situacao = 'nao_encontrada' and r.cpf = s.cpf and public._mat_norm(r.matricula) = s.mat;
    else
      update pg_temp._ret r set sugestao_mensalidade_id = s.id
      from (select z.cpf, z.mat, (array_agg(z.id))[1] as id from (
              select m.id, regexp_replace(cl.cpf, '\D', '', 'g') as cpf, public._mat_norm(cm.matricula) as mat
              from public.mensalidades m
              join public.cliente_matriculas cm on cm.id = m.matricula_id
              join public.clientes cl on cl.id = cm.cliente_id
              where cm.convenio_id = p_convenio_id and m.situacao = 'ativa') z
            group by z.cpf, z.mat having count(distinct z.id) = 1) s
      where r.situacao = 'nao_encontrada' and r.cpf = s.cpf and public._mat_norm(r.matricula) = s.mat;
    end if;
  end if;

  -- 5. dono, CPF e matrícula (da averbação encontrada)
  if p_produto = 'parcelas' then
    update pg_temp._ret r set contrato_id = k.id, dono_sit = public._situacao_rotulo(k.situacao),
      cli_cpf = regexp_replace(cl.cpf, '\D', '', 'g'), mat_txt = cm.matricula,
      situacao = case when k.situacao not in ('ativo', 'em_atraso') then 'divergente' end,
      motivo = case when k.situacao not in ('ativo', 'em_atraso')
                    then format('Contrato não está ativo (situação: %s).', public._situacao_rotulo(k.situacao)) end
    from public.contratos k, public.clientes cl, public.cliente_matriculas cm
    where r.situacao is null and k.id = r.dono and cl.id = k.cliente_id and cm.id = r.averb_mat;
  else
    update pg_temp._ret r set mensalidade_id = m.id, cli_cpf = regexp_replace(cl.cpf, '\D', '', 'g'), mat_txt = cma.matricula,
      situacao = case when m.situacao <> 'ativa' then 'divergente' end,
      motivo = case when m.situacao <> 'ativa' then 'Mensalidade cancelada.' end
    from public.mensalidades m, public.cliente_matriculas cmm, public.clientes cl, public.cliente_matriculas cma
    where r.situacao is null and m.id = r.dono and cmm.id = m.matricula_id and cl.id = cmm.cliente_id and cma.id = r.averb_mat;
  end if;
  update pg_temp._ret set situacao = 'divergente', motivo = 'CPF diferente do cadastro.'
  where situacao is null and cpf is not null and cpf <> cli_cpf;
  update pg_temp._ret set situacao = 'divergente', motivo = 'Matrícula diferente do cadastro.'
  where situacao is null and matricula is not null and public._mat_norm(matricula) is distinct from public._mat_norm(mat_txt);

  -- 6. parcela da competência, saldo e desconto já recebido por outro arquivo
  if p_produto = 'parcelas' then
    update pg_temp._ret r set parcela_id = p.id, parcela_status = p.status,
      saldo = p.valor - coalesce((select sum(g.valor) from public.parcela_pagamentos g where g.parcela_id = p.id), 0)
                      - coalesce((select sum(b.valor) from public.diferenca_baixas b where b.parcela_id = p.id), 0)
    from public.parcelas p
    where r.situacao is null and p.contrato_id = r.contrato_id and p.competencia = p_competencia;
    update pg_temp._ret r set situacao = 'duplicada', motivo = 'Já recebido em outro retorno desta competência.'
    where r.situacao is null and p_tipo = 'descontados' and r.parcela_id is not null and exists (
      select 1 from public.parcela_pagamentos g join public.retorno_linhas l on l.id = g.retorno_linha_id
      join public.retornos x on x.id = l.retorno_id
      where g.parcela_id = r.parcela_id and g.competencia_desconto = p_competencia and x.situacao = 'gravado'
        and public._ade_chave(l.ade) = r.ade_chave);
  else
    update pg_temp._ret r set mensalidade_parcela_id = p.id, parcela_status = p.status,
      saldo = p.valor - coalesce((select sum(g.valor) from public.mensalidade_pagamentos g where g.mensalidade_parcela_id = p.id), 0)
                      - coalesce((select sum(b.valor) from public.diferenca_baixas b where b.mensalidade_parcela_id = p.id), 0)
    from public.mensalidade_parcelas p
    where r.situacao is null and p.mensalidade_id = r.mensalidade_id and p.competencia = p_competencia;
    update pg_temp._ret r set situacao = 'duplicada', motivo = 'Já recebido em outro retorno desta competência.'
    where r.situacao is null and p_tipo = 'descontados' and r.mensalidade_parcela_id is not null and exists (
      select 1 from public.mensalidade_pagamentos g join public.retorno_linhas l on l.id = g.retorno_linha_id
      join public.retornos x on x.id = l.retorno_id
      where g.mensalidade_parcela_id = r.mensalidade_parcela_id and g.competencia_desconto = p_competencia
        and x.situacao = 'gravado' and public._ade_chave(l.ade) = r.ade_chave);
  end if;
  update pg_temp._ret set situacao = 'divergente', motivo = 'Não há parcela nesta competência.'
  where situacao is null and coalesce(parcela_id, mensalidade_parcela_id) is null;
  update pg_temp._ret set situacao = 'divergente', motivo = 'Parcela cancelada ou em prejuízo.'
  where situacao is null and parcela_status in ('cancelada', 'prejuizo');

  -- 7/8. resultado: uma linha por parcela (caso comum) em conjunto; parcelas com várias linhas, em ordem
  update pg_temp._ret r set
    situacao = case when r.saldo <= 0 then 'duplicada'
                    when p_tipo = 'nao_descontados' then 'nao_descontada'
                    when r.valor > r.saldo then 'divergente'
                    when r.averb_sit <> 'ativa' then 'ade_antiga'
                    when r.valor = r.saldo then 'conciliada' else 'parcial' end,
    motivo = case when r.saldo <= 0 then 'Parcela já paga.'
                  when p_tipo = 'nao_descontados' then coalesce(r.observacao, 'Não descontado pela folha.')
                  when r.valor > r.saldo then 'Desconto maior que o saldo da parcela.' end,
    valor_aplicado = case when r.saldo > 0 and p_tipo = 'descontados' and r.valor <= r.saldo then r.valor end
  from (select ord, count(*) over (partition by coalesce(parcela_id, mensalidade_parcela_id)) as n
        from pg_temp._ret where situacao is null) g
  where g.ord = r.ord and g.n = 1;

  v_atual := null;
  for rr in select ord, coalesce(parcela_id, mensalidade_parcela_id) as pid, saldo, valor, averb_sit, observacao
            from pg_temp._ret where situacao is null order by 2, ord loop
    if rr.pid is distinct from v_atual then
      v_atual := rr.pid; v_rest := rr.saldo; v_ini := rr.saldo;
    end if;
    v_aplic := null; v_motivo := null;
    if v_rest <= 0 then
      v_sit := 'duplicada';
      v_motivo := case when v_ini > 0 then 'Parcela já paga por outra linha deste arquivo.' else 'Parcela já paga.' end;
    elsif p_tipo = 'nao_descontados' then
      v_sit := 'nao_descontada'; v_motivo := coalesce(rr.observacao, 'Não descontado pela folha.');
    elsif rr.valor > v_rest then
      v_sit := 'divergente'; v_motivo := 'Desconto maior que o saldo da parcela.';
    else
      v_aplic := rr.valor;
      v_sit := case when rr.averb_sit <> 'ativa' then 'ade_antiga' when rr.valor = v_rest then 'conciliada' else 'parcial' end;
      v_rest := v_rest - rr.valor;
    end if;
    update pg_temp._ret set situacao = v_sit, motivo = v_motivo, valor_aplicado = v_aplic where ord = rr.ord;
  end loop;
end $$;
revoke execute on function public._retorno_classificar(uuid, text, text, date, jsonb), public._ade_chave(text),
  public._dinheiro_seguro(text), public._situacao_rotulo(public.situacao_contrato),
  public._recalcular_parcelas(uuid[], date), public._recalcular_mensalidade_parcelas(uuid[], date),
  public._recalcular_situacao_contratos(uuid[]) from public, anon, authenticated;

create or replace function public.retorno_conferir(p_convenio_id uuid, p_produto text, p_tipo text, p_competencia date,
                                                   p_linhas jsonb, p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
  v_avisos jsonb;
begin
  perform public._retorno_validar(p_convenio_id, p_produto, p_tipo, p_competencia, p_linhas, p_hash);
  perform public._retorno_classificar(p_convenio_id, p_produto, p_tipo, p_competencia, p_linhas);
  select coalesce(jsonb_agg(format('Já existe retorno gravado deste convênio, produto e tipo nesta competência: %s, em %s.',
                                   x.arquivo_nome, to_char(x.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'))
                            order by x.criado_em), '[]'::jsonb)
  into v_avisos
  from public.retornos x
  where x.convenio_id = p_convenio_id and x.produto = p_produto and x.tipo = p_tipo and x.competencia = p_competencia
    and x.situacao = 'gravado';
  select jsonb_build_object(
    'resumo', public._retorno_resumo(),
    'avisos', v_avisos,
    'linhas', coalesce(jsonb_agg(jsonb_build_object(
      'linha', r.linha, 'situacao', r.situacao, 'motivo', r.motivo, 'ade', r.ade, 'cpf', r.cpf, 'nome', r.nome,
      'valor', r.valor::text, 'saldo', r.saldo::text, 'contrato_numero', k.numero,
      'cliente', coalesce(cl.nome, clm.nome), 'sugestao_contrato_numero', ks.numero,
      'sugestao_cliente', coalesce(cls.nome, clms.nome)) order by r.ord), '[]'::jsonb))
  into v
  from pg_temp._ret r
  left join public.contratos k on k.id = r.contrato_id
  left join public.clientes cl on cl.id = k.cliente_id
  left join public.mensalidades m on m.id = r.mensalidade_id
  left join public.cliente_matriculas cmm on cmm.id = m.matricula_id
  left join public.clientes clm on clm.id = cmm.cliente_id
  left join public.contratos ks on ks.id = r.sugestao_contrato_id
  left join public.clientes cls on cls.id = ks.cliente_id
  left join public.mensalidades ms on ms.id = r.sugestao_mensalidade_id
  left join public.cliente_matriculas cms on cms.id = ms.matricula_id
  left join public.clientes clms on clms.id = cms.cliente_id;
  drop table pg_temp._ret;
  return v;
end $$;

create or replace function public.retorno_gravar(p_convenio_id uuid, p_produto text, p_tipo text, p_competencia date,
                                                 p_linhas jsonb, p_hash text, p_arquivo_nome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_resumo jsonb;
  v_ids uuid[];
begin
  if not public.app_equipe_pode('retorno.importar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock_shared(hashtext('recalcular_atrasos'));
  perform pg_advisory_xact_lock(hashtext('retorno:' || coalesce(p_convenio_id::text, '') || ':' || coalesce(p_produto, '')));
  perform public._retorno_validar(p_convenio_id, p_produto, p_tipo, p_competencia, p_linhas, p_hash);
  if btrim(coalesce(p_arquivo_nome, '')) = '' then
    raise exception 'Informe o nome do arquivo.';
  end if;

  -- trava em ordem fixa, antes de classificar: os donos dos ADEs do arquivo (por id) e depois as parcelas da competência
  if p_produto = 'parcelas' then
    perform 1 from public.contratos where id in (
      select a.contrato_id from public.contrato_averbacoes a
      join (select distinct ltrim(btrim(l ->> 'ade'), '0') as chave from jsonb_array_elements(p_linhas) l
            where btrim(coalesce(l ->> 'ade', '')) <> '') x on ltrim(a.ade, '0') = x.chave
      where a.convenio_id = p_convenio_id) order by id for update;
    perform 1 from public.parcelas p where p.competencia = p_competencia and p.contrato_id in (
      select a.contrato_id from public.contrato_averbacoes a
      join (select distinct ltrim(btrim(l ->> 'ade'), '0') as chave from jsonb_array_elements(p_linhas) l
            where btrim(coalesce(l ->> 'ade', '')) <> '') x on ltrim(a.ade, '0') = x.chave
      where a.convenio_id = p_convenio_id) order by p.id for update;
  else
    perform 1 from public.mensalidades where id in (
      select a.mensalidade_id from public.mensalidade_averbacoes a
      join (select distinct ltrim(btrim(l ->> 'ade'), '0') as chave from jsonb_array_elements(p_linhas) l
            where btrim(coalesce(l ->> 'ade', '')) <> '') x on ltrim(a.ade, '0') = x.chave
      where a.convenio_id = p_convenio_id) order by id for update;
    perform 1 from public.mensalidade_parcelas p where p.competencia = p_competencia and p.mensalidade_id in (
      select a.mensalidade_id from public.mensalidade_averbacoes a
      join (select distinct ltrim(btrim(l ->> 'ade'), '0') as chave from jsonb_array_elements(p_linhas) l
            where btrim(coalesce(l ->> 'ade', '')) <> '') x on ltrim(a.ade, '0') = x.chave
      where a.convenio_id = p_convenio_id) order by p.id for update;
  end if;
  perform public._retorno_classificar(p_convenio_id, p_produto, p_tipo, p_competencia, p_linhas);
  v_resumo := public._retorno_resumo();

  begin
    insert into public.retornos (convenio_id, produto, tipo, competencia, arquivo_nome, hash, resumo)
    values (p_convenio_id, p_produto, p_tipo, p_competencia, btrim(p_arquivo_nome), p_hash, v_resumo)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Este arquivo já foi importado.';
  end;

  insert into public.retorno_linhas (id, retorno_id, linha, dados, ade, cpf, matricula, nome, valor, competencia_arquivo, observacao,
                                     situacao, motivo, contrato_id, parcela_id, mensalidade_id, mensalidade_parcela_id,
                                     sugestao_contrato_id, sugestao_mensalidade_id, valor_aplicado, averbacao_id)
  select id, v_id, linha, dados, ade, cpf, matricula, nome, valor, competencia_arquivo, observacao, situacao, motivo,
         contrato_id, parcela_id, mensalidade_id, mensalidade_parcela_id, sugestao_contrato_id, sugestao_mensalidade_id,
         valor_aplicado, averbacao_id
  from pg_temp._ret order by ord;

  if p_produto = 'parcelas' then
    insert into public.parcela_pagamentos (parcela_id, valor, competencia_desconto, averbacao_id, origem, retorno_linha_id)
    select parcela_id, valor_aplicado, p_competencia, averbacao_id, 'retorno', id
    from pg_temp._ret where valor_aplicado is not null order by ord;
    select array_agg(distinct parcela_id) into v_ids from pg_temp._ret where valor_aplicado is not null;
    perform public._recalcular_parcelas(coalesce(v_ids, '{}'), current_date);
    select array_agg(distinct contrato_id) into v_ids from pg_temp._ret where valor_aplicado is not null;
    perform public._recalcular_situacao_contratos(coalesce(v_ids, '{}'));
  else
    insert into public.mensalidade_pagamentos (mensalidade_parcela_id, valor, competencia_desconto, origem, retorno_linha_id)
    select mensalidade_parcela_id, valor_aplicado, p_competencia, 'retorno', id
    from pg_temp._ret where valor_aplicado is not null order by ord;
    select array_agg(distinct mensalidade_parcela_id) into v_ids from pg_temp._ret where valor_aplicado is not null;
    perform public._recalcular_mensalidade_parcelas(coalesce(v_ids, '{}'), current_date);
  end if;

  drop table pg_temp._ret;
  return jsonb_build_object('retorno_id', v_id, 'resumo', v_resumo);
end $$;

-- Vincular: usa a averbação que a linha encontrou (se for do mesmo contrato); senão a ativa. Trava compartilhada.
create or replace function public.retorno_vincular_linha(p_linha_id uuid, p_destino_id uuid, p_parcela_id uuid, p_motivo text)
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
  perform pg_advisory_xact_lock_shared(hashtext('recalcular_atrasos'));
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
    select id into v_averb from public.contrato_averbacoes where id = l.averbacao_id and contrato_id = k.id;
    if v_averb is null then
      select id into v_averb from public.contrato_averbacoes where contrato_id = k.id and situacao = 'ativa';
    end if;
    insert into public.parcela_pagamentos (parcela_id, valor, competencia_desconto, averbacao_id, origem, retorno_linha_id)
    values (v_parcela, l.valor, r.competencia, v_averb, 'retorno', l.id);
    perform public._recalcular_parcelas(array[v_parcela], current_date);
    perform public._recalcular_situacao_contratos(array[k.id]);
    update public.retorno_linhas set contrato_id = k.id, parcela_id = v_parcela, valor_aplicado = l.valor, averbacao_id = v_averb,
      tratamento = 'vinculada', tratamento_motivo = btrim(p_motivo), tratada_por = auth.uid(), tratada_em = now()
    where id = l.id;
    select status into v_status from public.parcelas where id = v_parcela;
  else
    insert into public.mensalidade_pagamentos (mensalidade_parcela_id, valor, competencia_desconto, origem, retorno_linha_id)
    values (v_parcela, l.valor, r.competencia, 'retorno', l.id);
    perform public._recalcular_mensalidade_parcelas(array[v_parcela], current_date);
    update public.retorno_linhas set mensalidade_id = m.id, mensalidade_parcela_id = v_parcela, valor_aplicado = l.valor,
      tratamento = 'vinculada', tratamento_motivo = btrim(p_motivo), tratada_por = auth.uid(), tratada_em = now()
    where id = l.id;
    select status into v_status from public.mensalidade_parcelas where id = v_parcela;
  end if;
  return jsonb_build_object('status', v_status);
end $$;

-- Baixa: também confere que o contrato (ou a mensalidade) continua ativo.
create or replace function public.diferenca_baixar(p_parcela_id uuid, p_mensalidade_parcela_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_pago numeric;
  v_saldo numeric;
  v_dono uuid;
  v_ativo boolean;
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
  perform pg_advisory_xact_lock_shared(hashtext('recalcular_atrasos'));
  if p_parcela_id is not null then
    select contrato_id into v_dono from public.parcelas where id = p_parcela_id;
    select situacao in ('ativo', 'em_atraso') into v_ativo from public.contratos where id = v_dono for update;
    select status into v_status from public.parcelas where id = p_parcela_id for update;
    select pago, saldo into v_pago, v_saldo from public.v_parcelas_saldo where parcela_id = p_parcela_id;
  else
    select mensalidade_id into v_dono from public.mensalidade_parcelas where id = p_mensalidade_parcela_id;
    select situacao = 'ativa' into v_ativo from public.mensalidades where id = v_dono for update;
    select status into v_status from public.mensalidade_parcelas where id = p_mensalidade_parcela_id for update;
    select pago, saldo into v_pago, v_saldo from public.v_mensalidade_parcelas_saldo where mensalidade_parcela_id = p_mensalidade_parcela_id;
  end if;
  if v_status is null then
    raise exception 'Parcela não encontrada.';
  end if;
  if not v_ativo then
    raise exception 'O contrato ou a mensalidade não está mais ativo.';
  end if;
  if v_status in ('cancelada', 'prejuizo') or coalesce(v_pago, 0) <= 0 or coalesce(v_saldo, 0) <= 0 then
    raise exception 'Só parcelas com desconto parcial têm diferença para dar baixa.';
  end if;
  insert into public.diferenca_baixas (parcela_id, mensalidade_parcela_id, valor, motivo)
  values (p_parcela_id, p_mensalidade_parcela_id, v_saldo, btrim(p_motivo));
  if p_parcela_id is not null then
    perform public._recalcular_parcelas(array[p_parcela_id], current_date);
    perform public._recalcular_situacao_contratos(array[v_dono]);
  else
    perform public._recalcular_mensalidade_parcelas(array[p_mensalidade_parcela_id], current_date);
  end if;
end $$;

-- Desfazer retorno: recálculo em lote e trava compartilhada.
create or replace function public.retorno_desfazer(p_retorno_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.retornos;
  v text;
  v_parcelas uuid[];
  v_donos uuid[];
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
  perform pg_advisory_xact_lock_shared(hashtext('recalcular_atrasos'));
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
    select array_agg(distinct g.parcela_id), array_agg(distinct p.contrato_id) into v_parcelas, v_donos
    from public.parcela_pagamentos g join public.parcelas p on p.id = g.parcela_id
    join public.retorno_linhas l on l.id = g.retorno_linha_id where l.retorno_id = r.id;
    perform 1 from public.contratos where id = any (coalesce(v_donos, '{}')) order by id for update;
    perform 1 from public.parcelas where id = any (coalesce(v_parcelas, '{}')) order by id for update;
    select numero::text into v from public.contratos
    where id = any (coalesce(v_donos, '{}')) and situacao not in ('ativo', 'em_atraso') order by numero limit 1;
    if v is not null then
      raise exception 'Não dá para desfazer: o contrato nº % foi encerrado depois do retorno.', v;
    end if;
    if exists (select 1 from public.diferenca_baixas b where b.criado_em > r.criado_em and b.parcela_id = any (coalesce(v_parcelas, '{}'))) then
      raise exception 'Não dá para desfazer: houve baixa de diferença depois deste retorno.';
    end if;
    delete from public.parcela_pagamentos g using public.retorno_linhas l where l.id = g.retorno_linha_id and l.retorno_id = r.id;
    perform public._recalcular_parcelas(coalesce(v_parcelas, '{}'), current_date);
    perform public._recalcular_situacao_contratos(coalesce(v_donos, '{}'));
  else
    select array_agg(distinct g.mensalidade_parcela_id), array_agg(distinct mp.mensalidade_id) into v_parcelas, v_donos
    from public.mensalidade_pagamentos g join public.mensalidade_parcelas mp on mp.id = g.mensalidade_parcela_id
    join public.retorno_linhas l on l.id = g.retorno_linha_id where l.retorno_id = r.id;
    perform 1 from public.mensalidades where id = any (coalesce(v_donos, '{}')) order by id for update;
    perform 1 from public.mensalidade_parcelas where id = any (coalesce(v_parcelas, '{}')) order by id for update;
    select cm.matricula into v from public.mensalidades m join public.cliente_matriculas cm on cm.id = m.matricula_id
    where m.id = any (coalesce(v_donos, '{}')) and m.situacao <> 'ativa' limit 1;
    if v is not null then
      raise exception 'Não dá para desfazer: a mensalidade da matrícula % foi cancelada depois do retorno.', v;
    end if;
    if exists (select 1 from public.diferenca_baixas b
               where b.criado_em > r.criado_em and b.mensalidade_parcela_id = any (coalesce(v_parcelas, '{}'))) then
      raise exception 'Não dá para desfazer: houve baixa de diferença depois deste retorno.';
    end if;
    delete from public.mensalidade_pagamentos g using public.retorno_linhas l where l.id = g.retorno_linha_id and l.retorno_id = r.id;
    perform public._recalcular_mensalidade_parcelas(coalesce(v_parcelas, '{}'), current_date);
  end if;

  update public.retornos set situacao = 'desfeito', desfeito_em = now(), desfeito_por = auth.uid(), motivo_desfazer = btrim(p_motivo)
  where id = r.id;
end $$;

-- Desfazer importação: trava o que vai ser apagado ANTES de conferir as ligações com o retorno.
create or replace function public.desfazer_importacao(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.app_exigir('importacao.executar');
  perform 1 from public.contratos where importacao_id = p_id order by id for update;
  perform 1 from public.mensalidades where importacao_id = p_id order by id for update;
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

-- Ausentes: por parcela (uma regularização de outra parcela não esconde a da competência).
create or replace function public.retorno_ausentes(p_convenio_id uuid, p_produto text, p_competencia date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._retorno_exigir_ver();
  perform public._retorno_args(p_produto, p_competencia);
  if p_produto = 'parcelas' then
    return (select coalesce(jsonb_agg(jsonb_build_object(
              'contrato_id', k.id, 'contrato_numero', k.numero, 'cliente', cl.nome, 'cpf', cl.cpf, 'matricula', cm.matricula,
              'ade', a.ade, 'valor', p.valor::text, 'saldo', s.saldo::text) order by cl.nome, k.numero), '[]'::jsonb)
            from public.parcelas p
            join public.v_parcelas_saldo s on s.parcela_id = p.id
            join public.contratos k on k.id = p.contrato_id
            join public.clientes cl on cl.id = k.cliente_id
            join public.cliente_matriculas cm on cm.id = k.matricula_id
            left join public.contrato_averbacoes a on a.contrato_id = k.id and a.situacao = 'ativa'
            where k.convenio_id = p_convenio_id and k.situacao in ('ativo', 'em_atraso') and p.competencia = p_competencia
              and p.status not in ('cancelada', 'prejuizo') and s.saldo > 0
              and not exists (select 1 from public.retorno_linhas l join public.retornos r on r.id = l.retorno_id
                              where r.situacao = 'gravado' and r.convenio_id = p_convenio_id and r.produto = 'parcelas'
                                and r.competencia = p_competencia
                                and (l.parcela_id = p.id or (l.parcela_id is null and l.contrato_id = k.id))));
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'mensalidade_id', m.id, 'cliente', cl.nome, 'cpf', cl.cpf, 'matricula', cm.matricula,
            'ade', a.ade, 'valor', mp.valor::text, 'saldo', s.saldo::text) order by cl.nome), '[]'::jsonb)
          from public.mensalidade_parcelas mp
          join public.v_mensalidade_parcelas_saldo s on s.mensalidade_parcela_id = mp.id
          join public.mensalidades m on m.id = mp.mensalidade_id
          join public.cliente_matriculas cm on cm.id = m.matricula_id
          join public.clientes cl on cl.id = cm.cliente_id
          left join public.mensalidade_averbacoes a on a.mensalidade_id = m.id and a.situacao = 'ativa'
          where cm.convenio_id = p_convenio_id and m.situacao = 'ativa' and mp.competencia = p_competencia
            and mp.status <> 'cancelada' and s.saldo > 0
            and not exists (select 1 from public.retorno_linhas l join public.retornos r on r.id = l.retorno_id
                            where r.situacao = 'gravado' and r.convenio_id = p_convenio_id and r.produto = 'mensalidades'
                              and r.competencia = p_competencia
                              and (l.mensalidade_parcela_id = mp.id or (l.mensalidade_parcela_id is null and l.mensalidade_id = m.id))));
end $$;

-- Remessa de mensalidade também limitada ao valor averbado do ADE ativo.
create or replace function public.remessa_dados(p_convenio_id uuid, p_produto text, p_competencia date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not public.app_equipe_pode('retorno.importar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  perform public._retorno_args(p_produto, p_competencia);
  if p_produto = 'parcelas' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'ade', a.ade, 'cpf', cl.cpf, 'matricula', cm.matricula, 'nome', cl.nome,
             'valor', least(s.saldo, a.valor_averbado)::numeric(14,2)::text, 'competencia', p_competencia,
             'parcela_numero', p.numero, 'parcela_total', k.prazo, 'contrato_numero', k.numero, 'servico', 'Empréstimo')
           order by cl.nome, k.numero), '[]'::jsonb)
    into v
    from public.parcelas p
    join public.v_parcelas_saldo s on s.parcela_id = p.id
    join public.contratos k on k.id = p.contrato_id
    join public.contrato_averbacoes a on a.contrato_id = k.id and a.situacao = 'ativa'
    join public.clientes cl on cl.id = k.cliente_id
    join public.cliente_matriculas cm on cm.id = a.matricula_id
    where k.convenio_id = p_convenio_id and k.situacao in ('ativo', 'em_atraso') and p.competencia = p_competencia
      and p.status not in ('cancelada', 'prejuizo') and s.saldo > 0;
  else
    select coalesce(jsonb_agg(x.obj order by x.nome), '[]'::jsonb) into v
    from (
      select cl.nome, jsonb_build_object(
               'ade', a.ade, 'cpf', cl.cpf, 'matricula', cm.matricula, 'nome', cl.nome,
               'valor', least(coalesce(s.saldo, public._valor_mensalidade_em(m.id, p_competencia)), a.valor_averbado)::numeric(14,2)::text,
               'competencia', p_competencia, 'parcela_numero', null, 'parcela_total', null, 'contrato_numero', null,
               'servico', 'Mensalidade') as obj
      from public.mensalidades m
      join public.mensalidade_averbacoes a on a.mensalidade_id = m.id and a.situacao = 'ativa'
      join public.cliente_matriculas cm on cm.id = m.matricula_id
      join public.clientes cl on cl.id = cm.cliente_id
      left join public.mensalidade_parcelas mp on mp.mensalidade_id = m.id and mp.competencia = p_competencia
      left join public.v_mensalidade_parcelas_saldo s on s.mensalidade_parcela_id = mp.id
      where cm.convenio_id = p_convenio_id and m.situacao = 'ativa'
        and (mp.id is null or (mp.status <> 'cancelada' and s.saldo > 0))
        and coalesce(s.saldo, public._valor_mensalidade_em(m.id, p_competencia)) > 0
    ) x;
  end if;
  perform public._registrar_acesso('remessa_gerada', jsonb_build_object(
    'convenio_id', p_convenio_id, 'produto', p_produto, 'competencia', p_competencia, 'linhas', jsonb_array_length(v)));
  return v;
end $$;

-- Índices nas ligações de retorno_linhas: sem eles, apagar um contrato (desfazer importação) varre a tabela inteira.
create index retorno_linhas_contrato on public.retorno_linhas (contrato_id) where contrato_id is not null;
create index retorno_linhas_sug_contrato on public.retorno_linhas (sugestao_contrato_id) where sugestao_contrato_id is not null;
create index retorno_linhas_mensalidade on public.retorno_linhas (mensalidade_id) where mensalidade_id is not null;
create index retorno_linhas_sug_mensalidade on public.retorno_linhas (sugestao_mensalidade_id) where sugestao_mensalidade_id is not null;
