-- 0003 — Bancos, parceiros, agentes e origens

create function public.so_digitos(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(p, ''), '\D', '', 'g')
$$;

-- ── Bancos ────────────────────────────────────────────────────
create table public.bancos (
  id uuid primary key default gen_random_uuid(),
  codigo char(3) not null unique check (codigo ~ '^\d{3}$'),
  nome text not null,
  ativo boolean not null default true
);

insert into public.bancos (codigo, nome) values
  ('001', 'Banco do Brasil'), ('033', 'Santander'), ('104', 'Caixa Econômica Federal'),
  ('237', 'Bradesco'), ('341', 'Itaú'), ('260', 'Nubank'), ('077', 'Banco Inter'),
  ('336', 'C6 Bank'), ('756', 'Sicoob'), ('748', 'Sicredi');

-- ── Origens ───────────────────────────────────────────────────
create table public.origens (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true
);

insert into public.origens (nome) values ('Tráfego pago'), ('Indicação'), ('Parceiro'), ('Balcão');

-- ── Parceiros ─────────────────────────────────────────────────
create table public.parceiros (
  id uuid primary key default gen_random_uuid(),
  tipo_pessoa text not null check (tipo_pessoa in ('PF', 'PJ')),
  documento text not null unique,
  nome text not null check (btrim(nome) <> ''),
  email text,
  celular text not null,
  whatsapp text not null,
  recebe_mensalidades boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create function public.trg_parceiros_normalizar() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.documento := public.so_digitos(new.documento);
  new.celular := public.so_digitos(new.celular);
  new.whatsapp := public.so_digitos(new.whatsapp);
  if length(new.documento) not in (11, 14) then
    raise exception 'Documento do parceiro inválido: informe CPF (11 dígitos) ou CNPJ (14 dígitos).';
  end if;
  if length(new.celular) not between 10 and 11 or length(new.whatsapp) not between 10 and 11 then
    raise exception 'Celular e WhatsApp devem ter DDD e número (10 ou 11 dígitos).';
  end if;
  return new;
end $$;

create trigger trg_parceiros_normalizar before insert or update on public.parceiros
  for each row execute function public.trg_parceiros_normalizar();

alter table public.usuarios
  add constraint usuarios_parceiro_fk foreign key (parceiro_id) references public.parceiros (id);

create table public.parceiro_contas (
  id uuid primary key default gen_random_uuid(),
  parceiro_id uuid not null references public.parceiros (id) on delete cascade,
  banco_id uuid not null references public.bancos (id),
  agencia text not null,
  conta text not null,
  tipo_conta text not null check (tipo_conta in ('corrente', 'poupanca', 'pagamento')),
  chave_pix text,
  tipo_chave_pix text check (tipo_chave_pix in ('cpf', 'cnpj', 'email', 'celular', 'aleatoria')),
  principal boolean not null default false,
  check ((chave_pix is null) = (tipo_chave_pix is null))
);
create unique index parceiro_contas_uma_principal on public.parceiro_contas (parceiro_id) where principal;

create table public.agentes (
  id uuid primary key default gen_random_uuid(),
  parceiro_id uuid not null references public.parceiros (id),
  nome text not null check (btrim(nome) <> ''),
  celular text,
  ativo boolean not null default true
);

-- ── Conta principal (troca atômica) ───────────────────────────
create function public.definir_conta_principal(p_conta_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_parceiro uuid;
begin
  perform public.app_exigir('parceiros.editar');
  select parceiro_id into v_parceiro from public.parceiro_contas where id = p_conta_id;
  if v_parceiro is null then
    raise exception 'Conta não encontrada.';
  end if;
  update public.parceiro_contas set principal = false where parceiro_id = v_parceiro and principal;
  update public.parceiro_contas set principal = true where id = p_conta_id;
end $$;

revoke execute on function public.definir_conta_principal(uuid) from public, anon;
grant execute on function public.definir_conta_principal(uuid) to authenticated;

-- ── RLS ───────────────────────────────────────────────────────
alter table public.bancos enable row level security;
alter table public.origens enable row level security;
alter table public.parceiros enable row level security;
alter table public.parceiro_contas enable row level security;
alter table public.agentes enable row level security;

create policy bancos_ler on public.bancos for select to authenticated using (true);
create policy bancos_escrever on public.bancos for all to authenticated
  using (public.app_pode('apoio.editar')) with check (public.app_pode('apoio.editar'));

create policy origens_ler on public.origens for select to authenticated using (true);
create policy origens_escrever on public.origens for all to authenticated
  using (public.app_pode('apoio.editar')) with check (public.app_pode('apoio.editar'));

create policy parceiros_ler on public.parceiros for select to authenticated
  using (public.app_pode('parceiros.ver') or id = public.app_parceiro_id());
create policy parceiros_escrever on public.parceiros for all to authenticated
  using (public.app_pode('parceiros.editar')) with check (public.app_pode('parceiros.editar'));

create policy parceiro_contas_ler on public.parceiro_contas for select to authenticated
  using (public.app_pode('parceiros.ver') or parceiro_id = public.app_parceiro_id());
create policy parceiro_contas_escrever on public.parceiro_contas for all to authenticated
  using (public.app_pode('parceiros.editar')) with check (public.app_pode('parceiros.editar'));

create policy agentes_ler on public.agentes for select to authenticated
  using (public.app_pode('parceiros.ver') or parceiro_id = public.app_parceiro_id());
create policy agentes_escrever on public.agentes for all to authenticated
  using (public.app_pode('parceiros.editar')) with check (public.app_pode('parceiros.editar'));

revoke all on public.bancos, public.origens, public.parceiros, public.parceiro_contas, public.agentes from anon;

-- ── Auditoria ─────────────────────────────────────────────────
create trigger trg_auditoria after insert or update or delete on public.bancos
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.origens
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.parceiros
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.parceiro_contas
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.agentes
  for each row execute function public.auditar();
