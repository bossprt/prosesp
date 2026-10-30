-- 0026 — Importação: mensalidades com histórico de valores

create or replace function public._imp_mensalidades(g jsonb, ctx jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_saida jsonb := '[]';
  v_imp uuid := (ctx->>'importacao_id')::uuid;
  v_cli uuid;
  v_chave text;
  r jsonb;
  v_linha integer;
  v_ok jsonb;        -- linhas válidas da matrícula: {linha, valor, desde, sit, ade}
  v_erro boolean;
  v_ult jsonb;
  v_conv uuid;
  v_mat uuid;
  m public.mensalidades;
  v_sit text;
  v_ade text;
  v_av uuid;
  i integer;
begin
  select id into v_cli from public.clientes where cpf = g->>'cpf';

  for v_chave in
    select distinct public._imp_chave(x->>'convenio') || '|' || ltrim(btrim(coalesce(x->>'matricula', '')), '0')
    from jsonb_array_elements(g->'mensalidades') x
  loop
    v_ok := '[]';
    v_erro := false;
    for r in select x from jsonb_array_elements(g->'mensalidades') x
             where public._imp_chave(x->>'convenio') || '|' || ltrim(btrim(coalesce(x->>'matricula', '')), '0') = v_chave
             order by (x->>'linha')::int loop
      v_linha := (r->>'linha')::int;
      begin
        v_sit := public._imp_chave(r->>'situacao');
        if v_sit not in ('ativa', 'cancelada') then
          raise exception 'Situação da mensalidade inválida: %.', coalesce(nullif(btrim(r->>'situacao'), ''), '(vazia)');
        end if;
        v_ok := v_ok || jsonb_build_array(jsonb_build_object(
          'linha', v_linha,
          'valor', public._dinheiro(public._imp_obrigatorio(r->>'valor', 'Informe o valor da mensalidade.')),
          'desde', public._imp_competencia(public._imp_obrigatorio(r->>'vigente_desde', 'Informe a competência de início.'),
                                           'Vigente desde'),
          'sit', v_sit, 'ade', nullif(btrim(r->>'ade'), '')));
        if (v_ok->-1->>'valor')::numeric <= 0 then
          raise exception 'O valor da mensalidade precisa ser maior que zero.';
        end if;
      exception when others then
        v_erro := true;
        v_saida := v_saida || public._imp_item('Mensalidades', v_linha, 'erro', sqlerrm);
      end;
    end loop;
    continue when v_erro;

    -- competência repetida: erro na linha que veio depois
    for r in select x from jsonb_array_elements(v_ok) x
             where exists (select 1 from jsonb_array_elements(v_ok) y
                           where y->>'desde' = x->>'desde' and (y->>'linha')::int < (x->>'linha')::int) loop
      v_erro := true;
      v_saida := v_saida || public._imp_item('Mensalidades', (r->>'linha')::int, 'erro',
                                             'Competência repetida na mensalidade desta matrícula.');
    end loop;
    continue when v_erro;

    select coalesce(jsonb_agg(x order by (x->>'desde')::date), '[]') into v_ok from jsonb_array_elements(v_ok) x;
    v_ult := v_ok->-1;
    begin
      r := (select x from jsonb_array_elements(g->'mensalidades') x where (x->>'linha')::int = (v_ult->>'linha')::int);
      v_conv := public._imp_convenio(r->>'convenio');
      select id into v_mat from public.cliente_matriculas
      where cliente_id = v_cli and convenio_id = v_conv
        and matricula_normalizada = ltrim(btrim(coalesce(r->>'matricula', '')), '0');
      if v_mat is null then
        raise exception 'Matrícula não encontrada para este cliente neste convênio.';
      end if;

      select * into m from public.mensalidades where matricula_id = v_mat
      order by (situacao = 'ativa') desc, criado_em desc limit 1;
      if m.id is not null then
        if m.situacao = v_ult->>'sit'
           and (m.situacao = 'cancelada'
                or public._valor_mensalidade_em(m.id, (ctx->>'posicao')::date) = (v_ult->>'valor')::numeric) then
          for i in 0 .. jsonb_array_length(v_ok) - 1 loop
            v_saida := v_saida || public._imp_item('Mensalidades', (v_ok->i->>'linha')::int, 'existente', null);
          end loop;
          continue;
        end if;
        raise exception 'Esta matrícula já tem mensalidade no sistema.';
      end if;

      insert into public.mensalidades (matricula_id, situacao, cancelada_em, motivo_cancelamento, importacao_id)
      values (v_mat, v_ult->>'sit',
              case when v_ult->>'sit' = 'cancelada' then now() end,
              case when v_ult->>'sit' = 'cancelada' then 'Cancelada no sistema anterior' end,
              v_imp)
      returning * into m;
      for i in 0 .. jsonb_array_length(v_ok) - 1 loop
        insert into public.mensalidade_valores (mensalidade_id, valor, vigente_desde, tipo)
        values (m.id, (v_ok->i->>'valor')::numeric, (v_ok->i->>'desde')::date, case when i = 0 then 'nova' else 'reajuste' end);
        v_saida := v_saida || public._imp_item('Mensalidades', (v_ok->i->>'linha')::int, 'nova', null);
      end loop;

      select x->>'ade' into v_ade from jsonb_array_elements(v_ok) with ordinality t(x, n)
      where x->>'ade' is not null order by n desc limit 1;
      if v_ade is not null then
        if m.situacao = 'ativa' then
          v_ade := public._validar_ade(v_conv, v_ade, v_ade);
        end if;
        insert into public.mensalidade_averbacoes (matricula_id, convenio_id, ade, situacao, valor_averbado, mensalidade_id,
                                                   importacao_id)
        values (v_mat, v_conv, v_ade, case when m.situacao = 'ativa' then 'ativa' else 'cancelada' end::public.situacao_averbacao,
                (v_ult->>'valor')::numeric, m.id, v_imp)
        returning id into v_av;
        update public.mensalidade_valores set averbacao_id = v_av
        where mensalidade_id = m.id and vigente_desde = (v_ult->>'desde')::date;
      end if;
    exception when others then
      v_saida := v_saida || public._imp_item('Mensalidades', (v_ult->>'linha')::int, 'erro', sqlerrm);
    end;
  end loop;
  return v_saida;
end $$;

revoke execute on function public._imp_mensalidades(jsonb, jsonb) from public, anon, authenticated;
