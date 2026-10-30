-- 0025 — Importação: parcelas (da aba Parcelas ou geradas) e situação pelas vencidas até a data da posição

create or replace function public._imp_parcelas(g jsonb, ctx jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_saida jsonb := '[]';
  v_posicao date := (ctx->>'posicao')::date;
  c jsonb;
  r jsonb;
  k public.contratos;
  v_dia integer;
  v_averb uuid;
  v_linhas jsonb;
  v_linha integer;
  v_num integer;
  v_comp date;
  v_valor numeric;
  v_status text;
  v_parcela uuid;
  v_pagas integer;
  v_nova public.situacao_contrato;
  v_erro boolean;
begin
  for c in select * from jsonb_array_elements(g->'contratos') loop
    select * into k from public.contratos where numero_legado = btrim(c->>'numero_antigo');
    continue when k.id is null;
    select coalesce(jsonb_agg(p order by (p->>'linha')::int), '[]') into v_linhas
    from jsonb_array_elements(g->'parcelas') p where btrim(p->>'numero_antigo') = k.numero_legado;

    if exists (select 1 from public.parcelas where contrato_id = k.id) then   -- contrato que já existia
      for r in select * from jsonb_array_elements(v_linhas) loop
        v_saida := v_saida || public._imp_item('Parcelas', (r->>'linha')::int, 'existente', null);
      end loop;
      continue;
    end if;

    select dia_vencimento into v_dia from public.convenios where id = k.convenio_id;
    select id into v_averb from public.contrato_averbacoes where contrato_id = k.id and situacao = 'ativa';

    if jsonb_array_length(v_linhas) > 0 then
      v_erro := false;
      for r in select * from jsonb_array_elements(v_linhas) loop
        v_linha := (r->>'linha')::int;
        begin
          v_num := public._imp_inteiro(public._imp_obrigatorio(r->>'numero', 'Informe o nº da parcela.'), 'Nº da parcela');
          if v_num < 1 or v_num > k.prazo then
            raise exception 'Nº da parcela inválido: %.', v_num;
          end if;
          v_comp := public._imp_competencia(public._imp_obrigatorio(r->>'competencia', 'Informe a competência.'), 'Competência');
          v_valor := public._dinheiro(public._imp_obrigatorio(r->>'valor', 'Informe o valor da parcela.'));
          if v_valor <= 0 then
            raise exception 'O valor da parcela precisa ser maior que zero.';
          end if;
          v_status := public._imp_chave(r->>'situacao');
          if v_status not in ('paga', 'aberta', 'atrasada', 'cancelada') then
            raise exception 'Situação da parcela inválida: %.', coalesce(nullif(btrim(r->>'situacao'), ''), '(vazia)');
          end if;
          -- aberta e já vencida na data da posição: atrasada (mesma regra das parcelas geradas)
          if v_status = 'aberta'
             and make_date(extract(year from v_comp)::int, extract(month from v_comp)::int, v_dia) < v_posicao then
            v_status := 'atrasada';
          end if;
          begin
            insert into public.parcelas (contrato_id, numero, competencia, vencimento, valor, status, averbacao_id)
            values (k.id, v_num, v_comp,
                    make_date(extract(year from v_comp)::int, extract(month from v_comp)::int, v_dia),
                    v_valor, v_status, v_averb)
            returning id into v_parcela;
          exception when unique_violation then
            raise exception 'Parcela repetida (mesmo número ou mesma competência).';
          end;
          if v_status = 'paga' then
            insert into public.parcela_pagamentos (parcela_id, valor, competencia_desconto, averbacao_id, origem)
            values (v_parcela, v_valor, v_comp, v_averb, 'legado');
          end if;
          v_saida := v_saida || public._imp_item('Parcelas', v_linha, 'nova', null);
        exception when others then
          v_erro := true;
          v_saida := v_saida || public._imp_item('Parcelas', v_linha, 'erro', sqlerrm);
        end;
      end loop;
      if not v_erro and (select count(*) from public.parcelas where contrato_id = k.id) <> k.prazo then
        v_saida := v_saida || public._imp_item('Contratos', (c->>'linha')::int, 'erro',
          format('A aba Parcelas precisa ter as %s parcelas deste contrato.', k.prazo));
      end if;
    else
      v_pagas := public._imp_inteiro(c->>'parcelas_pagas', 'Parcelas pagas');
      insert into public.parcelas (contrato_id, numero, competencia, vencimento, valor, status, averbacao_id)
      select k.id, n, comp, venc, k.valor_parcela,
             case when n <= v_pagas then 'paga'
                  when k.situacao in ('quitado', 'renovado', 'cancelado') then 'cancelada'
                  when k.situacao = 'prejuizo' then 'prejuizo'
                  when venc < v_posicao then 'atrasada'
                  else 'aberta' end,
             v_averb
      from generate_series(1, k.prazo) n,
           lateral (select (date_trunc('month', k.primeiro_vencimento) + make_interval(months => n - 1))::date as comp) x,
           lateral (select make_date(extract(year from x.comp)::int, extract(month from x.comp)::int, v_dia) as venc) y;
      insert into public.parcela_pagamentos (parcela_id, valor, competencia_desconto, averbacao_id, origem)
      select p.id, p.valor, p.competencia, v_averb, 'legado'
      from public.parcelas p where p.contrato_id = k.id and p.status = 'paga';
    end if;

    update public.contratos set primeiro_vencimento = (select min(vencimento) from public.parcelas where contrato_id = k.id)
    where id = k.id;

    if k.situacao in ('ativo', 'em_atraso') then
      v_nova := case when exists (select 1 from public.parcelas where contrato_id = k.id and status = 'atrasada')
                     then 'em_atraso' else 'ativo' end;
      if v_nova <> k.situacao then
        update public.contratos set situacao = v_nova where id = k.id;
        v_saida := v_saida || public._imp_item('Contratos', (c->>'linha')::int, 'aviso',
          format('Situação ajustada para %s pelas parcelas vencidas até a data da posição.',
                 case v_nova when 'em_atraso' then 'em atraso' else 'ativo' end));
      end if;
    end if;
  end loop;

  -- parcelas de contrato que já estava gravado e não veio na aba Contratos deste arquivo
  for r in select p from jsonb_array_elements(g->'parcelas') p
           where not exists (select 1 from jsonb_array_elements(g->'contratos') y
                             where btrim(y->>'numero_antigo') = btrim(p->>'numero_antigo')) loop
    v_saida := v_saida || public._imp_item('Parcelas', (r->>'linha')::int, 'existente', null);
  end loop;
  return v_saida;
end $$;

revoke execute on function public._imp_parcelas(jsonb, jsonb) from public, anon, authenticated;
