-- 0023 — Importação: processador por CPF, prévia, lotes, clientes e matrículas

-- ── Auxiliares ────────────────────────────────────────────────
create function public._imp_cpf(p text) returns text
language sql immutable set search_path = '' as $$
  select case when public.so_digitos(p) = '' then null else public.normalizar_cpf(p) end
$$;

create function public._imp_item(p_aba text, p_linha integer, p_tipo text, p_mensagem text) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_array(jsonb_build_object('aba', p_aba, 'linha', p_linha, 'tipo', p_tipo, 'mensagem', p_mensagem))
$$;

create function public._imp_aba(p_chave text) returns text
language sql immutable set search_path = '' as $$
  select case p_chave
    when 'clientes' then 'Clientes' when 'matriculas' then 'Matrículas' when 'contratos' then 'Contratos'
    when 'quitacoes' then 'Quitações' when 'dividas' then 'Dívidas compradas' when 'parcelas' then 'Parcelas'
    when 'mensalidades' then 'Mensalidades' end
$$;

create function public._imp_ordem_aba(p_aba text) returns integer
language sql immutable set search_path = '' as $$
  select array_position(array['Arquivo', 'Clientes', 'Matrículas', 'Contratos', 'Quitações', 'Dívidas compradas',
                              'Parcelas', 'Mensalidades'], p_aba)
$$;

