-- 0019 — Liberação do crédito: parcelas, pagamentos, mensalidades (tudo numa transação)

create extension if not exists pg_cron;

create table public.parcelas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos (id) on delete cascade,
  numero integer not null check (numero > 0),
  competencia date not null check (extract(day from competencia) = 1),
  vencimento date not null,
  valor numeric(14,2) not null check (valor > 0),
  status text not null default 'aberta' check (status in ('aberta', 'paga', 'parcial', 'atrasada', 'prejuizo', 'cancelada')),
  averbacao_id uuid references public.contrato_averbacoes (id),
  unique (contrato_id, competencia),
  unique (contrato_id, numero)
);

create table public.parcela_pagamentos (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid not null references public.parcelas (id) on delete cascade,
  valor numeric(14,2) not null check (valor > 0),
  competencia_desconto date not null,
  averbacao_id uuid references public.contrato_averbacoes (id),
  origem text not null default 'manual',
  criado_em timestamptz not null default now()
);

create view public.v_parcelas_saldo with (security_invoker = true) as
  select p.id as parcela_id, p.valor,
         coalesce(sum(g.valor), 0)::numeric(14,2) as pago,
         (p.valor - coalesce(sum(g.valor), 0))::numeric(14,2) as saldo
  from public.parcelas p left join public.parcela_pagamentos g on g.parcela_id = p.id
  group by p.id, p.valor;

create table public.mensalidades (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.cliente_matriculas (id),
  situacao text not null default 'ativa' check (situacao in ('ativa', 'cancelada')),
  cancelada_em timestamptz,
  requerimento_documento_id uuid references public.cliente_documentos (id),
  motivo_cancelamento text,
  criado_em timestamptz not null default now()
);
create unique index mensalidades_uma_ativa on public.mensalidades (matricula_id) where situacao = 'ativa';

create table public.mensalidade_valores (
  id uuid primary key default gen_random_uuid(),
  mensalidade_id uuid not null references public.mensalidades (id) on delete cascade,
  valor numeric(14,2) not null check (valor > 0),
  vigente_desde date not null,
  tipo text not null check (tipo in ('nova', 'reajuste', 'migracao')),
  contrato_origem_id uuid references public.contratos (id),
  averbacao_id uuid references public.mensalidade_averbacoes (id),
  criado_em timestamptz not null default clock_timestamp()
);

create table public.mensalidade_parcelas (
  id uuid primary key default gen_random_uuid(),
  mensalidade_id uuid not null references public.mensalidades (id) on delete cascade,
  competencia date not null check (extract(day from competencia) = 1),
  valor numeric(14,2) not null check (valor > 0),
  status text not null default 'aberta' check (status in ('aberta', 'paga', 'parcial', 'atrasada', 'cancelada')),
  unique (mensalidade_id, competencia)
);

alter table public.mensalidade_averbacoes add column mensalidade_id uuid references public.mensalidades (id);

-- ── Funções de apoio ──────────────────────────────────────────
create function public._valor_mensalidade_em(p_mensalidade_id uuid, p_competencia date) returns numeric
language sql stable security definer set search_path = '' as $$
  select v.valor from public.mensalidade_valores v
  where v.mensalidade_id = p_mensalidade_id and v.vigente_desde <= p_competencia
  order by v.vigente_desde desc, v.criado_em desc limit 1
$$;

create or replace function public.mensalidade_vigente(p_matricula_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select v.valor from public.mensalidades m join public.mensalidade_valores v on v.mensalidade_id = m.id
    where m.matricula_id = p_matricula_id and m.situacao = 'ativa'
    order by v.vigente_desde desc, v.criado_em desc limit 1), 0)
$$;

create function public.primeira_competencia(p_convenio_id uuid, p_data date) returns date
language plpgsql stable security definer set search_path = '' as $$
declare
  cv public.convenios;
begin
  select * into cv from public.convenios where id = p_convenio_id;
  if cv.dia_corte is null or cv.dia_vencimento is null then
    raise exception 'Configure o dia de corte e o dia de vencimento do convênio antes de liberar.';
  end if;
  -- liberado até o dia de corte: entra na folha do mesmo mês; depois, no mês seguinte
  return (date_trunc('month', p_data) + case when extract(day from p_data) <= cv.dia_corte
                                              then interval '0 month' else interval '1 month' end)::date;
