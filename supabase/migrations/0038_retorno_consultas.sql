-- 0038 — Consultas do retorno: ausentes, remessa, adimplência e diferenças em aberto.

create function public._retorno_exigir_ver() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_equipe_pode('retorno.ver') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
end $$;

create function public._retorno_args(p_produto text, p_competencia date) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_produto is null or p_produto not in ('parcelas', 'mensalidades') then
    raise exception 'Produto inválido.';
  end if;
  if p_competencia is null or extract(day from p_competencia) <> 1 then
    raise exception 'A competência deve ser o primeiro dia do mês.';
  end if;
end $$;

-- Parcelas da competência com saldo que nenhum retorno gravado da competência citou.
create function public.retorno_ausentes(p_convenio_id uuid, p_produto text, p_competencia date) returns jsonb
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
                                and r.competencia = p_competencia and l.contrato_id = k.id));
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
                              and r.competencia = p_competencia and l.mensalidade_id = m.id));
end $$;

-- Descontos esperados na competência (para a remessa). Não muda nada; registra quem gerou.
create function public.remessa_dados(p_convenio_id uuid, p_produto text, p_competencia date) returns jsonb
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
               'valor', coalesce(s.saldo, public._valor_mensalidade_em(m.id, p_competencia))::numeric(14,2)::text,
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

