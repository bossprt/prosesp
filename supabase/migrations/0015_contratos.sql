-- 0015 — Contratos e tabelas satélites
-- Valores contratados são fotografia (não são recalculados). Escrita só pelas RPCs (0016+).

create sequence public.contratos_numero_seq start 100000;

create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.contratos_numero_seq'),
  cliente_id uuid not null references public.clientes (id),
  matricula_id uuid not null references public.cliente_matriculas (id),
  convenio_id uuid not null references public.convenios (id),   -- copiado da matrícula
  vinculo_id uuid not null references public.convenio_vinculos (id),
  tipo public.tipo_contrato not null,
  parceiro_id uuid references public.parceiros (id),           -- nulo = contrato da casa
  agente_id uuid references public.agentes (id),
  origem_id uuid references public.origens (id),
  fase public.fase_contrato not null,
  fase_retorno public.fase_contrato,                            -- usada quando está em 'pendente'
  situacao public.situacao_contrato not null default 'em_andamento',
  linha_tabela_id uuid references public.tabela_linhas (id),    -- nulo em contratos legados
  fator numeric(12,8) not null check (fator > 0),
  prazo integer not null check (prazo > 0),
  valor_parcela numeric(14,2) not null check (valor_parcela > 0),
  valor_bruto numeric(14,2) not null check (valor_bruto > 0),
  total_descontos numeric(14,2) not null default 0 check (total_descontos >= 0),
  total_quitado numeric(14,2) not null default 0 check (total_quitado >= 0),
  total_dividas_externas numeric(14,2) not null default 0 check (total_dividas_externas >= 0),
  valor_liquido numeric(14,2) generated always as
    (valor_bruto - total_descontos - total_quitado - total_dividas_externas) stored,
  valor_mensalidade_tabela numeric(14,2) check (valor_mensalidade_tabela >= 0),
  mensalidade_proposta numeric(14,2) check (mensalidade_proposta > 0),
  valores_travados_em timestamptz,
  primeiro_vencimento date,
  data_liberacao date,
  legado boolean not null default false,
  legado_importado_por uuid,
  legado_importado_em timestamptz,
  versao integer not null default 1,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index contratos_cliente_idx on public.contratos (cliente_id);
create index contratos_parceiro_idx on public.contratos (parceiro_id);
create index contratos_fase_idx on public.contratos (fase);

create function public.trg_contratos_coerencia() returns trigger
language plpgsql set search_path = '' as $$
begin
  select m.convenio_id, m.vinculo_id into new.convenio_id, new.vinculo_id
  from public.cliente_matriculas m where m.id = new.matricula_id and m.cliente_id = new.cliente_id;
  if new.convenio_id is null then
    raise exception 'A matrícula não pertence a este cliente.';
  end if;
  if new.agente_id is not null and not exists (
    select 1 from public.agentes a where a.id = new.agente_id and a.parceiro_id is not distinct from new.parceiro_id
  ) then
    raise exception 'O agente não pertence ao parceiro do contrato.';
  end if;
  if new.valor_bruto - new.total_descontos - new.total_quitado - new.total_dividas_externas < 0 then
    raise exception 'O valor líquido ficou negativo: os descontos e quitações passam do valor do contrato.';
  end if;
  return new;
end $$;

create trigger trg_contratos_coerencia before insert or update on public.contratos
  for each row execute function public.trg_contratos_coerencia();

-- ── Comissão (só quem tem comissoes.ver) ──────────────────────
create table public.contrato_comissao_regra (
  contrato_id uuid primary key references public.contratos (id) on delete cascade,
  percentual numeric(7,4) not null check (percentual between 0 and 100),
  base public.base_comissao not null
);

-- ── Versões (fotografias anteriores) ──────────────────────────
create table public.contrato_versoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos (id) on delete cascade,
  versao integer not null,
  dados jsonb not null,
  motivo text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (contrato_id, versao)
);
-- comissão de cada versão fica separada, com a mesma regra de leitura da comissão
create table public.contrato_versoes_comissao (
  contrato_id uuid not null references public.contratos (id) on delete cascade,
  versao integer not null,
  percentual numeric(7,4) not null,
  base public.base_comissao not null,
  primary key (contrato_id, versao)
);

-- ── Descontos, quitações (refin) e dívidas externas (compra) ──
create table public.contrato_descontos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos (id) on delete cascade,
  tipo_desconto_id uuid not null references public.convenio_tipos_desconto (id),
  valor numeric(14,2) not null check (valor >= 0)
);