end $$;

-- Parcelas em aberto acompanham a averbação nova (pagamentos ficam na de origem).
create or replace function public._apos_nova_averbacao(p_contrato_id uuid, p_antiga uuid, p_nova uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.parcelas set averbacao_id = p_nova
  where contrato_id = p_contrato_id and status in ('aberta', 'parcial', 'atrasada');
end $$;

-- Mensalidade na liberação: nova, reajuste ou nada (a proposta menor fica migrada).
create function public._mensalidade_na_liberacao(k public.contratos, p_competencia date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.mensalidades;
  v_prop public.mensalidade_averbacoes;
  v_ativa public.mensalidade_averbacoes;
  v_vigente numeric;
begin
  if k.mensalidade_proposta is null then
    return;
  end if;
  select * into v_prop from public.mensalidade_averbacoes
  where contrato_origem_id = k.id and situacao = 'proposta' for update;
  select * into m from public.mensalidades where matricula_id = k.matricula_id and situacao = 'ativa' for update;

  if m.id is null then
    insert into public.mensalidades (matricula_id) values (k.matricula_id) returning * into m;
    insert into public.mensalidade_valores (mensalidade_id, valor, vigente_desde, tipo, contrato_origem_id, averbacao_id)
    values (m.id, k.mensalidade_proposta, p_competencia, 'nova', k.id, v_prop.id);
    update public.mensalidade_averbacoes set situacao = 'ativa', mensalidade_id = m.id where id = v_prop.id;
  else
    v_vigente := public.mensalidade_vigente(k.matricula_id);
    select * into v_ativa from public.mensalidade_averbacoes
    where mensalidade_id = m.id and situacao = 'ativa' for update;
    if k.mensalidade_proposta > v_vigente then
      insert into public.mensalidade_valores (mensalidade_id, valor, vigente_desde, tipo, contrato_origem_id, averbacao_id)
      values (m.id, k.mensalidade_proposta, p_competencia, 'reajuste', k.id, v_prop.id);
      update public.mensalidade_averbacoes set situacao = 'migrada', migrada_para = v_prop.id where id = v_ativa.id;
      update public.mensalidade_averbacoes set situacao = 'ativa', mensalidade_id = m.id where id = v_prop.id;
    else
      -- outro contrato já aplicou valor igual ou maior
      update public.mensalidade_averbacoes set situacao = 'migrada', migrada_para = v_ativa.id, mensalidade_id = m.id
      where id = v_prop.id;
    end if;
  end if;

  -- parcela da mensalidade da primeira competência (atualiza se já gerada e ainda aberta)
  insert into public.mensalidade_parcelas (mensalidade_id, competencia, valor)
  values (m.id, p_competencia, public._valor_mensalidade_em(m.id, p_competencia))
  on conflict (mensalidade_id, competencia) do update set valor = excluded.valor
  where public.mensalidade_parcelas.status = 'aberta';
end $$;

create function public.liberar_credito(p_id uuid, p_data date default current_date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.contratos;
  v_comp date;
  v_dia smallint;
  v_averbacao uuid;
  q record;
begin
  if not public.app_equipe_pode('contratos.liberar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  select * into k from public.contratos where id = p_id for update;
  if k.id is null then
    raise exception 'Contrato não encontrado.';
  end if;
  if k.fase = 'credito_liberado' then
    raise exception 'Este crédito já foi liberado.';
  end if;
  if k.fase <> 'aguardando_pagamento' then
    raise exception 'Só é possível liberar contratos aguardando pagamento.';
  end if;

  v_comp := public.primeira_competencia(k.convenio_id, p_data);
  select dia_vencimento into v_dia from public.convenios where id = k.convenio_id;
  select id into v_averbacao from public.contrato_averbacoes where contrato_id = k.id and situacao = 'ativa';

  insert into public.parcelas (contrato_id, numero, competencia, vencimento, valor, averbacao_id)
  select k.id, n, (v_comp + make_interval(months => n - 1))::date,
         make_date(extract(year from v_comp + make_interval(months => n - 1))::int,
                   extract(month from v_comp + make_interval(months => n - 1))::int, v_dia),
         k.valor_parcela, v_averbacao
  from generate_series(1, k.prazo) n;

  -- refinanciamento: encerra os contratos quitados
  for q in select x.* from public.contrato_quitacoes x where x.contrato_id = k.id and x.reservado loop
    perform 1 from public.contratos where id = q.contrato_quitado_id for update;
    update public.parcelas set status = 'cancelada'
    where contrato_id = q.contrato_quitado_id and competencia >= v_comp and status in ('aberta', 'parcial', 'atrasada');
    update public.contrato_averbacoes set situacao = 'cancelada' where contrato_id = q.contrato_quitado_id and situacao = 'ativa';
    update public.contratos set situacao = 'renovado' where id = q.contrato_quitado_id;
    insert into public.contrato_eventos (contrato_id, situacao_para, motivo)
    values (q.contrato_quitado_id, 'renovado', 'Quitado pelo refinanciamento nº ' || k.numero);
    update public.contrato_quitacoes set reservado = false where id = q.id;
  end loop;

  perform public._mensalidade_na_liberacao(k, v_comp);

  update public.contratos set data_liberacao = p_data,
    primeiro_vencimento = (select min(vencimento) from public.parcelas where contrato_id = k.id)
  where id = k.id;
  perform public._registrar_mudanca(k, 'credito_liberado', 'ativo', 'Crédito liberado em ' || to_char(p_data, 'DD/MM/YYYY'));
end $$;

-- Gera as parcelas de mensalidade do mês (idempotente). Roda todo dia 1 pelo pg_cron.
create function public.gerar_mensalidades_competencia(p_competencia date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_qtd integer;
begin
  if auth.uid() is not null and not public.app_equipe_pode('contratos.liberar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  insert into public.mensalidade_parcelas (mensalidade_id, competencia, valor)
  select m.id, date_trunc('month', p_competencia)::date, public._valor_mensalidade_em(m.id, date_trunc('month', p_competencia)::date)
  from public.mensalidades m
  where m.situacao = 'ativa' and public._valor_mensalidade_em(m.id, date_trunc('month', p_competencia)::date) is not null
  on conflict (mensalidade_id, competencia) do nothing;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

select cron.schedule('mensalidades-do-mes', '0 3 1 * *',
  $$select public.gerar_mensalidades_competencia(date_trunc('month', current_date)::date)$$);

-- ── RLS ───────────────────────────────────────────────────────
alter table public.parcelas enable row level security;
alter table public.parcela_pagamentos enable row level security;
alter table public.mensalidades enable row level security;
alter table public.mensalidade_valores enable row level security;
alter table public.mensalidade_parcelas enable row level security;

create policy parcelas_ler on public.parcelas for select to authenticated using (public.contrato_visivel(contrato_id));
create policy parcela_pagamentos_ler on public.parcela_pagamentos for select to authenticated
  using (exists (select 1 from public.parcelas p where p.id = parcela_id and public.contrato_visivel(p.contrato_id)));
create policy mensalidades_ler on public.mensalidades for select to authenticated using (public.app_equipe_pode('contratos.ver'));
create policy mensalidade_valores_ler on public.mensalidade_valores for select to authenticated using (public.app_equipe_pode('contratos.ver'));
create policy mensalidade_parcelas_ler on public.mensalidade_parcelas for select to authenticated using (public.app_equipe_pode('contratos.ver'));

revoke all on public.parcelas, public.parcela_pagamentos, public.mensalidades, public.mensalidade_valores,
  public.mensalidade_parcelas from anon;
revoke insert, update, delete, truncate on public.parcelas, public.parcela_pagamentos, public.mensalidades,
  public.mensalidade_valores, public.mensalidade_parcelas from authenticated;
revoke all on public.v_parcelas_saldo from anon;

create trigger trg_auditoria after insert or update or delete on public.parcela_pagamentos
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.mensalidades
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.mensalidade_valores
  for each row execute function public.auditar();

revoke execute on function public._valor_mensalidade_em(uuid, date), public._mensalidade_na_liberacao(public.contratos, date)
  from public, anon, authenticated;
revoke execute on function public.primeira_competencia(uuid, date), public.liberar_credito(uuid, date),
  public.gerar_mensalidades_competencia(date) from public, anon;
grant execute on function public.primeira_competencia(uuid, date), public.liberar_credito(uuid, date),
  public.gerar_mensalidades_competencia(date), public.mensalidade_vigente(uuid) to authenticated;
