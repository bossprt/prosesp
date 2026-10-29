-- 0018 — Averbação: ADE do contrato e da mensalidade, pendências da averbadora, reaverbação e migração

create table public.contrato_averbacoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos (id) on delete cascade,
  convenio_id uuid not null references public.convenios (id),
  matricula_id uuid not null references public.cliente_matriculas (id),
  ade text not null check (ade = btrim(ade) and ade <> ''),
  situacao public.situacao_averbacao not null,
  valor_averbado numeric(14,2) not null check (valor_averbado > 0),
  migrada_para uuid references public.contrato_averbacoes (id),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create unique index contrato_averbacoes_ade_unico on public.contrato_averbacoes (convenio_id, ade) where situacao <> 'cancelada';
create unique index contrato_averbacoes_uma_ativa on public.contrato_averbacoes (contrato_id) where situacao = 'ativa';

create table public.mensalidade_averbacoes (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.cliente_matriculas (id),
  convenio_id uuid not null references public.convenios (id),
  contrato_origem_id uuid references public.contratos (id),
  ade text not null check (ade = btrim(ade) and ade <> ''),
  situacao public.situacao_averbacao not null,
  valor_averbado numeric(14,2) not null check (valor_averbado > 0),
  migrada_para uuid references public.mensalidade_averbacoes (id),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create unique index mensalidade_averbacoes_ade_unico on public.mensalidade_averbacoes (convenio_id, ade) where situacao <> 'cancelada';

create table public.pendencias_averbadora (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('cancelar', 'ajustar')),
  contrato_id uuid references public.contratos (id),
  averbacao_id uuid references public.contrato_averbacoes (id),
  mensalidade_averbacao_id uuid references public.mensalidade_averbacoes (id),
  motivo text not null,
  criado_em timestamptz not null default now(),
  resolvida_em timestamptz,
  resolvida_por uuid
);
create index pendencias_averbadora_abertas on public.pendencias_averbadora (criado_em) where resolvida_em is null;