-- Adimplência de um convênio numa competência.
create function public.adimplencia(p_convenio_id uuid, p_competencia date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_parc jsonb;
  v_mens jsonb;
begin
  perform public._retorno_exigir_ver();
  perform public._retorno_args('parcelas', p_competencia);
  select jsonb_build_object(
           'esperado', coalesce(sum(p.valor), 0)::numeric(14,2)::text,
           'recebido', coalesce(sum(s.pago), 0)::numeric(14,2)::text,
           'percentual', case when coalesce(sum(p.valor), 0) > 0 then round(coalesce(sum(s.pago), 0) * 100 / sum(p.valor), 2)::text end,
           'pagas', count(*) filter (where s.saldo <= 0),
           'parciais', count(*) filter (where s.pago > 0 and s.saldo > 0),
           'nao_pagas', count(*) filter (where s.pago = 0 and s.saldo > 0))
  into v_parc
  from public.parcelas p
  join public.v_parcelas_saldo s on s.parcela_id = p.id
  join public.contratos k on k.id = p.contrato_id
  where k.convenio_id = p_convenio_id and p.competencia = p_competencia and p.status <> 'cancelada';

  select jsonb_build_object(
           'esperado', coalesce(sum(mp.valor), 0)::numeric(14,2)::text,
           'recebido', coalesce(sum(s.pago), 0)::numeric(14,2)::text,
           'percentual', case when coalesce(sum(mp.valor), 0) > 0 then round(coalesce(sum(s.pago), 0) * 100 / sum(mp.valor), 2)::text end,
           'pagas', count(*) filter (where s.saldo <= 0),
           'parciais', count(*) filter (where s.pago > 0 and s.saldo > 0),
           'nao_pagas', count(*) filter (where s.pago = 0 and s.saldo > 0),
           'atrasadas', count(*) filter (where mp.status = 'atrasada'))
  into v_mens
  from public.mensalidade_parcelas mp
  join public.v_mensalidade_parcelas_saldo s on s.mensalidade_parcela_id = mp.id
  join public.mensalidades m on m.id = mp.mensalidade_id
  join public.cliente_matriculas cm on cm.id = m.matricula_id
  where cm.convenio_id = p_convenio_id and mp.competencia = p_competencia and mp.status <> 'cancelada';

  return jsonb_build_object(
    'parcelas', v_parc,
    'mensalidades', v_mens,
    'em_atraso', (select coalesce(jsonb_agg(jsonb_build_object(
                    'contrato_id', x.id, 'contrato_numero', x.numero, 'cliente', x.cliente, 'dias', x.dias,
                    'parcelas', x.qtd, 'saldo', x.saldo::text) order by x.dias desc, x.numero), '[]'::jsonb)
                  from (select k.id, k.numero, cl.nome as cliente, (current_date - min(p.vencimento))::int as dias,
                               count(*)::int as qtd, sum(s.saldo)::numeric(14,2) as saldo
                        from public.contratos k
                        join public.clientes cl on cl.id = k.cliente_id
                        join public.parcelas p on p.contrato_id = k.id and p.status = 'atrasada'
                        join public.v_parcelas_saldo s on s.parcela_id = p.id
                        where k.convenio_id = p_convenio_id and k.situacao = 'em_atraso'
                        group by k.id, k.numero, cl.nome) x),
    'tudo_pago', (select coalesce(jsonb_agg(jsonb_build_object('contrato_id', k.id, 'contrato_numero', k.numero, 'cliente', cl.nome)
                    order by k.numero), '[]'::jsonb)
                  from public.contratos k join public.clientes cl on cl.id = k.cliente_id
                  where k.convenio_id = p_convenio_id and k.situacao in ('ativo', 'em_atraso')
                    and exists (select 1 from public.parcelas p where p.contrato_id = k.id)
                    and not exists (select 1 from public.parcelas p where p.contrato_id = k.id
                                    and p.status in ('aberta', 'parcial', 'atrasada'))),
    'nao_descontadas', (select coalesce(jsonb_agg(jsonb_build_object(
                          'linha_id', l.id, 'produto', r.produto, 'contrato_numero', k.numero,
                          'cliente', coalesce(cl.nome, clm.nome, l.nome), 'matricula', l.matricula, 'ade', l.ade,
                          'motivo', l.motivo, 'tratamento', l.tratamento) order by coalesce(cl.nome, clm.nome, l.nome)), '[]'::jsonb)
                        from public.retorno_linhas l
                        join public.retornos r on r.id = l.retorno_id
                        left join public.contratos k on k.id = l.contrato_id
                        left join public.clientes cl on cl.id = k.cliente_id
                        left join public.mensalidades m on m.id = l.mensalidade_id
                        left join public.cliente_matriculas cmm on cmm.id = m.matricula_id
                        left join public.clientes clm on clm.id = cmm.cliente_id
                        where r.situacao = 'gravado' and r.convenio_id = p_convenio_id and r.competencia = p_competencia
                          and l.situacao = 'nao_descontada'));
end $$;

-- Parcelas (e parcelas de mensalidade) com desconto parcial e saldo em aberto.
create function public.diferencas_abertas(p_convenio_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._retorno_exigir_ver();
  return (select coalesce(jsonb_agg(x.obj order by x.competencia desc, x.cliente), '[]'::jsonb) from (
    select p.competencia, cl.nome as cliente, jsonb_build_object(
             'tipo', 'parcela', 'parcela_id', p.id, 'contrato_id', k.id, 'contrato_numero', k.numero, 'cliente', cl.nome,
             'convenio', cv.nome, 'competencia', p.competencia, 'valor', p.valor::text, 'pago', s.pago::text,
             'saldo', s.saldo::text, 'status', p.status) as obj
    from public.parcelas p
    join public.v_parcelas_saldo s on s.parcela_id = p.id
    join public.contratos k on k.id = p.contrato_id
    join public.clientes cl on cl.id = k.cliente_id
    join public.convenios cv on cv.id = k.convenio_id
    where s.pago > 0 and s.saldo > 0 and p.status not in ('cancelada', 'prejuizo')
      and (p_convenio_id is null or k.convenio_id = p_convenio_id)
    union all
    select mp.competencia, cl.nome, jsonb_build_object(
             'tipo', 'mensalidade', 'mensalidade_parcela_id', mp.id, 'mensalidade_id', m.id, 'contrato_numero', null,
             'cliente', cl.nome, 'convenio', cv.nome, 'competencia', mp.competencia, 'valor', mp.valor::text,
             'pago', s.pago::text, 'saldo', s.saldo::text, 'status', mp.status)
    from public.mensalidade_parcelas mp
    join public.v_mensalidade_parcelas_saldo s on s.mensalidade_parcela_id = mp.id
    join public.mensalidades m on m.id = mp.mensalidade_id
    join public.cliente_matriculas cm on cm.id = m.matricula_id
    join public.clientes cl on cl.id = cm.cliente_id
    join public.convenios cv on cv.id = cm.convenio_id
    where s.pago > 0 and s.saldo > 0 and mp.status <> 'cancelada'
      and (p_convenio_id is null or cm.convenio_id = p_convenio_id)) x);
end $$;

revoke execute on function public._retorno_exigir_ver(), public._retorno_args(text, date) from public, anon, authenticated;
revoke execute on function public.retorno_ausentes(uuid, text, date), public.remessa_dados(uuid, text, date),
  public.adimplencia(uuid, date), public.diferencas_abertas(uuid) from public, anon;
grant execute on function public.retorno_ausentes(uuid, text, date), public.remessa_dados(uuid, text, date),
  public.adimplencia(uuid, date), public.diferencas_abertas(uuid) to authenticated;
