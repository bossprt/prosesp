-- 0006 — Simulador
-- Arredonda uma única vez, no fim. Valor a partir da parcela arredonda PARA BAIXO,
-- para nunca liberar um valor cuja parcela passe da margem.

-- Linhas candidatas (sem olhar faixa de valor). Valida idade.
create function public._linhas_candidatas(
  p_convenio_id uuid, p_vinculo_id uuid, p_tipo public.tipo_contrato, p_prazo integer,
  p_data_nascimento date, p_data date
) returns setof public.tabela_linhas
language plpgsql stable security definer set search_path = '' as $$
declare
  v_idade integer;
begin
  if p_data_nascimento is null then
    if exists (
      select 1 from public.tabela_linhas l
      where l.convenio_id = p_convenio_id and l.vinculo_id = p_vinculo_id and l.tipo = p_tipo
        and l.prazo = p_prazo and l.vigencia @> p_data
        and not (lower_inf(l.faixa_idade) and upper_inf(l.faixa_idade))
    ) then
      raise exception 'Informe a data de nascimento para simular.';
    end if;
  else
    v_idade := extract(year from age(p_data, p_data_nascimento))::integer;
  end if;

  return query
    select l.* from public.tabela_linhas l
    where l.convenio_id = p_convenio_id and l.vinculo_id = p_vinculo_id and l.tipo = p_tipo
      and l.prazo = p_prazo and l.vigencia @> p_data
      and (v_idade is null or l.faixa_idade @> v_idade);
end $$;

create function public._resultado_simulacao(
  p_linha public.tabela_linhas, p_entrada text, p_valor numeric, p_parcela numeric, p_gravar boolean
) returns table (
  linha_id uuid, fator numeric, valor numeric, parcela numeric, valor_mensalidade numeric,
  percentual_comissao numeric, base_comissao public.base_comissao, simulacao_id uuid
)
language plpgsql security definer set search_path = '' as $$
declare
  v_sim uuid;
begin
  if p_gravar then
    insert into public.simulacoes (linha_id, entrada, valor, parcela, criado_por)
    values (p_linha.id, p_entrada, p_valor, p_parcela, auth.uid())
    returning id into v_sim;
  end if;
  return query
    select p_linha.id, p_linha.fator, p_valor, p_parcela, p_linha.valor_mensalidade,
           c.percentual, c.base, v_sim
    from (select 1) x
    left join public.tabela_linha_comissoes c on c.linha_id = p_linha.id;
end $$;

create function public.simular_por_valor(
  p_convenio_id uuid, p_vinculo_id uuid, p_tipo public.tipo_contrato, p_prazo integer,
  p_valor numeric, p_data_nascimento date default null, p_data date default current_date,
  p_gravar boolean default false
) returns table (
  linha_id uuid, fator numeric, valor numeric, parcela numeric, valor_mensalidade numeric,
  percentual_comissao numeric, base_comissao public.base_comissao, simulacao_id uuid
)
language plpgsql security definer set search_path = '' as $$
declare
  v_linha public.tabela_linhas;
  v_valor numeric(14,2);
begin
  perform public.app_exigir('simulador.usar');
  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;
  v_valor := round(p_valor, 2);
  select * into v_linha
  from public._linhas_candidatas(p_convenio_id, p_vinculo_id, p_tipo, p_prazo, p_data_nascimento, p_data) l
  where l.faixa_valor @> round(v_valor * 100)::bigint;
  if v_linha.id is null then
    raise exception 'Nenhuma tabela vigente atende esta simulação.';
  end if;
  return query select * from public._resultado_simulacao(
    v_linha, 'valor', v_valor, round(v_valor * v_linha.fator, 2), p_gravar);
end $$;

create function public.simular_por_parcela(
  p_convenio_id uuid, p_vinculo_id uuid, p_tipo public.tipo_contrato, p_prazo integer,
  p_parcela numeric, p_data_nascimento date default null, p_data date default current_date,
  p_gravar boolean default false
) returns table (
  linha_id uuid, fator numeric, valor numeric, parcela numeric, valor_mensalidade numeric,
  percentual_comissao numeric, base_comissao public.base_comissao, simulacao_id uuid
)
language plpgsql security definer set search_path = '' as $$
declare
  v_linha public.tabela_linhas;
  v_valor numeric(14,2);
  v_parcela numeric(14,2);
begin
  perform public.app_exigir('simulador.usar');
  if p_parcela is null or p_parcela <= 0 then
    raise exception 'Informe uma parcela maior que zero.';
  end if;
  v_parcela := round(p_parcela, 2);
  -- cada linha candidata calcula o seu valor; vale a de maior valor cuja faixa contém esse valor
  select l.* into v_linha
  from public._linhas_candidatas(p_convenio_id, p_vinculo_id, p_tipo, p_prazo, p_data_nascimento, p_data) l
  where l.faixa_valor @> (floor(v_parcela / l.fator * 100))::bigint
  order by floor(v_parcela / l.fator * 100) desc
  limit 1;
  if v_linha.id is null then
    raise exception 'Nenhuma tabela vigente atende esta simulação.';
  end if;
  v_valor := floor(v_parcela / v_linha.fator * 100) / 100;
  return query select * from public._resultado_simulacao(v_linha, 'parcela', v_valor, v_parcela, p_gravar);
end $$;

revoke execute on function
  public._linhas_candidatas(uuid, uuid, public.tipo_contrato, integer, date, date),
  public._resultado_simulacao(public.tabela_linhas, text, numeric, numeric, boolean)
  from public, anon, authenticated;
revoke execute on function
  public.simular_por_valor(uuid, uuid, public.tipo_contrato, integer, numeric, date, date, boolean),
  public.simular_por_parcela(uuid, uuid, public.tipo_contrato, integer, numeric, date, date, boolean)
  from public, anon;
grant execute on function
  public.simular_por_valor(uuid, uuid, public.tipo_contrato, integer, numeric, date, date, boolean),
  public.simular_por_parcela(uuid, uuid, public.tipo_contrato, integer, numeric, date, date, boolean)
  to authenticated;
