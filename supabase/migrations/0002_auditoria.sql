-- 0002 — Auditoria só-inserção
-- Toda alteração em tabelas sensíveis grava quem, quando, antes e depois.
-- Ninguém (nem o dono do banco) altera ou apaga um registro depois de gravado.

create table public.auditoria (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  usuario_id uuid,
  acao text not null,
  tabela text,
  registro_id text,
  antes jsonb,
  depois jsonb,
  detalhe jsonb
);

create index auditoria_tabela_registro_idx on public.auditoria (tabela, registro_id);
create index auditoria_em_idx on public.auditoria (em desc);

create function public.trg_auditoria_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Registros de auditoria não podem ser alterados.';
end $$;

create trigger trg_auditoria_imutavel before update or delete on public.auditoria
  for each row execute function public.trg_auditoria_imutavel();
create trigger trg_auditoria_imutavel_truncate before truncate on public.auditoria
  for each statement execute function public.trg_auditoria_imutavel();

-- Trigger genérico para as tabelas auditadas
create function public.auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  insert into public.auditoria (usuario_id, acao, tabela, registro_id, antes, depois)
  values (auth.uid(), tg_op, tg_table_name,
          coalesce(v_depois, v_antes)->>'id', v_antes, v_depois);
  return null;
end $$;

-- Acessos sensíveis (login, consulta de CPF, download de documento)
create function public.registrar_acesso(p_acao text, p_detalhe jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Você precisa estar logado.' using errcode = '42501';
  end if;
  insert into public.auditoria (usuario_id, acao, detalhe) values (auth.uid(), p_acao, p_detalhe);
end $$;

revoke execute on function public.auditar(), public.registrar_acesso(text, jsonb) from public, anon;
grant execute on function public.registrar_acesso(text, jsonb) to authenticated;

alter table public.auditoria enable row level security;
create policy auditoria_ler on public.auditoria for select to authenticated
  using (public.app_pode('auditoria.ver'));
revoke all on public.auditoria from anon;
revoke insert, update, delete, truncate on public.auditoria from authenticated;

create trigger trg_auditoria after insert or update or delete on public.usuarios
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.perfil_permissoes
  for each row execute function public.auditar();
