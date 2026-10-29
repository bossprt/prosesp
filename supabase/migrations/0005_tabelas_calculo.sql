-- 0005 — Tabelas de cálculo
-- parcela = valor × fator; valor = parcela ÷ fator.
-- Uma simulação sempre encontra no máximo UMA linha: a exclusion constraint impede
-- sobreposição entre quaisquer linhas do mesmo convênio (mesmo de tabelas diferentes).

create extension if not exists btree_gist with schema extensions;

create type public.tipo_contrato as enum ('novo', 'refinanciamento', 'compra');
create type public.base_comissao as enum ('liquido', 'bruto');

-- Faixas sempre inclusivas nas duas pontas. null = sem limite.
create function public.faixa_centavos(p_min numeric, p_max numeric) returns int8range
language sql immutable set search_path = '' as $$
  select int8range(round(p_min * 100)::bigint, round(p_max * 100)::bigint, '[]')
$$;

create function public.faixa_anos(p_min integer, p_max integer) returns int4range
language sql immutable set search_path = '' as $$
  select int4range(p_min, p_max, '[]')
$$;

create table public.tabelas_calculo (
  id uuid primary key default gen_random_uuid(),
  convenio_id uuid not null references public.convenios (id),
  nome text not null check (btrim(nome) <> ''),
  criado_em timestamptz not null default now()
);

create table public.tabela_linhas (
  id uuid primary key default gen_random_uuid(),
  tabela_id uuid not null references public.tabelas_calculo (id) on delete cascade,
  convenio_id uuid not null references public.convenios (id),  -- copiado da tabela por trigger
  vinculo_id uuid not null references public.convenio_vinculos (id),
  tipo public.tipo_contrato not null,
  prazo integer not null check (prazo > 0),
  faixa_valor int8range not null default '(,)',
  faixa_idade int4range not null default '(,)',
  vigencia daterange not null check (not lower_inf(vigencia)),
  fator numeric(12,8) not null constraint tabela_linhas_fator_check check (fator > 0),
  valor_mensalidade numeric(14,2) check (valor_mensalidade >= 0),
  constraint tabela_linhas_sem_sobreposicao exclude using gist (
    convenio_id with =, vinculo_id with =, tipo with =, prazo with =,
    faixa_valor with &&, faixa_idade with &&, vigencia with &&
  )
);

-- % de comissão separado da linha: permite, no futuro, comissão por parceiro (pendente PROSESP).
create table public.tabela_linha_comissoes (
  linha_id uuid primary key references public.tabela_linhas (id) on delete cascade,
  percentual numeric(7,4) not null check (percentual between 0 and 100),
  base public.base_comissao not null
);

create table public.simulacoes (
  id uuid primary key default gen_random_uuid(),
  linha_id uuid not null references public.tabela_linhas (id) on delete restrict,
  entrada text not null check (entrada in ('valor', 'parcela')),
  valor numeric(14,2) not null,
  parcela numeric(14,2) not null,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index simulacoes_linha_idx on public.simulacoes (linha_id);

-- ── Coerência da linha ────────────────────────────────────────
create function public.trg_tabela_linhas_preencher() returns trigger
language plpgsql set search_path = '' as $$
begin
  select t.convenio_id into new.convenio_id from public.tabelas_calculo t where t.id = new.tabela_id;
  if not exists (select 1 from public.convenio_vinculos v
                 where v.id = new.vinculo_id and v.convenio_id = new.convenio_id) then
    raise exception 'O vínculo não pertence ao convênio desta tabela.';
  end if;
  return new;
end $$;

create trigger trg_tabela_linhas_preencher before insert or update on public.tabela_linhas
  for each row execute function public.trg_tabela_linhas_preencher();

create function public.trg_comissao_base() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_tipo public.tipo_contrato;
begin
  select l.tipo into v_tipo from public.tabela_linhas l where l.id = new.linha_id;
  if (v_tipo = 'compra') <> (new.base = 'bruto') then
    raise exception 'Contrato de compra tem comissão sobre o valor bruto; novo e refinanciamento, sobre o líquido.';
  end if;
  return new;
end $$;

create trigger trg_comissao_base before insert or update on public.tabela_linha_comissoes
  for each row execute function public.trg_comissao_base();

-- ── Imutabilidade depois de usada ─────────────────────────────
create function public.linha_foi_usada(p_linha_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.simulacoes s where s.linha_id = p_linha_id)
$$;

create function public.trg_tabela_linhas_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.linha_foi_usada(old.id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- única edição permitida: encerrar a vigência (fim >= hoje, sem estender)
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'vigencia') = (to_jsonb(old) - 'vigencia')
     and lower(new.vigencia) = lower(old.vigencia)
     and not upper_inf(new.vigencia)
     and upper(new.vigencia) >= current_date
     and (upper_inf(old.vigencia) or upper(new.vigencia) <= upper(old.vigencia)) then
    return new;
  end if;
  raise exception 'Esta linha de tabela já foi usada e não pode ser alterada. Encerre a vigência e crie uma nova.';
end $$;

create trigger trg_tabela_linhas_imutavel before update or delete on public.tabela_linhas
  for each row execute function public.trg_tabela_linhas_imutavel();

create function public.trg_comissao_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.linha_foi_usada(old.linha_id) then
    raise exception 'Esta linha de tabela já foi usada e não pode ser alterada. Encerre a vigência e crie uma nova.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger trg_comissao_imutavel before update or delete on public.tabela_linha_comissoes
  for each row execute function public.trg_comissao_imutavel();

revoke execute on function public.linha_foi_usada(uuid) from public, anon;

-- ── RLS ───────────────────────────────────────────────────────
alter table public.tabelas_calculo enable row level security;
alter table public.tabela_linhas enable row level security;
alter table public.tabela_linha_comissoes enable row level security;
alter table public.simulacoes enable row level security;

create policy tabelas_calculo_ler on public.tabelas_calculo for select to authenticated
  using (public.app_pode('convenios.ver') or public.app_pode('simulador.usar'));
create policy tabelas_calculo_escrever on public.tabelas_calculo for all to authenticated
  using (public.app_pode('tabelas.editar')) with check (public.app_pode('tabelas.editar'));

create policy tabela_linhas_ler on public.tabela_linhas for select to authenticated
  using (public.app_pode('convenios.ver') or public.app_pode('simulador.usar'));
create policy tabela_linhas_escrever on public.tabela_linhas for all to authenticated
  using (public.app_pode('tabelas.editar')) with check (public.app_pode('tabelas.editar'));

create policy tabela_linha_comissoes_ler on public.tabela_linha_comissoes for select to authenticated
  using (public.app_pode('convenios.ver') or public.app_pode('simulador.usar'));
create policy tabela_linha_comissoes_escrever on public.tabela_linha_comissoes for all to authenticated
  using (public.app_pode('tabelas.editar')) with check (public.app_pode('tabelas.editar'));

-- simulações só são gravadas pelas funções do simulador (0006)
create policy simulacoes_ler on public.simulacoes for select to authenticated
  using (criado_por = auth.uid() or public.app_pode('tabelas.editar'));

revoke all on public.tabelas_calculo, public.tabela_linhas, public.tabela_linha_comissoes, public.simulacoes from anon;
revoke insert, update, delete on public.simulacoes from authenticated;

create trigger trg_auditoria after insert or update or delete on public.tabelas_calculo
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.tabela_linhas
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.tabela_linha_comissoes
  for each row execute function public.auditar();
