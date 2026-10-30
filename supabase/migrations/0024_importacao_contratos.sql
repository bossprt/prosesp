-- 0024 — Importação: contratos, quitações, dívidas compradas, desconto legado, averbação e evento

create function public._imp_situacao(p text) returns public.situacao_contrato
language plpgsql immutable set search_path = '' as $$
declare
  v text := replace(public._imp_chave(p), ' ', '_');
begin
  if v not in ('ativo', 'em_atraso', 'quitado', 'renovado', 'cancelado', 'prejuizo') then
    raise exception 'Situação inválida: %.', coalesce(nullif(btrim(p), ''), '(vazia)');
  end if;
  return v::public.situacao_contrato;
end $$;

create function public._imp_obrigatorio(p text, p_mensagem text) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or btrim(p) = '' then
    raise exception '%', p_mensagem;
  end if;
  return btrim(p);
end $$;

create or replace function public._imp_contratos(g jsonb, ctx jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_saida jsonb := '[]';
  v_imp uuid := (ctx->>'importacao_id')::uuid;
  v_cli uuid;
  v_mapa jsonb := '{}';         -- nº antigo → {id, linha, liquido} dos contratos gravados agora
  v_existentes text[] := '{}';  -- nºs antigos já gravados antes
  r jsonb;
  v_linha integer;
  v_num text;
  cv public.convenios;
  v_mat public.cliente_matriculas;
  v_tipo public.tipo_contrato;
  v_prazo integer;
  v_parcela numeric;
  v_bruto numeric;
  v_liquido numeric;
  v_lib date;
  v_comp date;
  v_pagas integer;
  v_sit public.situacao_contrato;
  v_parceiro uuid;
  v_id uuid;
  v_k public.contratos;
  v_quitado public.contratos;
  v_saldo numeric;
  v_sobra numeric;
  v_tipo_desc uuid;
  v_ade text;
  e record;
begin
  select id into v_cli from public.clientes where cpf = g->>'cpf';

  -- 1. contratos
  for r in select * from jsonb_array_elements(g->'contratos') loop
    v_linha := (r->>'linha')::int;
    v_num := btrim(r->>'numero_antigo');
    begin
      v_num := public._imp_obrigatorio(v_num, 'Informe o nº do contrato antigo.');
      if exists (select 1 from public.contratos where numero_legado = v_num and cliente_id is distinct from v_cli) then
        raise exception 'O contrato antigo nº % já existe para outro cliente.', v_num;
      end if;
      if exists (select 1 from public.contratos where numero_legado = v_num) then
        v_existentes := v_existentes || v_num;
        v_saida := v_saida || public._imp_item('Contratos', v_linha, 'existente', null);
        continue;
      end if;
      select * into cv from public.convenios where id = public._imp_convenio(r->>'convenio');
      if cv.dia_vencimento is null then
        raise exception 'Configure o dia de vencimento do convênio % antes de importar.', cv.nome;
      end if;
      select * into v_mat from public.cliente_matriculas
      where cliente_id = v_cli and convenio_id = cv.id
        and matricula_normalizada = ltrim(btrim(coalesce(r->>'matricula', '')), '0');
      if not found then
        raise exception 'Matrícula não encontrada para este cliente neste convênio.';
      end if;
      v_tipo := case public._imp_chave(r->>'tipo')
                  when 'novo' then 'novo' when 'refinanciamento' then 'refinanciamento' when 'compra' then 'compra' end;
      if v_tipo is null then
        raise exception 'Tipo inválido: %.', coalesce(nullif(btrim(r->>'tipo'), ''), '(vazio)');
      end if;
      v_prazo := public._imp_inteiro(public._imp_obrigatorio(r->>'prazo', 'Informe o prazo.'), 'Prazo');
      if v_prazo <= 0 then
        raise exception 'Prazo inválido: %.', v_prazo;
      end if;
      v_parcela := public._dinheiro(public._imp_obrigatorio(r->>'valor_parcela', 'Informe o valor da parcela.'));
      v_bruto := public._dinheiro(public._imp_obrigatorio(r->>'valor_bruto', 'Informe o valor bruto.'));
      if v_parcela <= 0 or v_bruto <= 0 then
        raise exception 'Valor da parcela e valor bruto precisam ser maiores que zero.';
      end if;
      v_liquido := public._dinheiro(r->>'valor_liquido');
      if v_liquido is not null and (v_liquido <= 0 or v_liquido > v_bruto) then
        raise exception 'O valor líquido precisa ser maior que zero e no máximo igual ao bruto.';
      end if;
      v_lib := public._imp_data(public._imp_obrigatorio(r->>'data_liberacao', 'Informe a data da liberação.'), 'Data da liberação');
      v_comp := public._imp_competencia(public._imp_obrigatorio(r->>'primeira_competencia', 'Informe a primeira competência.'),
                                        'Primeira competência');
      if v_comp < (date_trunc('month', v_lib) - interval '1 month')::date then
        raise exception 'A primeira competência é anterior à liberação.';
      end if;
      v_pagas := public._imp_inteiro(public._imp_obrigatorio(r->>'parcelas_pagas', 'Informe as parcelas pagas.'), 'Parcelas pagas');
      if v_pagas > v_prazo then
        raise exception 'Parcelas pagas maior que o prazo.';
      end if;
      v_sit := public._imp_situacao(r->>'situacao');
      v_parceiro := null;
      if nullif(btrim(r->>'parceiro'), '') is not null then
        select id into v_parceiro from public.parceiros where public._imp_chave(nome) = public._imp_chave(r->>'parceiro');
        if v_parceiro is null then
          raise exception 'Parceiro não encontrado: %.', btrim(r->>'parceiro');
        end if;
      end if;

      insert into public.contratos (cliente_id, matricula_id, convenio_id, vinculo_id, tipo, parceiro_id, fase, situacao,
                                    fator, prazo, valor_parcela, valor_bruto, valores_travados_em, primeiro_vencimento,
                                    data_liberacao, legado, legado_importado_por, legado_importado_em, numero_legado,
                                    importacao_id)
      values (v_cli, v_mat.id, cv.id, v_mat.vinculo_id, v_tipo, v_parceiro, 'credito_liberado', v_sit,
              round(v_parcela / v_bruto, 8), v_prazo, v_parcela, v_bruto, now(),
              make_date(extract(year from v_comp)::int, extract(month from v_comp)::int, cv.dia_vencimento),
              v_lib, true, auth.uid(), now(), v_num, v_imp)
      returning id into v_id;
      insert into public.contrato_eventos (contrato_id, para, situacao_para, motivo)
      values (v_id, 'credito_liberado', v_sit, 'Importado do sistema anterior');
      v_mapa := v_mapa || jsonb_build_object(v_num, jsonb_build_object('id', v_id, 'linha', v_linha, 'liquido', v_liquido,
                                                                        'ade', nullif(btrim(r->>'ade'), '')));
      v_saida := v_saida || public._imp_item('Contratos', v_linha, 'nova', null);
    exception when others then
      v_saida := v_saida || public._imp_item('Contratos', v_linha, 'erro', sqlerrm);
    end;
  end loop;

  -- 2. quitações (o quitado pode estar no lote ou já gravado)
  for r in select * from jsonb_array_elements(g->'quitacoes') loop
    v_linha := (r->>'linha')::int;
    v_num := btrim(r->>'numero_novo');
    if v_num = any (v_existentes)
       or (not v_mapa ? v_num and exists (select 1 from public.contratos where numero_legado = v_num)) then
      v_saida := v_saida || public._imp_item('Quitações', v_linha, 'existente', null);
      continue;
    end if;
    continue when not v_mapa ? v_num;   -- contrato novo com erro: o grupo inteiro já vai cair
    begin
      select * into v_k from public.contratos where id = (v_mapa->v_num->>'id')::uuid;
      v_saldo := public._dinheiro(public._imp_obrigatorio(r->>'saldo', 'Informe o saldo quitado.'));
      if v_saldo <= 0 then
        raise exception 'O saldo quitado precisa ser maior que zero.';
      end if;
      select * into v_quitado from public.contratos
      where numero_legado = public._imp_obrigatorio(r->>'numero_quitado', 'Informe o nº do contrato quitado.');
      if v_quitado.id is null then
        update public.contratos
        set quitados_legado = concat_ws('; ', quitados_legado, btrim(r->>'numero_quitado')),
            total_quitado = total_quitado + v_saldo
        where id = v_k.id;
        v_saida := v_saida || public._imp_item('Quitações', v_linha, 'aviso',
          format('Contrato quitado nº %s não existe no sistema; guardado só como referência.', btrim(r->>'numero_quitado')));
      else
        if v_quitado.cliente_id <> v_k.cliente_id or v_quitado.situacao <> 'renovado' then
          raise exception 'O contrato antigo nº % não é deste cliente ou não está renovado.', v_quitado.numero_legado;
        end if;
        insert into public.contrato_quitacoes (contrato_id, contrato_quitado_id, saldo_devedor, fonte, observacao, reservado)
        values (v_k.id, v_quitado.id, v_saldo, 'outro', 'Importado', false);
        update public.contratos set total_quitado = total_quitado + v_saldo where id = v_k.id;
      end if;
      v_saida := v_saida || public._imp_item('Quitações', v_linha, 'nova', null);
    exception when others then
      v_saida := v_saida || public._imp_item('Quitações', v_linha, 'erro', sqlerrm);
    end;
  end loop;

  -- 3. dívidas compradas
  for r in select * from jsonb_array_elements(g->'dividas') loop
    v_linha := (r->>'linha')::int;
    v_num := btrim(r->>'numero_antigo');
    if v_num = any (v_existentes)
       or (not v_mapa ? v_num and exists (select 1 from public.contratos where numero_legado = v_num)) then
      v_saida := v_saida || public._imp_item('Dívidas compradas', v_linha, 'existente', null);
      continue;
    end if;
    continue when not v_mapa ? v_num;
    begin
      v_saldo := public._dinheiro(public._imp_obrigatorio(r->>'saldo', 'Informe o saldo da dívida.'));
      if v_saldo <= 0 then
        raise exception 'O saldo da dívida precisa ser maior que zero.';
      end if;
      insert into public.contrato_dividas_externas (contrato_id, credor, numero_contrato_externo, saldo, observacao)
      values ((v_mapa->v_num->>'id')::uuid, public._imp_obrigatorio(r->>'credor', 'Informe o credor.'),
              nullif(btrim(r->>'numero_externo'), ''), v_saldo, 'Importado');
      update public.contratos set total_dividas_externas = total_dividas_externas + v_saldo
      where id = (v_mapa->v_num->>'id')::uuid;
      v_saida := v_saida || public._imp_item('Dívidas compradas', v_linha, 'nova', null);
    exception when others then
      v_saida := v_saida || public._imp_item('Dívidas compradas', v_linha, 'erro', sqlerrm);
    end;
  end loop;

  -- 4. sobra como desconto do sistema anterior e averbação (depois dos totais)
  for e in select key as num, value as v from jsonb_each(v_mapa) loop
    begin
      select * into v_k from public.contratos where id = (e.v->>'id')::uuid;
      if e.v->>'liquido' is not null then
        v_sobra := v_k.valor_bruto - (e.v->>'liquido')::numeric - v_k.total_quitado - v_k.total_dividas_externas;
        if v_sobra < 0 then
          raise exception 'O valor líquido não fecha: bruto menos quitações e dívidas fica menor que o líquido informado.';
        elsif v_sobra > 0 then
          insert into public.convenio_tipos_desconto (convenio_id, nome, forma)
          values (v_k.convenio_id, 'Descontos do sistema anterior', 'fixo')
          on conflict (convenio_id, nome) do nothing;
          select id into v_tipo_desc from public.convenio_tipos_desconto
          where convenio_id = v_k.convenio_id and nome = 'Descontos do sistema anterior';
          insert into public.contrato_descontos (contrato_id, tipo_desconto_id, valor) values (v_k.id, v_tipo_desc, v_sobra);
          update public.contratos set total_descontos = v_sobra where id = v_k.id;
        end if;
      end if;
      if e.v->>'ade' is not null then
        if v_k.situacao in ('ativo', 'em_atraso', 'prejuizo') then
          v_ade := public._validar_ade(v_k.convenio_id, e.v->>'ade', e.v->>'ade');
          insert into public.contrato_averbacoes (contrato_id, convenio_id, matricula_id, ade, situacao, valor_averbado, importacao_id)
          values (v_k.id, v_k.convenio_id, v_k.matricula_id, v_ade, 'ativa', v_k.valor_parcela, v_imp);
        else
          insert into public.contrato_averbacoes (contrato_id, convenio_id, matricula_id, ade, situacao, valor_averbado, importacao_id)
          values (v_k.id, v_k.convenio_id, v_k.matricula_id, e.v->>'ade', 'cancelada', v_k.valor_parcela, v_imp);
        end if;
      end if;
    exception when others then
      v_saida := v_saida || public._imp_item('Contratos', (e.v->>'linha')::int, 'erro', sqlerrm);
    end;
  end loop;
  return v_saida;
end $$;

revoke execute on function public._imp_situacao(text), public._imp_obrigatorio(text, text) from public, anon, authenticated;
revoke execute on function public._imp_contratos(jsonb, jsonb) from public, anon, authenticated;
