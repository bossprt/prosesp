-- 0017 — Esteira: mudança de fase pela matriz configurável, com motivo e histórico

-- Registra a mudança de fase/situação (uso interno das funções da esteira).
create function public._registrar_mudanca(
  p_contrato public.contratos, p_para public.fase_contrato, p_situacao public.situacao_contrato, p_motivo text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.contratos set
    fase = p_para,
    situacao = coalesce(p_situacao, situacao),
    fase_retorno = case when p_para = 'pendente' then p_contrato.fase else null end,
    valores_travados_em = case when p_para = 'em_averbacao' then coalesce(valores_travados_em, now())
                               else valores_travados_em end
  where id = p_contrato.id;
  insert into public.contrato_eventos (contrato_id, de, para, situacao_de, situacao_para, motivo)
  values (p_contrato.id, p_contrato.fase, p_para, p_contrato.situacao, coalesce(p_situacao, p_contrato.situacao),
          nullif(btrim(p_motivo), ''));
end $$;

create function public.mover_contrato(p_id uuid, p_para public.fase_contrato, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
  v_permissao text;
  v_falta text;
begin
  select * into k from public.contratos where id = p_id for update;
  if k.id is null or not public.contrato_visivel(p_id) then
    raise exception 'Contrato não encontrado.';
  end if;

  if k.fase = 'pendente' and p_para = k.fase_retorno then
    v_permissao := 'contratos.mover';
  elsif k.fase = 'pre_digitacao' and p_para = 'digitado' then
    raise exception 'Use "Aprovar pré-digitação" para conferir os valores antes.';
  else
    select t.permissao into v_permissao from public.fase_transicoes t where t.de = k.fase and t.para = p_para;
  end if;
  if v_permissao is null then
    raise exception 'Esta mudança de fase não é permitida.';
  end if;
  if not public.app_equipe_pode(v_permissao) then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if p_para in ('pendente', 'recusado') and btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo.';
  end if;

  -- regras de cada fase
  if k.fase = 'em_validacao' and p_para = 'em_averbacao' then
    select string_agg(f.rotulo, ', ') into v_falta from public.o_que_falta(k.cliente_id, k.convenio_id) f;
    if v_falta is not null then
      raise exception 'Ainda falta no cadastro: %.', v_falta;
    end if;
  end if;

  if p_para = 'recusado' then
    update public.contrato_quitacoes set reservado = false where contrato_id = k.id;
    perform public._registrar_mudanca(k, p_para, 'cancelado', p_motivo);
  else
    perform public._registrar_mudanca(k, p_para, null, p_motivo);
  end if;
end $$;

-- Equipe devolve a pré-digitação ao parceiro com um recado (fase não muda; o parceiro corrige).
create function public.devolver_pre_digitacao(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
begin
  if not public.app_equipe_pode('contratos.mover') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into k from public.contratos where id = p_id for update;
  if k.id is null or k.fase <> 'pre_digitacao' then
    raise exception 'Só é possível devolver contratos em pré-digitação.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo.';
  end if;
  insert into public.contrato_eventos (contrato_id, de, para, motivo) values (k.id, k.fase, k.fase, btrim(p_motivo));
end $$;

create function public.cancelar_pre_digitacao(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
  v_parceiro uuid := public._exigir_parceiro('contratos.digitar');
begin
  select * into k from public.contratos where id = p_id for update;
  if k.id is null or k.parceiro_id is distinct from v_parceiro or k.fase <> 'pre_digitacao' then
    raise exception 'Contrato não encontrado.';
  end if;
  if exists (select 1 from public.contrato_eventos e where e.contrato_id = k.id and e.usuario_id is distinct from k.criado_por) then
    raise exception 'A equipe já está cuidando desta pré-digitação. Peça o cancelamento à PROSESP.';
  end if;
  update public.contrato_quitacoes set reservado = false where contrato_id = k.id;
  perform public._registrar_mudanca(k, 'cancelado', 'cancelado', coalesce(nullif(btrim(p_motivo), ''), 'Cancelado pelo parceiro'));
end $$;

-- Dados atuais do contrato no formato de p_dados (para recalcular).
create function public._dados_do_contrato(k public.contratos) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('cliente_id', k.cliente_id, 'matricula_id', k.matricula_id, 'tipo', k.tipo,
                            'prazo', k.prazo, 'modo', 'valor', 'quantia', k.valor_bruto)
$$;

create function public.aprovar_pre_digitacao(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
  v_calc jsonb;
begin
  if not public.app_equipe_pode('contratos.mover') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into k from public.contratos where id = p_id for update;
  if k.id is null or k.fase <> 'pre_digitacao' then
    raise exception 'Este contrato não está em pré-digitação.';
  end if;
  v_calc := public._calcular_contrato(public._dados_do_contrato(k), false);
  if (v_calc->>'linha_tabela_id')::uuid is distinct from k.linha_tabela_id
     or (v_calc->>'fator')::numeric <> k.fator
     or (v_calc->>'valor_parcela')::numeric <> k.valor_parcela then
    return jsonb_build_object(
      'mudou', true,
      'antes', jsonb_build_object('fator', k.fator, 'valor_parcela', k.valor_parcela, 'valor_bruto', k.valor_bruto),
      'depois', jsonb_build_object('fator', (v_calc->>'fator')::numeric, 'valor_parcela', (v_calc->>'valor_parcela')::numeric,
                                   'valor_bruto', (v_calc->>'valor_bruto')::numeric));
  end if;
  perform public.confirmar_aprovacao(p_id);
  return jsonb_build_object('mudou', false);
end $$;

-- Aplica a tabela vigente (gravando a simulação) e passa para 'digitado'.
create function public.confirmar_aprovacao(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
  v_calc jsonb;
  v_mudou boolean;
begin
  if not public.app_equipe_pode('contratos.mover') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into k from public.contratos where id = p_id for update;
  if k.id is null or k.fase <> 'pre_digitacao' then
    raise exception 'Este contrato não está em pré-digitação.';
  end if;
  v_calc := public._calcular_contrato(public._dados_do_contrato(k), true);
  v_mudou := (v_calc->>'linha_tabela_id')::uuid is distinct from k.linha_tabela_id
             or (v_calc->>'valor_parcela')::numeric <> k.valor_parcela;
  update public.contratos set
    linha_tabela_id = (v_calc->>'linha_tabela_id')::uuid,
    fator = (v_calc->>'fator')::numeric,
    valor_parcela = (v_calc->>'valor_parcela')::numeric,
    valor_bruto = (v_calc->>'valor_bruto')::numeric,
    valor_mensalidade_tabela = (v_calc->>'valor_mensalidade_tabela')::numeric,
    versao = versao + case when v_mudou then 1 else 0 end
  where id = p_id;
  perform public._gravar_comissao(p_id, v_calc);
  if v_mudou then
    perform public._gravar_versao(p_id, 'Valores atualizados pela tabela vigente na aprovação');
  end if;
  select * into k from public.contratos where id = p_id;
  perform public._registrar_mudanca(k, 'digitado', null, 'Pré-digitação aprovada');
end $$;

revoke execute on function public._registrar_mudanca(public.contratos, public.fase_contrato, public.situacao_contrato, text),
  public._dados_do_contrato(public.contratos) from public, anon, authenticated;
revoke execute on function public.mover_contrato(uuid, public.fase_contrato, text), public.devolver_pre_digitacao(uuid, text),
  public.cancelar_pre_digitacao(uuid, text), public.aprovar_pre_digitacao(uuid), public.confirmar_aprovacao(uuid)
  from public, anon;
grant execute on function public.mover_contrato(uuid, public.fase_contrato, text), public.devolver_pre_digitacao(uuid, text),
  public.cancelar_pre_digitacao(uuid, text), public.aprovar_pre_digitacao(uuid), public.confirmar_aprovacao(uuid)
  to authenticated;
