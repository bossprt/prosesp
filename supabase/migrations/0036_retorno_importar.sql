-- 0036 — Importar retorno: classificação de cada linha, prévia (conferir) e gravação (tudo ou nada).

create index contrato_averbacoes_ade_num on public.contrato_averbacoes (convenio_id, ltrim(ade, '0'));
create index mensalidade_averbacoes_ade_num on public.mensalidade_averbacoes (convenio_id, ltrim(ade, '0'));

-- Matrícula comparável: sem espaços nas pontas e sem zeros à esquerda.
create function public._mat_norm(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(ltrim(btrim(coalesce(p, '')), '0'), '')
$$;

create function public._ade_prioridade(p public.situacao_averbacao) returns integer
language sql immutable set search_path = '' as $$
  select case p when 'ativa' then 1 when 'substituida' then 2 when 'migrada' then 2
                when 'cancelamento_pendente' then 3 when 'proposta' then 4 else 5 end
$$;

-- Valida a chamada e devolve o convênio. Mesma checagem para conferir e gravar.
create function public._retorno_validar(p_convenio_id uuid, p_produto text, p_tipo text, p_competencia date,
                                        p_linhas jsonb, p_hash text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_quando timestamptz;
begin
  if not public.app_equipe_pode('retorno.importar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.convenios where id = p_convenio_id) then
    raise exception 'Convênio não encontrado.';
  end if;
  if p_produto is null or p_produto not in ('parcelas', 'mensalidades') then
    raise exception 'Produto inválido.';
  end if;
  if p_tipo is null or p_tipo not in ('descontados', 'nao_descontados') then
    raise exception 'Tipo de arquivo inválido.';
  end if;
  if p_competencia is null or extract(day from p_competencia) <> 1 then
    raise exception 'A competência deve ser o primeiro dia do mês.';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Identificação do arquivo inválida.';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'O arquivo não tem linhas.';
  end if;
  if jsonb_array_length(p_linhas) > 20000 then
    raise exception 'O arquivo tem mais de 20.000 linhas. Divida em arquivos menores.';
  end if;
  select criado_em into v_quando from public.retornos where hash = p_hash and situacao = 'gravado';
  if v_quando is not null then
    raise exception 'Este arquivo já foi importado em %.', to_char(v_quando at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
  end if;
end $$;

-- Classifica as linhas na tabela temporária pg_temp._ret (uma linha por linha do arquivo, na ordem).
-- Com p_travar, trava cada contrato/mensalidade encontrado (gravação).
create function public._retorno_classificar(p_convenio_id uuid, p_produto text, p_tipo text, p_competencia date,
                                            p_linhas jsonb, p_travar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l jsonb;
  v_ord integer := 0;
  v_ade text; v_cpf text; v_mat text; v_valor_txt text; v_valor numeric; v_comp date; v_obs text;
  v_sit text; v_motivo text;
  v_dono uuid; v_averb uuid; v_averb_sit public.situacao_averbacao; v_averb_mat uuid; v_ambiguo boolean;
  v_contrato public.contratos; v_mens public.mensalidades;
  v_cli_cpf text; v_mat_txt text;
  v_parcela uuid; v_parcela_status text; v_saldo numeric; v_saldo_ini numeric; v_aplicado numeric;
  v_sug_contrato uuid; v_sug_mens uuid;
begin
  drop table if exists pg_temp._ret;
  create temp table _ret (
    id uuid primary key default gen_random_uuid(), ord integer, linha integer, dados jsonb,
    ade text, cpf text, matricula text, nome text, valor numeric(14,2), competencia_arquivo date, observacao text,
    situacao text, motivo text, contrato_id uuid, parcela_id uuid, mensalidade_id uuid, mensalidade_parcela_id uuid,
    averbacao_id uuid, sugestao_contrato_id uuid, sugestao_mensalidade_id uuid, valor_aplicado numeric(14,2), saldo numeric(14,2)
  ) on commit drop;
  drop table if exists pg_temp._ret_saldo;
  create temp table _ret_saldo (parcela_id uuid primary key, inicial numeric, saldo numeric) on commit drop;
  drop table if exists pg_temp._ret_ades;
  create temp table _ret_ades (ade text primary key) on commit drop;

  for l in select value from jsonb_array_elements(p_linhas) loop
    v_ord := v_ord + 1;
    v_sit := null; v_motivo := null; v_contrato := null; v_mens := null; v_parcela := null; v_saldo := null;
    v_aplicado := null; v_sug_contrato := null; v_sug_mens := null; v_averb := null; v_dono := null;
    v_ade := nullif(btrim(coalesce(l ->> 'ade', '')), '');
    v_cpf := nullif(regexp_replace(coalesce(l ->> 'cpf', ''), '\D', '', 'g'), '');
    v_mat := nullif(btrim(coalesce(l ->> 'matricula', '')), '');
    v_obs := nullif(btrim(coalesce(l ->> 'observacao', '')), '');
    v_valor_txt := nullif(btrim(coalesce(l ->> 'valor', '')), '');
    v_valor := null;
    if v_valor_txt is not null then
      begin
        v_valor := public._dinheiro(v_valor_txt);
        if v_valor <= 0 or v_valor <> round(v_valor, 2) or v_valor >= 1000000000000 then
          v_valor := null;
        end if;
      exception when others then
        v_valor := null;
      end;
    end if;
    v_comp := case when coalesce(l ->> 'competencia', '') ~ '^\d{4}-(0[1-9]|1[0-2])-01$' then (l ->> 'competencia')::date end;

    -- 1. dados mínimos
    if v_ade is null and v_cpf is null then
      v_sit := 'ignorada'; v_motivo := 'Linha sem dados suficientes.';
    elsif p_tipo = 'descontados' and v_valor_txt is null then
      v_sit := 'ignorada'; v_motivo := 'Linha sem dados suficientes.';
    elsif v_valor_txt is not null and v_valor is null and p_tipo = 'descontados' then
      v_sit := 'ignorada'; v_motivo := 'Valor inválido.';
    -- 2. competência
    elsif v_comp is not null and v_comp <> p_competencia then
      v_sit := 'divergente'; v_motivo := 'Competência do arquivo diferente da escolhida.';
    -- 3. ADE repetido no arquivo
    elsif v_ade is not null and exists (select 1 from pg_temp._ret_ades where ade = coalesce(nullif(ltrim(v_ade, '0'), ''), v_ade)) then
      v_sit := 'duplicada'; v_motivo := 'ADE repetido no arquivo.';
    end if;
    if v_ade is not null and (v_sit is null or v_sit = 'duplicada') then
      insert into pg_temp._ret_ades values (coalesce(nullif(ltrim(v_ade, '0'), ''), v_ade)) on conflict do nothing;
    end if;

    -- 4. averbação pelo ADE (exato tem prioridade; depois sem zeros à esquerda se os dois forem só dígitos)
    if v_sit is null and v_ade is not null then
      if p_produto = 'parcelas' then
        with c as (
          select a.id, a.situacao, a.contrato_id as dono, a.matricula_id, (a.ade = v_ade) as exato,
                 public._ade_prioridade(a.situacao) as prio
          from public.contrato_averbacoes a
          where a.convenio_id = p_convenio_id and ltrim(a.ade, '0') = ltrim(v_ade, '0')
            and (a.ade = v_ade or (a.ade ~ '^\d+$' and v_ade ~ '^\d+$'))
        ), melhor as (select exato, prio from c order by exato desc, prio limit 1)
        select (select c.id from c join melhor m using (exato, prio) order by c.id limit 1),
               (select c.situacao from c join melhor m using (exato, prio) limit 1),
               (select c.dono from c join melhor m using (exato, prio) order by c.dono limit 1),
               (select c.matricula_id from c join melhor m using (exato, prio) order by c.dono limit 1),
               (select count(distinct c.dono) > 1 from c join melhor m using (exato, prio))
        into v_averb, v_averb_sit, v_dono, v_averb_mat, v_ambiguo;
      else
        with c as (
          select a.id, a.situacao, a.mensalidade_id as dono, a.matricula_id, (a.ade = v_ade) as exato,
                 public._ade_prioridade(a.situacao) as prio
          from public.mensalidade_averbacoes a
          where a.convenio_id = p_convenio_id and ltrim(a.ade, '0') = ltrim(v_ade, '0')
            and (a.ade = v_ade or (a.ade ~ '^\d+$' and v_ade ~ '^\d+$'))
        ), melhor as (select exato, prio from c order by exato desc, prio limit 1)
        select (select c.id from c join melhor m using (exato, prio) order by c.id limit 1),
               (select c.situacao from c join melhor m using (exato, prio) limit 1),
               (select c.dono from c join melhor m using (exato, prio) order by c.dono nulls last limit 1),
               (select c.matricula_id from c join melhor m using (exato, prio) order by c.dono nulls last limit 1),
               (select count(distinct coalesce(c.dono, c.id)) > 1 from c join melhor m using (exato, prio))
        into v_averb, v_averb_sit, v_dono, v_averb_mat, v_ambiguo;
      end if;

      if v_averb is null then
        v_sit := 'nao_encontrada'; v_motivo := 'ADE não encontrado no sistema.';
      elsif v_ambiguo then
        v_sit := 'divergente'; v_motivo := 'Mais de um cadastro com este ADE.';
      elsif v_averb_sit = 'cancelada' then
        v_sit := 'divergente'; v_motivo := 'ADE cancelado no sistema.';
      elsif v_averb_sit = 'cancelamento_pendente' then
        v_sit := 'divergente'; v_motivo := 'ADE com cancelamento pendente na averbadora.';
      elsif v_averb_sit = 'proposta' or v_dono is null then
        v_sit := 'divergente';
        v_motivo := case when p_produto = 'parcelas' then 'ADE de contrato ainda não liberado.'
                         else 'ADE de mensalidade ainda não liberado.' end;
      end if;
    elsif v_sit is null then
      v_sit := 'nao_encontrada'; v_motivo := 'ADE não encontrado no sistema.';
    end if;

    -- sugestão por CPF + matrícula quando o ADE não foi achado
    if v_sit = 'nao_encontrada' and v_cpf is not null and v_mat is not null then
      if p_produto = 'parcelas' then
        select case when count(distinct k.id) = 1 then min(k.id::text)::uuid end into v_sug_contrato
        from public.contratos k
        join public.clientes cl on cl.id = k.cliente_id
        join public.cliente_matriculas cm on cm.id = k.matricula_id
        where k.convenio_id = p_convenio_id and k.situacao in ('ativo', 'em_atraso')
          and regexp_replace(cl.cpf, '\D', '', 'g') = v_cpf and public._mat_norm(cm.matricula) = public._mat_norm(v_mat)
          and exists (select 1 from public.parcelas p where p.contrato_id = k.id and p.competencia = p_competencia);
      else
        select case when count(distinct m.id) = 1 then min(m.id::text)::uuid end into v_sug_mens
        from public.mensalidades m
        join public.cliente_matriculas cm on cm.id = m.matricula_id
        join public.clientes cl on cl.id = cm.cliente_id
        where cm.convenio_id = p_convenio_id and m.situacao = 'ativa'
          and regexp_replace(cl.cpf, '\D', '', 'g') = v_cpf and public._mat_norm(cm.matricula) = public._mat_norm(v_mat);
      end if;
    end if;

    -- 5. dono (contrato ou mensalidade), CPF e matrícula
    if v_sit is null then
      if p_produto = 'parcelas' then
        if p_travar then
          select * into v_contrato from public.contratos where id = v_dono for update;
        else
          select * into v_contrato from public.contratos where id = v_dono;
        end if;
        select regexp_replace(cpf, '\D', '', 'g') into v_cli_cpf from public.clientes where id = v_contrato.cliente_id;
        if v_contrato.situacao not in ('ativo', 'em_atraso') then
          v_sit := 'divergente'; v_motivo := format('Contrato não está ativo (situação: %s).', v_contrato.situacao);
        end if;
      else
        if p_travar then
          select * into v_mens from public.mensalidades where id = v_dono for update;
        else
          select * into v_mens from public.mensalidades where id = v_dono;
        end if;
        select regexp_replace(cl.cpf, '\D', '', 'g') into v_cli_cpf
        from public.cliente_matriculas cm join public.clientes cl on cl.id = cm.cliente_id where cm.id = v_mens.matricula_id;
        if v_mens.situacao <> 'ativa' then
          v_sit := 'divergente'; v_motivo := 'Mensalidade cancelada.';
        end if;
      end if;
      select matricula into v_mat_txt from public.cliente_matriculas where id = v_averb_mat;
      if v_sit is null and v_cpf is not null and v_cpf <> v_cli_cpf then
        v_sit := 'divergente'; v_motivo := 'CPF diferente do cadastro.';
      elsif v_sit is null and v_mat is not null and public._mat_norm(v_mat) is distinct from public._mat_norm(v_mat_txt) then
        v_sit := 'divergente'; v_motivo := 'Matrícula diferente do cadastro.';
      end if;
    end if;

    -- 6. parcela da competência e saldo (consumido em ordem dentro do arquivo)
    if v_sit is null then
      if p_produto = 'parcelas' then
        select id, status into v_parcela, v_parcela_status from public.parcelas
        where contrato_id = v_contrato.id and competencia = p_competencia;
      else
        select id, status into v_parcela, v_parcela_status from public.mensalidade_parcelas
        where mensalidade_id = v_mens.id and competencia = p_competencia;
      end if;
      if v_parcela is null then
        v_sit := 'divergente'; v_motivo := 'Não há parcela nesta competência.';
      elsif v_parcela_status in ('cancelada', 'prejuizo') then
        v_sit := 'divergente'; v_motivo := 'Parcela cancelada ou em prejuízo.';
      else
        select inicial, saldo into v_saldo_ini, v_saldo from pg_temp._ret_saldo where parcela_id = v_parcela;
        if v_saldo is null then
          if p_produto = 'parcelas' then
            if p_travar then
              perform 1 from public.parcelas where id = v_parcela for update;
            end if;
            select saldo into v_saldo from public.v_parcelas_saldo where parcela_id = v_parcela;
          else
            if p_travar then
              perform 1 from public.mensalidade_parcelas where id = v_parcela for update;
            end if;
            select saldo into v_saldo from public.v_mensalidade_parcelas_saldo where mensalidade_parcela_id = v_parcela;
          end if;
          v_saldo_ini := v_saldo;
          insert into pg_temp._ret_saldo values (v_parcela, v_saldo, v_saldo);
        end if;
        if v_saldo <= 0 then
          v_sit := 'duplicada';
          v_motivo := case when v_saldo_ini > 0 then 'Parcela já paga por outra linha deste arquivo.' else 'Parcela já paga.' end;
        elsif p_tipo = 'nao_descontados' then
          v_sit := 'nao_descontada'; v_motivo := coalesce(v_obs, 'Não descontado pela folha.');
        elsif v_valor > v_saldo then
          v_sit := 'divergente'; v_motivo := 'Desconto maior que o saldo da parcela.';
        else
          v_aplicado := v_valor;
          v_sit := case when v_averb_sit <> 'ativa' then 'ade_antiga' when v_valor = v_saldo then 'conciliada' else 'parcial' end;
          update pg_temp._ret_saldo set saldo = saldo - v_valor where parcela_id = v_parcela;
        end if;
      end if;
    end if;

    insert into pg_temp._ret (ord, linha, dados, ade, cpf, matricula, nome, valor, competencia_arquivo, observacao, situacao, motivo,
                              contrato_id, parcela_id, mensalidade_id, mensalidade_parcela_id, averbacao_id,
                              sugestao_contrato_id, sugestao_mensalidade_id, valor_aplicado, saldo)
    values (v_ord, coalesce((l ->> 'linha')::integer, v_ord),
            case when jsonb_typeof(l -> 'dados') = 'object' then l -> 'dados' else '{}'::jsonb end,
            v_ade, v_cpf, v_mat, nullif(btrim(coalesce(l ->> 'nome', '')), ''), v_valor, v_comp, v_obs, v_sit, v_motivo,
            v_contrato.id, case when p_produto = 'parcelas' then v_parcela end, v_mens.id,
            case when p_produto = 'mensalidades' then v_parcela end, v_averb, v_sug_contrato, v_sug_mens, v_aplicado,
            case when v_parcela is not null then coalesce(v_saldo_ini, v_saldo) end);
  end loop;
end $$;

create function public._retorno_resumo() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select coalesce(jsonb_object_agg(situacao, jsonb_build_object('qtd', qtd, 'soma', soma)), '{}'::jsonb)
          from (select situacao, count(*)::int as qtd, coalesce(sum(valor), 0)::numeric(14,2)::text as soma
                from pg_temp._ret group by situacao) x);
end $$;

create function public.retorno_conferir(p_convenio_id uuid, p_produto text, p_tipo text, p_competencia date,
                                        p_linhas jsonb, p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  perform public._retorno_validar(p_convenio_id, p_produto, p_tipo, p_competencia, p_linhas, p_hash);
  perform public._retorno_classificar(p_convenio_id, p_produto, p_tipo, p_competencia, p_linhas, false);
  select jsonb_build_object(
    'resumo', public._retorno_resumo(),
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
  drop table pg_temp._ret_saldo;
  drop table pg_temp._ret_ades;
  return v;
end $$;

create function public.retorno_gravar(p_convenio_id uuid, p_produto text, p_tipo text, p_competencia date,
                                      p_linhas jsonb, p_hash text, p_arquivo_nome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_resumo jsonb;
  v_pid uuid;
  v_kid uuid;
begin
  if not public.app_equipe_pode('retorno.importar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('retorno:' || coalesce(p_convenio_id::text, '') || ':' || coalesce(p_produto, '')));
  perform public._retorno_validar(p_convenio_id, p_produto, p_tipo, p_competencia, p_linhas, p_hash);
  if btrim(coalesce(p_arquivo_nome, '')) = '' then
    raise exception 'Informe o nome do arquivo.';
  end if;
  perform public._retorno_classificar(p_convenio_id, p_produto, p_tipo, p_competencia, p_linhas, true);
  v_resumo := public._retorno_resumo();

  insert into public.retornos (convenio_id, produto, tipo, competencia, arquivo_nome, hash, resumo)
  values (p_convenio_id, p_produto, p_tipo, p_competencia, btrim(p_arquivo_nome), p_hash, v_resumo)
  returning id into v_id;

  insert into public.retorno_linhas (id, retorno_id, linha, dados, ade, cpf, matricula, nome, valor, competencia_arquivo, observacao,
                                     situacao, motivo, contrato_id, parcela_id, mensalidade_id, mensalidade_parcela_id,
                                     sugestao_contrato_id, sugestao_mensalidade_id, valor_aplicado)
  select id, v_id, linha, dados, ade, cpf, matricula, nome, valor, competencia_arquivo, observacao, situacao, motivo,
         contrato_id, parcela_id, mensalidade_id, mensalidade_parcela_id, sugestao_contrato_id, sugestao_mensalidade_id, valor_aplicado
  from pg_temp._ret order by ord;

  if p_produto = 'parcelas' then
    insert into public.parcela_pagamentos (parcela_id, valor, competencia_desconto, averbacao_id, origem, retorno_linha_id)
    select parcela_id, valor_aplicado, p_competencia, averbacao_id, 'retorno', id
    from pg_temp._ret where valor_aplicado is not null order by ord;
    for v_pid in select distinct parcela_id from pg_temp._ret where valor_aplicado is not null loop
      perform public._recalcular_parcela(v_pid, current_date);
    end loop;
    for v_kid in select distinct contrato_id from pg_temp._ret where valor_aplicado is not null loop
      perform public._recalcular_situacao_contrato(v_kid);
    end loop;
  else
    insert into public.mensalidade_pagamentos (mensalidade_parcela_id, valor, competencia_desconto, origem, retorno_linha_id)
    select mensalidade_parcela_id, valor_aplicado, p_competencia, 'retorno', id
    from pg_temp._ret where valor_aplicado is not null order by ord;
    for v_pid in select distinct mensalidade_parcela_id from pg_temp._ret where valor_aplicado is not null loop
      perform public._recalcular_mensalidade_parcela(v_pid, current_date);
    end loop;
  end if;

  drop table pg_temp._ret;
  drop table pg_temp._ret_saldo;
  drop table pg_temp._ret_ades;
  return jsonb_build_object('retorno_id', v_id, 'resumo', v_resumo);
end $$;

revoke execute on function public._mat_norm(text), public._ade_prioridade(public.situacao_averbacao),
  public._retorno_validar(uuid, text, text, date, jsonb, text),
  public._retorno_classificar(uuid, text, text, date, jsonb, boolean), public._retorno_resumo()
  from public, anon, authenticated;
revoke execute on function public.retorno_conferir(uuid, text, text, date, jsonb, text),
  public.retorno_gravar(uuid, text, text, date, jsonb, text, text) from public, anon;
grant execute on function public.retorno_conferir(uuid, text, text, date, jsonb, text),
  public.retorno_gravar(uuid, text, text, date, jsonb, text, text) to authenticated;
