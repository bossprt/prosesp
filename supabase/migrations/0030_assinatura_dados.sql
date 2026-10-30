-- 0030 — Dados do contrato já formatados para o documento (PDF)

create function public._fmt_dinheiro(p numeric) returns text
language sql immutable set search_path = '' as $$
  select case when p is null then '' else 'R$ ' || translate(to_char(p, 'FM999,999,999,990.00'), ',.', '.,') end
$$;

create function public._fmt_data(p date) returns text
language sql immutable set search_path = '' as $$
  select coalesce(to_char(p, 'DD/MM/YYYY'), '')
$$;

create function public._fmt_data_extenso(p date) returns text
language sql immutable set search_path = '' as $$
  select extract(day from p)::int || ' de '
      || (array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'])
         [extract(month from p)::int]
      || ' de ' || extract(year from p)::int
$$;

create function public._fmt_cpf(p text) returns text
language sql immutable set search_path = '' as $$
  select case when p ~ '^\d{11}$'
              then substr(p, 1, 3) || '.' || substr(p, 4, 3) || '.' || substr(p, 7, 3) || '-' || substr(p, 10, 2)
              else coalesce(p, '') end
$$;

create function public._fmt_celular(p text) returns text
language sql immutable set search_path = '' as $$
  select case when p ~ '^\d{11}$' then '(' || substr(p, 1, 2) || ') ' || substr(p, 3, 5) || '-' || substr(p, 8, 4)
              when p ~ '^\d{10}$' then '(' || substr(p, 1, 2) || ') ' || substr(p, 3, 4) || '-' || substr(p, 7, 4)
              else coalesce(p, '') end
$$;

revoke execute on function public._fmt_dinheiro(numeric), public._fmt_data(date), public._fmt_data_extenso(date),
  public._fmt_cpf(text), public._fmt_celular(text) from public, anon, authenticated;

create function public.contrato_dados_documento(p_contrato_id uuid, p_data date default current_date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  k public.contratos;
  cl public.clientes;
  m public.cliente_matriculas;
  cv public.convenios;
  ct record;
  v_vinculo text;
  v_comp date;
  v_parcelas jsonb;
  v_ultimo text;
  v_ade text;
  v_ade_mens text;
  v_quitados text;
  v_dividas boolean;
  v_quitacoes boolean;
begin
  if not public.app_pode('contratos.ver') or not public.contrato_visivel(p_contrato_id) then
    raise exception 'Contrato não encontrado.';
  end if;
  select * into k from public.contratos where id = p_contrato_id;
  if k.id is null then
    raise exception 'Contrato não encontrado.';
  end if;
  select * into cl from public.clientes where id = k.cliente_id;
  select * into m from public.cliente_matriculas where id = k.matricula_id;
  select * into cv from public.convenios where id = k.convenio_id;
  select nome into v_vinculo from public.convenio_vinculos where id = k.vinculo_id;
  select b.nome as banco, x.agencia, x.conta, x.tipo_conta, x.chave_pix into ct
  from public.cliente_contas x join public.bancos b on b.id = x.banco_id
  where x.cliente_id = k.cliente_id order by x.principal desc limit 1;

  v_comp := public.primeira_competencia(k.convenio_id, p_data);
  select jsonb_agg(jsonb_build_object(
           'numero', n,
           'competencia', to_char(v_comp + make_interval(months => n - 1), 'MM/YYYY'),
           'vencimento', public._fmt_data(make_date(extract(year from v_comp + make_interval(months => n - 1))::int,
                                                    extract(month from v_comp + make_interval(months => n - 1))::int,
                                                    cv.dia_vencimento)),
           'valor', public._fmt_dinheiro(k.valor_parcela)) order by n)
  into v_parcelas from generate_series(1, k.prazo) n;
  v_ultimo := v_parcelas -> (k.prazo - 1) ->> 'vencimento';

  select a.ade into v_ade from public.contrato_averbacoes a
  where a.contrato_id = k.id and a.situacao in ('ativa', 'proposta') order by a.situacao limit 1;
  select a.ade into v_ade_mens from public.mensalidade_averbacoes a
  where a.contrato_origem_id = k.id and a.situacao in ('proposta', 'ativa') limit 1;
  select string_agg(q.numero::text, ', ' order by q.numero) into v_quitados
  from public.contrato_quitacoes x join public.contratos q on q.id = x.contrato_quitado_id where x.contrato_id = k.id;
  v_quitados := concat_ws(', ', v_quitados, nullif(k.quitados_legado, ''));
  v_quitacoes := k.total_quitado > 0 or exists (select 1 from public.contrato_quitacoes where contrato_id = k.id);
  v_dividas := k.total_dividas_externas > 0 or exists (select 1 from public.contrato_dividas_externas where contrato_id = k.id);

  return jsonb_build_object(
    'campos', jsonb_build_object(
      'cliente.nome', cl.nome,
      'cliente.cpf', public._fmt_cpf(cl.cpf),
      'cliente.rg', btrim(concat_ws(' ', cl.rg, cl.rg_orgao)),
      'cliente.data_nascimento', public._fmt_data(cl.data_nascimento),
      'cliente.estado_civil', coalesce(case cl.estado_civil when 'solteiro' then 'solteiro(a)' when 'casado' then 'casado(a)'
        when 'divorciado' then 'divorciado(a)' when 'viuvo' then 'viúvo(a)' when 'uniao_estavel' then 'em união estável' end, ''),
      'cliente.nome_mae', coalesce(cl.nome_mae, ''),
      'cliente.endereco', concat_ws(', ', nullif(cl.logradouro, ''), nullif(cl.numero, ''), nullif(cl.complemento, ''), nullif(cl.bairro, '')),
      'cliente.cidade_uf', concat_ws('/', nullif(cl.cidade, ''), nullif(cl.uf, '')),
      'cliente.cep', case when cl.cep ~ '^\d{8}$' then substr(cl.cep, 1, 5) || '-' || substr(cl.cep, 6) else coalesce(cl.cep, '') end,
      'cliente.celular', public._fmt_celular(cl.celular),
      'cliente.email', coalesce(cl.email, ''),
      'matricula.numero', m.matricula,
      'matricula.orgao', coalesce(m.orgao, ''),
      'matricula.vinculo', coalesce(v_vinculo, ''),
      'convenio.nome', cv.nome,
      'contrato.numero', k.numero::text,
      'contrato.tipo', case k.tipo when 'novo' then 'Novo' when 'refinanciamento' then 'Refinanciamento' when 'compra' then 'Compra de dívida' end,
      'contrato.prazo', k.prazo::text,
      'contrato.valor_parcela', public._fmt_dinheiro(k.valor_parcela),
      'contrato.valor_bruto', public._fmt_dinheiro(k.valor_bruto),
      'contrato.descontos', public._fmt_dinheiro(k.total_descontos),
      'contrato.quitacoes', public._fmt_dinheiro(k.total_quitado),
      'contrato.dividas', public._fmt_dinheiro(k.total_dividas_externas),
      'contrato.valor_liquido', public._fmt_dinheiro(k.valor_liquido),
      'contrato.quitados', coalesce(v_quitados, ''),
      'contrato.primeira_competencia', to_char(v_comp, 'MM/YYYY'),
      'contrato.primeiro_vencimento', v_parcelas -> 0 ->> 'vencimento',
      'contrato.ultimo_vencimento', v_ultimo,
      'contrato.ade', coalesce(v_ade, ''),
      'mensalidade.valor', public._fmt_dinheiro(k.mensalidade_proposta),
      'mensalidade.ade', coalesce(v_ade_mens, ''),
      'conta.banco', coalesce(ct.banco, ''),
      'conta.agencia', coalesce(ct.agencia, ''),
      'conta.conta', coalesce(ct.conta, ''),
      'conta.tipo', coalesce(case ct.tipo_conta when 'corrente' then 'Corrente' when 'poupanca' then 'Poupança' when 'pagamento' then 'Pagamento' end, ''),
      'conta.pix', coalesce(ct.chave_pix, ''),
      'documento.data', public._fmt_data(p_data),
      'documento.data_extenso', public._fmt_data_extenso(p_data)
    ),
    'condicoes', jsonb_build_object('mensalidade', k.mensalidade_proposta is not null, 'quitacoes', v_quitacoes, 'dividas', v_dividas),
    'parcelas', v_parcelas,
    'valores', jsonb_build_object(
      'valor_parcela', k.valor_parcela::text, 'prazo', k.prazo, 'valor_bruto', k.valor_bruto::text,
      'valor_liquido', k.valor_liquido::text, 'mensalidade_proposta', k.mensalidade_proposta::text)
  );
end $$;
revoke execute on function public.contrato_dados_documento(uuid, date) from public, anon;
grant execute on function public.contrato_dados_documento(uuid, date) to authenticated;
