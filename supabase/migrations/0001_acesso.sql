-- 0001 — Perfis, permissões e usuários
-- Regras de acesso ficam no banco: o front só mostra/esconde, quem decide é a RLS.

create type public.perfil_acesso as enum
  ('administrador', 'gerente', 'financeiro', 'operador', 'consulta', 'parceiro');

-- ── Catálogo de permissões ────────────────────────────────────
create table public.permissoes (
  chave text primary key,
  descricao text not null
);

insert into public.permissoes (chave, descricao) values
  ('usuarios.gerenciar',          'Criar, editar e desativar usuários'),
  ('permissoes.gerenciar',        'Editar a matriz de permissões'),
  ('auditoria.ver',               'Ver o registro de auditoria'),
  ('convenios.ver',               'Ver convênios'),
  ('convenios.editar',            'Editar convênios'),
  ('tabelas.editar',              'Editar tabelas de cálculo'),
  ('simulador.usar',              'Usar o simulador'),
  ('clientes.ver',                'Ver clientes'),
  ('clientes.editar',             'Editar clientes'),
  ('clientes.aprovar_alteracoes', 'Aprovar alterações propostas por parceiros'),
  ('parceiros.ver',               'Ver parceiros e agentes'),
  ('parceiros.editar',            'Editar parceiros e agentes'),
  ('apoio.editar',                'Editar bancos e origens');

create table public.perfil_permissoes (
  perfil public.perfil_acesso not null,
  permissao text not null references public.permissoes (chave) on delete cascade,
  primary key (perfil, permissao)
);

-- Teto do parceiro: o escopo dele é imposto pela RLS, e ele nunca recebe
-- permissões administrativas, mesmo que alguém marque na matriz.
create function public.trg_teto_parceiro() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.perfil = 'parceiro'
     and new.permissao not in ('simulador.usar', 'convenios.ver', 'clientes.ver', 'clientes.editar') then
    raise exception 'Esta permissão não pode ser dada ao perfil parceiro.';
  end if;
  return new;
end $$;

create trigger trg_teto_parceiro before insert or update on public.perfil_permissoes
  for each row execute function public.trg_teto_parceiro();

-- Matriz padrão
insert into public.perfil_permissoes (perfil, permissao)
select 'administrador', chave from public.permissoes;

insert into public.perfil_permissoes (perfil, permissao)
select 'gerente', chave from public.permissoes
where chave not in ('usuarios.gerenciar', 'permissoes.gerenciar');

insert into public.perfil_permissoes (perfil, permissao) values
  ('financeiro', 'convenios.ver'), ('financeiro', 'clientes.ver'),
  ('financeiro', 'parceiros.ver'), ('financeiro', 'simulador.usar'),
  ('operador', 'convenios.ver'), ('operador', 'simulador.usar'),
  ('operador', 'clientes.ver'), ('operador', 'clientes.editar'),
  ('operador', 'clientes.aprovar_alteracoes'), ('operador', 'parceiros.ver'),
  ('consulta', 'convenios.ver'), ('consulta', 'clientes.ver'),
  ('consulta', 'parceiros.ver'), ('consulta', 'simulador.usar'),
  ('parceiro', 'simulador.usar'), ('parceiro', 'convenios.ver'),
  ('parceiro', 'clientes.ver'), ('parceiro', 'clientes.editar');

-- ── Usuários ──────────────────────────────────────────────────
create table public.usuarios (
  id uuid primary key references auth.users (id) on delete restrict,
  nome text not null check (btrim(nome) <> ''),
  email text not null,
  perfil public.perfil_acesso not null,
  parceiro_id uuid,  -- FK para parceiros adicionada na 0003
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint usuarios_parceiro_coerente check ((perfil = 'parceiro') = (parceiro_id is not null))
);

-- ── Funções de acesso ─────────────────────────────────────────
create function public.app_perfil() returns public.perfil_acesso
language sql stable security definer set search_path = '' as $$
  select u.perfil from public.usuarios u where u.id = auth.uid() and u.ativo
$$;

create function public.app_pode(p_permissao text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.usuarios u
    join public.perfil_permissoes pp on pp.perfil = u.perfil
    where u.id = auth.uid() and u.ativo and pp.permissao = p_permissao
  )
$$;

create function public.app_parceiro_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.parceiro_id from public.usuarios u
  where u.id = auth.uid() and u.ativo and u.perfil = 'parceiro'
$$;

create function public.app_exigir(p_permissao text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_pode(p_permissao) then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
end $$;

revoke execute on function public.app_perfil(), public.app_pode(text),
  public.app_parceiro_id(), public.app_exigir(text) from public, anon;
grant execute on function public.app_perfil(), public.app_pode(text),
  public.app_parceiro_id(), public.app_exigir(text) to authenticated;
-- anon só pode perguntar (sempre recebe false); não executa o resto
grant execute on function public.app_pode(text) to anon;

-- Ninguém altera o próprio perfil, vínculo de parceiro ou status
create function public.trg_usuarios_proprio() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id = auth.uid() and (
       new.perfil is distinct from old.perfil
    or new.parceiro_id is distinct from old.parceiro_id
    or new.ativo is distinct from old.ativo) then
    raise exception 'Você não pode alterar o seu próprio perfil ou acesso.';
  end if;
  return new;
end $$;

create trigger trg_usuarios_proprio before update on public.usuarios
  for each row execute function public.trg_usuarios_proprio();

-- ── RLS ───────────────────────────────────────────────────────
alter table public.permissoes enable row level security;
alter table public.perfil_permissoes enable row level security;
alter table public.usuarios enable row level security;

create policy permissoes_ler on public.permissoes for select to authenticated using (true);

create policy perfil_permissoes_ler on public.perfil_permissoes for select to authenticated using (true);
create policy perfil_permissoes_escrever on public.perfil_permissoes for all to authenticated
  using (public.app_pode('permissoes.gerenciar'))
  with check (public.app_pode('permissoes.gerenciar'));

create policy usuarios_ler on public.usuarios for select to authenticated
  using (id = auth.uid() or public.app_pode('usuarios.gerenciar'));
create policy usuarios_escrever on public.usuarios for all to authenticated
  using (public.app_pode('usuarios.gerenciar'))
  with check (public.app_pode('usuarios.gerenciar'));

revoke all on public.permissoes, public.perfil_permissoes, public.usuarios from anon;