create function public._imp_convenio(p_nome text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v uuid;
begin
  select id into v from public.convenios where public._imp_chave(nome) = public._imp_chave(p_nome);
  if v is null then
    raise exception 'Convênio não encontrado: %.', coalesce(nullif(btrim(p_nome), ''), '(vazio)');
  end if;
  return v;
end $$;

-- Grupo desfeito: só ficam os erros; as linhas sem erro próprio recebem o aviso do CPF
create function public._imp_falhou(g jsonb, p_saida jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select s as x from jsonb_array_elements(p_saida) s where s->>'tipo' = 'erro'
    union all
    select jsonb_build_object('aba', public._imp_aba(k), 'linha', (r->>'linha')::int, 'tipo', 'erro',
                              'mensagem', 'Não importado: há erro em outra linha deste CPF.')
    from unnest(array['clientes', 'matriculas', 'contratos', 'quitacoes', 'dividas', 'parcelas', 'mensalidades']) k,
         jsonb_array_elements(coalesce(g->k, '[]')) r
    where not exists (
      select 1 from jsonb_array_elements(p_saida) s
      where s->>'tipo' = 'erro' and s->>'aba' = public._imp_aba(k) and (s->>'linha')::int = (r->>'linha')::int
    )
  ) t
$$;

create function public._imp_resultado(p_saida jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  with s as (select x->>'aba' as aba, (x->>'linha')::int as linha, x->>'tipo' as tipo, x->>'mensagem' as mensagem
             from jsonb_array_elements(p_saida) x)
  select jsonb_build_object(
    'resumo', (select jsonb_object_agg(a, jsonb_build_object(
                 'novas', (select count(*) from s where s.aba = a and tipo = 'nova'),
                 'existentes', (select count(*) from s where s.aba = a and tipo = 'existente'),
                 'erros', (select count(distinct linha) from s where s.aba = a and tipo = 'erro')))
               from unnest(array['Clientes', 'Matrículas', 'Contratos', 'Quitações', 'Dívidas compradas',
                                 'Parcelas', 'Mensalidades']) a),
    'erros', coalesce((select jsonb_agg(jsonb_build_object('aba', aba, 'linha', linha, 'mensagem', mensagem)
                                        order by public._imp_ordem_aba(aba), linha)
                       from s where tipo = 'erro'), '[]'),
    'avisos', coalesce((select jsonb_agg(jsonb_build_object('aba', aba, 'linha', linha, 'mensagem', mensagem)
                                         order by public._imp_ordem_aba(aba), linha)
                        from s where tipo = 'aviso'), '[]'))
$$;

-- ── Etapas por CPF (contratos, parcelas e mensalidades: Tasks seguintes) ──
create function public._imp_contratos(g jsonb, ctx jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$ begin return '[]'; end $$;
create function public._imp_parcelas(g jsonb, ctx jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$ begin return '[]'; end $$;
create function public._imp_mensalidades(g jsonb, ctx jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$ begin return '[]'; end $$;

create function public._imp_clientes(g jsonb, ctx jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_saida jsonb := '[]';
  v_cpf text := g->>'cpf';
  v_cli public.clientes;
  v_mat public.cliente_matriculas;
  v_conv uuid;
  v_vinc uuid;
  v_primeira boolean := true;
  v_linha integer;
  r jsonb;
  k text;
begin
  select * into v_cli from public.clientes where cpf = v_cpf;
  for r in select * from jsonb_array_elements(g->'clientes') loop
    v_linha := (r->>'linha')::int;
    if not v_primeira then
      v_saida := v_saida || public._imp_item('Clientes', v_linha, 'erro', 'CPF repetido na aba Clientes.');
      continue;
    end if;
    v_primeira := false;
    if v_cli.id is not null then
      v_saida := v_saida || public._imp_item('Clientes', v_linha, 'existente', null);
      if public._imp_chave(r->>'nome') <> public._imp_chave(v_cli.nome) then
        v_saida := v_saida || public._imp_item('Clientes', v_linha, 'aviso',
          format('Cliente já cadastrado com outro nome (%s). Os dados dele não foram alterados.', v_cli.nome));
      end if;
      continue;
    end if;
    begin
      if nullif(btrim(r->>'nome'), '') is null then
        raise exception 'Informe o nome.';
      end if;
      insert into public.clientes (cpf, nome, celular, whatsapp, data_nascimento, email, rg, nome_mae, cep,
                                   logradouro, numero, complemento, bairro, cidade, uf, importacao_id)
      values (v_cpf, btrim(r->>'nome'), coalesce(r->>'celular', ''),
              coalesce(nullif(btrim(r->>'whatsapp'), ''), r->>'celular', ''),
              public._imp_data(r->>'data_nascimento', 'Data de nascimento'),
              nullif(btrim(r->>'email'), ''), nullif(btrim(r->>'rg'), ''), nullif(btrim(r->>'nome_mae'), ''),
              nullif(btrim(r->>'cep'), ''), nullif(btrim(r->>'logradouro'), ''), nullif(btrim(r->>'numero'), ''),
              nullif(btrim(r->>'complemento'), ''), nullif(btrim(r->>'bairro'), ''), nullif(btrim(r->>'cidade'), ''),
              upper(nullif(btrim(r->>'uf'), '')), (ctx->>'importacao_id')::uuid)
      returning * into v_cli;
      v_saida := v_saida || public._imp_item('Clientes', v_linha, 'nova', null);
    exception when others then
      v_saida := v_saida || public._imp_item('Clientes', v_linha, 'erro', sqlerrm);
    end;
  end loop;

  if v_cli.id is null then
    if jsonb_array_length(g->'clientes') = 0 then
      foreach k in array array['matriculas', 'contratos', 'mensalidades'] loop
        for r in select * from jsonb_array_elements(g->k) loop
          v_saida := v_saida || public._imp_item(public._imp_aba(k), (r->>'linha')::int, 'erro',
                                                 'Cliente não encontrado: inclua o CPF na aba Clientes.');
        end loop;
      end loop;
    end if;
    return v_saida;
  end if;

  for r in select * from jsonb_array_elements(g->'matriculas') loop
    v_linha := (r->>'linha')::int;
    begin
      v_conv := public._imp_convenio(r->>'convenio');
      select id into v_vinc from public.convenio_vinculos
      where convenio_id = v_conv and public._imp_chave(nome) = public._imp_chave(r->>'vinculo');
      if v_vinc is null then
        raise exception 'Vínculo não encontrado neste convênio: %.', coalesce(nullif(btrim(r->>'vinculo'), ''), '(vazio)');
      end if;
      if nullif(btrim(r->>'matricula'), '') is null then
        raise exception 'Informe a matrícula.';
      end if;
      select * into v_mat from public.cliente_matriculas
      where convenio_id = v_conv and matricula_normalizada = ltrim(btrim(r->>'matricula'), '0');
      if found then
        if v_mat.cliente_id <> v_cli.id then
          raise exception 'Esta matrícula pertence a outro cliente.';
        end if;
        v_saida := v_saida || public._imp_item('Matrículas', v_linha, 'existente', null);
      else
        insert into public.cliente_matriculas (cliente_id, convenio_id, vinculo_id, matricula, orgao, importacao_id)
        values (v_cli.id, v_conv, v_vinc, btrim(r->>'matricula'), nullif(btrim(r->>'orgao'), ''),
                (ctx->>'importacao_id')::uuid);
        v_saida := v_saida || public._imp_item('Matrículas', v_linha, 'nova', null);
      end if;
    exception when others then
      v_saida := v_saida || public._imp_item('Matrículas', v_linha, 'erro', sqlerrm);
    end;
  end loop;
  return v_saida;
end $$;

-- ── Processador ───────────────────────────────────────────────
create function public._imp_processar(p_dados jsonb, p_importacao_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_posicao date;
  v_ctx jsonb;
  v_total jsonb := '[]';
  v_saida jsonb;
  v_cpf text;
  g jsonb;
  k text;
  r record;
begin
  if p_importacao_id is not null then
    select data_posicao into v_posicao from public.importacoes where id = p_importacao_id;
  else
    v_posicao := public._imp_data(p_dados->>'posicao', 'Data da posição');
  end if;
  if v_posicao is null then
    raise exception 'Informe a Data da posição na aba Instruções.';
  end if;
  v_ctx := jsonb_build_object('importacao_id', p_importacao_id, 'posicao', v_posicao);

  create temp table if not exists _imp_linhas (aba text, linha integer, cpf text, dados jsonb) on commit drop;
  truncate pg_temp._imp_linhas;

  -- linhas com CPF próprio
  foreach k in array array['clientes', 'matriculas', 'contratos', 'mensalidades'] loop
    insert into pg_temp._imp_linhas
    select k, (x->>'linha')::int, public._imp_cpf(x->>'cpf'), x
    from jsonb_array_elements(coalesce(p_dados->k, '[]')) x;
  end loop;
  -- linhas ligadas a um contrato: CPF do contrato no lote, senão do contrato já gravado
  foreach k in array array['quitacoes', 'dividas', 'parcelas'] loop
    insert into pg_temp._imp_linhas
    select k, (x->>'linha')::int,
           coalesce((select l.cpf from pg_temp._imp_linhas l
                     where l.aba = 'contratos' and btrim(l.dados->>'numero_antigo') = btrim(x->>num) limit 1),
                    (select c.cpf from public.contratos ct join public.clientes c on c.id = ct.cliente_id
                     where ct.numero_legado = btrim(x->>num))),
           x
    from jsonb_array_elements(coalesce(p_dados->k, '[]')) x,
         (select case k when 'quitacoes' then 'numero_novo' else 'numero_antigo' end as num) n;
  end loop;
  create index if not exists _imp_linhas_cpf on pg_temp._imp_linhas (cpf, aba);

  for r in select aba, linha, dados from pg_temp._imp_linhas where cpf is null loop
    v_total := v_total || public._imp_item(public._imp_aba(r.aba), r.linha, 'erro',
      case when r.aba in ('quitacoes', 'dividas', 'parcelas')
           then format('O contrato antigo nº %s não está na aba Contratos.',
                       coalesce(nullif(btrim(r.dados->>(case r.aba when 'quitacoes' then 'numero_novo' else 'numero_antigo' end)), ''), '(vazio)'))
           else 'Informe o CPF.' end);
  end loop;

  if (select count(distinct cpf) from pg_temp._imp_linhas where cpf is not null) > 300 then
    raise exception 'Lote grande demais.';
  end if;

  for v_cpf in select distinct cpf from pg_temp._imp_linhas where cpf is not null order by cpf loop
    select jsonb_build_object('cpf', v_cpf) || jsonb_object_agg(a, coalesce(
             (select jsonb_agg(l.dados order by l.linha) from pg_temp._imp_linhas l where l.cpf = v_cpf and l.aba = a), '[]'))
      into g
    from unnest(array['clientes', 'matriculas', 'contratos', 'quitacoes', 'dividas', 'parcelas', 'mensalidades']) a;
    v_saida := '[]';
    begin
      v_saida := v_saida || public._imp_clientes(g, v_ctx);
      if not jsonb_path_exists(v_saida, '$[*] ? (@.tipo == "erro")') then
        v_saida := v_saida || public._imp_contratos(g, v_ctx);
      end if;
      if not jsonb_path_exists(v_saida, '$[*] ? (@.tipo == "erro")') then
        v_saida := v_saida || public._imp_parcelas(g, v_ctx);
      end if;
      if not jsonb_path_exists(v_saida, '$[*] ? (@.tipo == "erro")') then
        v_saida := v_saida || public._imp_mensalidades(g, v_ctx);
      end if;
      if jsonb_path_exists(v_saida, '$[*] ? (@.tipo == "erro")') then
        raise exception using errcode = 'PIMP1';
      end if;
    exception when sqlstate 'PIMP1' then
      v_saida := public._imp_falhou(g, v_saida);
    end;
    v_total := v_total || v_saida;
  end loop;

  return public._imp_resultado(v_total);
end $$;

-- ── RPCs ──────────────────────────────────────────────────────
create function public.importacao_conferir(p_dados jsonb, p_hash text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
  v_antiga public.importacoes;
begin
  perform public.app_exigir('importacao.executar');
  begin
    v := public._imp_processar(p_dados, null);
    raise exception using errcode = 'PIMP0';
  exception when sqlstate 'PIMP0' then
    null;
  end;
  select * into v_antiga from public.importacoes
  where hash = p_hash and situacao = 'gravada' order by criado_em desc limit 1;
  if v_antiga.id is not null then
    v := jsonb_set(v, '{avisos}', jsonb_build_array(jsonb_build_object('aba', 'Arquivo', 'linha', 0, 'mensagem',
      format('Este arquivo já foi importado em %s; só as linhas que faltam vão entrar.',
             to_char(v_antiga.criado_em, 'DD/MM/YYYY')))) || (v->'avisos'));
  end if;
  return v;
end $$;

create function public.importacao_iniciar(p_arquivo_nome text, p_arquivo_caminho text, p_hash text, p_posicao date)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_antiga public.importacoes;
  v_id uuid;
begin
  perform public.app_exigir('importacao.executar');
  if p_posicao is null then
    raise exception 'Informe a Data da posição na aba Instruções.';
  end if;
  select * into v_antiga from public.importacoes
  where hash = p_hash and situacao = 'gravada' and coalesce(jsonb_array_length(erros), 0) = 0
  order by criado_em desc limit 1;
  if v_antiga.id is not null then
    raise exception 'Este arquivo já foi importado em %.', to_char(v_antiga.criado_em, 'DD/MM/YYYY');
  end if;
  insert into public.importacoes (arquivo_nome, arquivo_caminho, hash, data_posicao)
  values (p_arquivo_nome, p_arquivo_caminho, p_hash, p_posicao) returning id into v_id;
  return v_id;
end $$;

create function public._imp_minha_em_andamento(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.app_exigir('importacao.executar');
  perform 1 from public.importacoes
  where id = p_id and situacao = 'em_andamento' and usuario_id = auth.uid() for update;
  if not found then
    raise exception 'Importação não encontrada ou já concluída.';
  end if;
end $$;

create function public.importacao_gravar_lote(p_importacao_id uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._imp_minha_em_andamento(p_importacao_id);
  perform pg_advisory_xact_lock(hashtext('importacao'));
  return public._imp_processar(p_dados, p_importacao_id);
end $$;

create function public.importacao_concluir(p_importacao_id uuid, p_resumo jsonb, p_erros jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._imp_minha_em_andamento(p_importacao_id);
  update public.importacoes
  set resumo = p_resumo, erros = coalesce(p_erros, '[]'), situacao = 'gravada', concluida_em = clock_timestamp()
  where id = p_importacao_id;
end $$;

revoke execute on function public._imp_cpf(text), public._imp_item(text, integer, text, text), public._imp_aba(text),
  public._imp_ordem_aba(text), public._imp_convenio(text), public._imp_falhou(jsonb, jsonb), public._imp_resultado(jsonb),
  public._imp_contratos(jsonb, jsonb), public._imp_parcelas(jsonb, jsonb), public._imp_mensalidades(jsonb, jsonb),
  public._imp_clientes(jsonb, jsonb), public._imp_processar(jsonb, uuid), public._imp_minha_em_andamento(uuid)
  from public, anon, authenticated;
revoke execute on function public.importacao_conferir(jsonb, text), public.importacao_iniciar(text, text, text, date),
  public.importacao_gravar_lote(uuid, jsonb), public.importacao_concluir(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.importacao_conferir(jsonb, text), public.importacao_iniciar(text, text, text, date),
  public.importacao_gravar_lote(uuid, jsonb), public.importacao_concluir(uuid, jsonb, jsonb) to authenticated;