create table public.contrato_quitacoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos (id) on delete cascade,
  contrato_quitado_id uuid not null references public.contratos (id),
  saldo_devedor numeric(14,2) not null check (saldo_devedor > 0),
  fonte text not null check (fonte in ('averbadora', 'calculo', 'outro')),
  observacao text,
  reservado boolean not null default true,
  check (contrato_id <> contrato_quitado_id)
);
create unique index contrato_quitacoes_reserva_unica on public.contrato_quitacoes (contrato_quitado_id) where reservado;

create table public.contrato_dividas_externas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos (id) on delete cascade,
  credor text not null check (btrim(credor) <> ''),
  numero_contrato_externo text,
  saldo numeric(14,2) not null check (saldo > 0),
  favorecido text,
  observacao text
);

-- ── Histórico de fases (só inserção) ──────────────────────────
create table public.contrato_eventos (
  id bigint generated always as identity primary key,
  contrato_id uuid not null references public.contratos (id) on delete cascade,
  de public.fase_contrato,
  para public.fase_contrato,
  situacao_de public.situacao_contrato,
  situacao_para public.situacao_contrato,
  motivo text,
  usuario_id uuid default auth.uid(),
  em timestamptz not null default now()
);
create index contrato_eventos_contrato_idx on public.contrato_eventos (contrato_id, id);

create function public.trg_eventos_imutaveis() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'O histórico do contrato não pode ser alterado.';
end $$;
create trigger trg_eventos_imutaveis before update or delete on public.contrato_eventos
  for each row execute function public.trg_eventos_imutaveis();

-- ── Visibilidade ──────────────────────────────────────────────
create function public.contrato_visivel(p_contrato_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contratos k
    where k.id = p_contrato_id
      and public.app_pode('contratos.ver')
      and (
        public.app_parceiro_id() is null
        or k.parceiro_id = public.app_parceiro_id()
        or (public.config_bool('parceiro_ve_todos_contratos') and public.parceiro_ve_cliente(k.cliente_id))
      )
  )
$$;
revoke execute on function public.contrato_visivel(uuid) from public, anon;
grant execute on function public.contrato_visivel(uuid) to authenticated;

alter table public.contratos enable row level security;
alter table public.contrato_comissao_regra enable row level security;
alter table public.contrato_versoes enable row level security;
alter table public.contrato_versoes_comissao enable row level security;
alter table public.contrato_descontos enable row level security;
alter table public.contrato_quitacoes enable row level security;
alter table public.contrato_dividas_externas enable row level security;
alter table public.contrato_eventos enable row level security;

create policy contratos_ler on public.contratos for select to authenticated using (public.contrato_visivel(id));
create policy contrato_descontos_ler on public.contrato_descontos for select to authenticated
  using (public.contrato_visivel(contrato_id));
create policy contrato_quitacoes_ler on public.contrato_quitacoes for select to authenticated
  using (public.contrato_visivel(contrato_id));
create policy contrato_dividas_ler on public.contrato_dividas_externas for select to authenticated
  using (public.contrato_visivel(contrato_id));
create policy contrato_eventos_ler on public.contrato_eventos for select to authenticated
  using (public.contrato_visivel(contrato_id));
create policy contrato_versoes_ler on public.contrato_versoes for select to authenticated
  using (public.app_equipe_pode('contratos.ver'));
create policy contrato_comissao_ler on public.contrato_comissao_regra for select to authenticated
  using (public.app_equipe_pode('comissoes.ver'));
create policy contrato_versoes_comissao_ler on public.contrato_versoes_comissao for select to authenticated
  using (public.app_equipe_pode('comissoes.ver'));

-- escrita só pelas RPCs
revoke all on public.contratos, public.contrato_comissao_regra, public.contrato_versoes,
  public.contrato_versoes_comissao, public.contrato_descontos, public.contrato_quitacoes,
  public.contrato_dividas_externas, public.contrato_eventos from anon;
revoke insert, update, delete, truncate on public.contratos, public.contrato_comissao_regra,
  public.contrato_versoes, public.contrato_versoes_comissao, public.contrato_descontos,
  public.contrato_quitacoes, public.contrato_dividas_externas, public.contrato_eventos from authenticated;
revoke usage on sequence public.contratos_numero_seq from anon, authenticated;

create trigger trg_auditoria after insert or update or delete on public.contratos
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.contrato_comissao_regra
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.contrato_descontos
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.contrato_quitacoes
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.contrato_dividas_externas
  for each row execute function public.auditar();
