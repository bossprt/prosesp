-- 0011 — Cria linha de tabela + comissão numa única operação (tudo ou nada).
-- Valores em reais; faixas e vigência inclusivas nas duas pontas. Base da comissão sai do tipo.

create function public.criar_linha_tabela(
  p_tabela_id uuid, p_vinculo_id uuid, p_tipo public.tipo_contrato, p_prazo integer,
  p_valor_min numeric, p_valor_max numeric, p_idade_min integer, p_idade_max integer,
  p_inicio date, p_fim date, p_fator numeric, p_percentual numeric, p_valor_mensalidade numeric
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.app_exigir('tabelas.editar');
  if p_valor_min is not null and p_valor_max is not null and p_valor_min > p_valor_max then
    raise exception 'A faixa de valor está invertida: o mínimo é maior que o máximo.';
  end if;
  if p_idade_min is not null and p_idade_max is not null and p_idade_min > p_idade_max then
    raise exception 'A faixa de idade está invertida: o mínimo é maior que o máximo.';
  end if;
  if p_inicio is null then
    raise exception 'Informe o início da vigência.';
  end if;
  if p_fim is not null and p_fim < p_inicio then
    raise exception 'O fim da vigência é anterior ao início.';
  end if;

  insert into public.tabela_linhas (tabela_id, vinculo_id, tipo, prazo, faixa_valor, faixa_idade,
                                    vigencia, fator, valor_mensalidade)
  values (p_tabela_id, p_vinculo_id, p_tipo, p_prazo,
          public.faixa_centavos(p_valor_min, p_valor_max), public.faixa_anos(p_idade_min, p_idade_max),
          daterange(p_inicio, p_fim, '[]'), p_fator, p_valor_mensalidade)
  returning id into v_id;

  insert into public.tabela_linha_comissoes (linha_id, percentual, base)
  values (v_id, p_percentual, case when p_tipo = 'compra' then 'bruto' else 'liquido' end::public.base_comissao);
  return v_id;
end $$;

revoke execute on function public.criar_linha_tabela(uuid, uuid, public.tipo_contrato, integer, numeric, numeric,
  integer, integer, date, date, numeric, numeric, numeric) from public, anon;
grant execute on function public.criar_linha_tabela(uuid, uuid, public.tipo_contrato, integer, numeric, numeric,
  integer, integer, date, date, numeric, numeric, numeric) to authenticated;