-- ── ADE: normaliza, confere modo/formato e unicidade no convênio ─
create function public._validar_ade(p_convenio_id uuid, p_ade text, p_confirmacao text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ade text := btrim(coalesce(p_ade, ''));
  cv public.convenios;
begin
  select * into cv from public.convenios where id = p_convenio_id;
  if v_ade = '' then
    raise exception 'Informe o ADE.';
  end if;
  if cv.ade_modo = 'seguro' and v_ade is distinct from btrim(coalesce(p_confirmacao, '')) then
    raise exception 'As duas digitações do ADE não são iguais.';
  end if;
  if cv.ade_regex is not null and v_ade !~ cv.ade_regex then
    raise exception 'ADE fora do formato do convênio: %.', coalesce(cv.ade_descricao, cv.ade_regex);
  end if;
  if exists (select 1 from public.contrato_averbacoes a where a.convenio_id = p_convenio_id and a.ade = v_ade and a.situacao <> 'cancelada')
     or exists (select 1 from public.mensalidade_averbacoes a where a.convenio_id = p_convenio_id and a.ade = v_ade and a.situacao <> 'cancelada') then
    raise exception 'Este ADE já está em uso neste convênio.';
  end if;
  return v_ade;
end $$;

create function public._contrato_para_averbacao(p_id uuid) returns public.contratos
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
begin
  if not public.app_equipe_pode('contratos.mover') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into k from public.contratos where id = p_id for update;
  if k.id is null then
    raise exception 'Contrato não encontrado.';
  end if;
  return k;
end $$;

create function public.registrar_ade(p_contrato_id uuid, p_ade text, p_confirmacao text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos := public._contrato_para_averbacao(p_contrato_id);
  v_ade text;
begin
  if k.fase <> 'em_averbacao' then
    raise exception 'O ADE é registrado na fase "em averbação".';
  end if;
  if exists (select 1 from public.contrato_averbacoes a where a.contrato_id = k.id and a.situacao = 'ativa') then
    raise exception 'Este contrato já tem ADE ativo. Use a reaverbação.';
  end if;
  v_ade := public._validar_ade(k.convenio_id, p_ade, p_confirmacao);
  insert into public.contrato_averbacoes (contrato_id, convenio_id, matricula_id, ade, situacao, valor_averbado)
  values (k.id, k.convenio_id, k.matricula_id, v_ade, 'ativa', k.valor_parcela);
end $$;

create function public.registrar_ade_mensalidade(p_contrato_id uuid, p_ade text, p_confirmacao text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos := public._contrato_para_averbacao(p_contrato_id);
  v_ade text;
begin
  if k.mensalidade_proposta is null then
    raise exception 'Este contrato não altera a mensalidade.';
  end if;
  if k.fase <> 'em_averbacao' then
    raise exception 'O ADE é registrado na fase "em averbação".';
  end if;
  if exists (select 1 from public.mensalidade_averbacoes a where a.contrato_origem_id = k.id and a.situacao = 'proposta') then
    raise exception 'O ADE da mensalidade deste contrato já foi registrado.';
  end if;
  v_ade := public._validar_ade(k.convenio_id, p_ade, p_confirmacao);
  insert into public.mensalidade_averbacoes (matricula_id, convenio_id, contrato_origem_id, ade, situacao, valor_averbado)
  values (k.matricula_id, k.convenio_id, k.id, v_ade, 'proposta', k.mensalidade_proposta);
end $$;

-- ── Esteira: regras de averbação na mudança de fase ───────────
create or replace function public.mover_contrato(p_id uuid, p_para public.fase_contrato, p_motivo text default null) returns void
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

  if k.fase = 'em_validacao' and p_para = 'em_averbacao' then
    select string_agg(f.rotulo, ', ') into v_falta from public.o_que_falta(k.cliente_id, k.convenio_id) f;
    if v_falta is not null then
      raise exception 'Ainda falta no cadastro: %.', v_falta;
    end if;
  end if;

  if p_para = 'averbado' then
    if not exists (select 1 from public.contrato_averbacoes a where a.contrato_id = k.id and a.situacao = 'ativa') then
      raise exception 'Registre o ADE do contrato antes de marcar como averbado.';
    end if;
    if k.mensalidade_proposta is not null and not exists (
      select 1 from public.mensalidade_averbacoes a where a.contrato_origem_id = k.id and a.situacao = 'proposta'
    ) then
      raise exception 'Registre também o ADE da mensalidade antes de marcar como averbado.';
    end if;
  end if;

  if p_para = 'recusado' then
    update public.contrato_quitacoes set reservado = false where contrato_id = k.id;
    perform public._pedir_cancelamento_averbacoes(k.id, 'Contrato recusado: ' || btrim(p_motivo));
    perform public._registrar_mudanca(k, p_para, 'cancelado', p_motivo);
  else
    perform public._registrar_mudanca(k, p_para, null, p_motivo);
  end if;
end $$;

-- Averbações ativas/propostas do contrato vão para "cancelamento pendente" + pendência.
create function public._pedir_cancelamento_averbacoes(p_contrato_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  for a in update public.contrato_averbacoes set situacao = 'cancelamento_pendente'
           where contrato_id = p_contrato_id and situacao in ('ativa', 'proposta') returning id loop
    insert into public.pendencias_averbadora (tipo, contrato_id, averbacao_id, motivo) values ('cancelar', p_contrato_id, a.id, p_motivo);
  end loop;
  for a in update public.mensalidade_averbacoes set situacao = 'cancelamento_pendente'
           where contrato_origem_id = p_contrato_id and situacao = 'proposta' returning id loop
    insert into public.pendencias_averbadora (tipo, contrato_id, mensalidade_averbacao_id, motivo)
    values ('cancelar', p_contrato_id, a.id, p_motivo || ' (mensalidade)');
  end loop;
end $$;

-- Edição de valores depois de averbado gera pendência "ajustar na averbadora".
create function public.trg_contrato_ajustar_averbadora() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.valores_travados_em is not null and (
       new.valor_parcela is distinct from old.valor_parcela
    or new.prazo is distinct from old.prazo
    or new.valor_bruto is distinct from old.valor_bruto) then
    insert into public.pendencias_averbadora (tipo, contrato_id, averbacao_id, motivo)
    values ('ajustar', new.id,
            (select a.id from public.contrato_averbacoes a where a.contrato_id = new.id and a.situacao = 'ativa'),
            format('Valores alterados: parcela %s → %s, prazo %s → %s', old.valor_parcela, new.valor_parcela, old.prazo, new.prazo));
  end if;
  return null;
end $$;

create trigger trg_contrato_ajustar_averbadora after update on public.contratos
  for each row execute function public.trg_contrato_ajustar_averbadora();

create function public.resolver_pendencia(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.pendencias_averbadora;
begin
  if not public.app_equipe_pode('averbadora.pendencias') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into p from public.pendencias_averbadora where id = p_id and resolvida_em is null for update;
  if p.id is null then
    raise exception 'Pendência não encontrada ou já resolvida.';
  end if;
  if p.tipo = 'cancelar' then
    update public.contrato_averbacoes set situacao = 'cancelada' where id = p.averbacao_id and situacao = 'cancelamento_pendente';
    update public.mensalidade_averbacoes set situacao = 'cancelada' where id = p.mensalidade_averbacao_id and situacao = 'cancelamento_pendente';
  end if;
  update public.pendencias_averbadora set resolvida_em = now(), resolvida_por = auth.uid() where id = p_id;
end $$;

-- ── Reaverbação e migração de matrícula ───────────────────────
create function public.reaverbar(p_contrato_id uuid, p_novo_ade text, p_confirmacao text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos := public._contrato_para_averbacao(p_contrato_id);
  v_antiga public.contrato_averbacoes;
  v_ade text;
  v_nova uuid;
begin
  select * into v_antiga from public.contrato_averbacoes where contrato_id = k.id and situacao = 'ativa' for update;
  if v_antiga.id is null then
    raise exception 'Este contrato não tem ADE ativo para reaverbar.';
  end if;
  v_ade := public._validar_ade(k.convenio_id, p_novo_ade, p_confirmacao);
  update public.contrato_averbacoes set situacao = 'substituida' where id = v_antiga.id;
  insert into public.contrato_averbacoes (contrato_id, convenio_id, matricula_id, ade, situacao, valor_averbado)
  values (k.id, k.convenio_id, k.matricula_id, v_ade, 'ativa', v_antiga.valor_averbado)
  returning id into v_nova;
  perform public._apos_nova_averbacao(k.id, v_antiga.id, v_nova);
  insert into public.contrato_eventos (contrato_id, de, para, motivo) values (k.id, k.fase, k.fase, 'Reaverbado: ADE ' || v_ade);
end $$;

create function public.migrar_matricula(
  p_contrato_id uuid, p_nova_matricula_id uuid, p_novo_ade text, p_confirmacao text, p_valor_averbado numeric
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos := public._contrato_para_averbacao(p_contrato_id);
  v_antiga public.contrato_averbacoes;
  v_ade text;
  v_nova uuid;
begin
  if not exists (select 1 from public.cliente_matriculas m
                 where m.id = p_nova_matricula_id and m.cliente_id = k.cliente_id and m.convenio_id = k.convenio_id and m.ativa) then
    raise exception 'A nova matrícula precisa ser do mesmo cliente e do mesmo convênio.';
  end if;
  if p_valor_averbado is null or p_valor_averbado <= 0 or p_valor_averbado > k.valor_parcela then
    raise exception 'O valor averbado precisa ser maior que zero e no máximo o valor da parcela.';
  end if;
  select * into v_antiga from public.contrato_averbacoes where contrato_id = k.id and situacao = 'ativa' for update;
  if v_antiga.id is null then
    raise exception 'Este contrato não tem ADE ativo para migrar.';
  end if;
  v_ade := public._validar_ade(k.convenio_id, p_novo_ade, p_confirmacao);
  insert into public.contrato_averbacoes (contrato_id, convenio_id, matricula_id, ade, situacao, valor_averbado)
  values (k.id, k.convenio_id, p_nova_matricula_id, v_ade, 'proposta', round(p_valor_averbado, 2))
  returning id into v_nova;
  update public.contrato_averbacoes set situacao = 'migrada', migrada_para = v_nova where id = v_antiga.id;
  update public.contrato_averbacoes set situacao = 'ativa' where id = v_nova;
  update public.contratos set matricula_id = p_nova_matricula_id where id = k.id;
  perform public._apos_nova_averbacao(k.id, v_antiga.id, v_nova);
  insert into public.contrato_eventos (contrato_id, de, para, motivo)
  values (k.id, k.fase, k.fase, format('Migrado para a matrícula nova, ADE %s, valor averbado %s', v_ade, round(p_valor_averbado, 2)));
end $$;

-- Gancho: a 0019 reaponta as parcelas em aberto para a nova averbação.
create function public._apos_nova_averbacao(p_contrato_id uuid, p_antiga uuid, p_nova uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  null;
end $$;

-- ── RLS ───────────────────────────────────────────────────────
alter table public.contrato_averbacoes enable row level security;
alter table public.mensalidade_averbacoes enable row level security;
alter table public.pendencias_averbadora enable row level security;

create policy contrato_averbacoes_ler on public.contrato_averbacoes for select to authenticated
  using (public.contrato_visivel(contrato_id));
create policy mensalidade_averbacoes_ler on public.mensalidade_averbacoes for select to authenticated
  using (public.app_equipe_pode('contratos.ver'));
create policy pendencias_averbadora_ler on public.pendencias_averbadora for select to authenticated
  using (public.app_equipe_pode('contratos.ver'));

revoke all on public.contrato_averbacoes, public.mensalidade_averbacoes, public.pendencias_averbadora from anon;
revoke insert, update, delete, truncate on public.contrato_averbacoes, public.mensalidade_averbacoes,
  public.pendencias_averbadora from authenticated;

create trigger trg_auditoria after insert or update or delete on public.contrato_averbacoes
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.mensalidade_averbacoes
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.pendencias_averbadora
  for each row execute function public.auditar();

revoke execute on function public._validar_ade(uuid, text, text), public._contrato_para_averbacao(uuid),
  public._pedir_cancelamento_averbacoes(uuid, text), public._apos_nova_averbacao(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.registrar_ade(uuid, text, text), public.registrar_ade_mensalidade(uuid, text, text),
  public.resolver_pendencia(uuid), public.reaverbar(uuid, text, text),
  public.migrar_matricula(uuid, uuid, text, text, numeric) from public, anon;
grant execute on function public.registrar_ade(uuid, text, text), public.registrar_ade_mensalidade(uuid, text, text),
  public.resolver_pendencia(uuid), public.reaverbar(uuid, text, text),
  public.migrar_matricula(uuid, uuid, text, text, numeric) to authenticated;
