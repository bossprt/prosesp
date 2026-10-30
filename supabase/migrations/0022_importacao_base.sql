-- 0022 — Base da importação dos dados antigos (Etapa 3)

insert into public.permissoes (chave, descricao) values
  ('importacao.executar', 'Importar dados do sistema anterior');
insert into public.perfil_permissoes (perfil, permissao) values ('administrador', 'importacao.executar');

create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  arquivo_nome text not null,
  arquivo_caminho text,
  hash text not null,
  data_posicao date not null,
  situacao text not null default 'em_andamento' check (situacao in ('em_andamento', 'gravada', 'desfeita')),
  resumo jsonb,
  erros jsonb,
  usuario_id uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  concluida_em timestamptz,
  desfeita_em timestamptz,
  desfeita_por uuid
);
create index importacoes_hash on public.importacoes (hash);
alter table public.importacoes enable row level security;
create policy importacoes_ler on public.importacoes for select to authenticated
  using (public.app_equipe_pode('importacao.executar'));
revoke all on public.importacoes from anon;
revoke insert, update, delete, truncate on public.importacoes from authenticated;
create trigger trg_auditoria after insert or update or delete on public.importacoes
  for each row execute function public.auditar();

-- Marca de origem em tudo que a importação cria (base do desfazer)
alter table public.clientes add column importacao_id uuid references public.importacoes (id);
alter table public.cliente_matriculas add column importacao_id uuid references public.importacoes (id);
alter table public.contratos add column importacao_id uuid references public.importacoes (id),
  add column numero_legado text unique check (numero_legado is null or btrim(numero_legado) <> ''),
  add column quitados_legado text;
alter table public.mensalidades add column importacao_id uuid references public.importacoes (id);
alter table public.mensalidade_averbacoes add column importacao_id uuid references public.importacoes (id);
alter table public.contrato_averbacoes add column importacao_id uuid references public.importacoes (id);
create index clientes_importacao on public.clientes (importacao_id) where importacao_id is not null;
create index cliente_matriculas_importacao on public.cliente_matriculas (importacao_id) where importacao_id is not null;
create index contratos_importacao on public.contratos (importacao_id) where importacao_id is not null;
create index mensalidades_importacao on public.mensalidades (importacao_id) where importacao_id is not null;
create index mensalidade_averbacoes_importacao on public.mensalidade_averbacoes (importacao_id) where importacao_id is not null;
create index contrato_averbacoes_importacao on public.contrato_averbacoes (importacao_id) where importacao_id is not null;

-- Arquivo original da importação
insert into storage.buckets (id, name, public) values ('importacoes', 'importacoes', false)
on conflict (id) do update set public = false;
create policy importacoes_ler_arquivo on storage.objects for select to authenticated
  using (bucket_id = 'importacoes' and public.app_equipe_pode('importacao.executar'));
create policy importacoes_enviar_arquivo on storage.objects for insert to authenticated
  with check (bucket_id = 'importacoes' and public.app_equipe_pode('importacao.executar'));

-- Conversores (o app manda tudo como texto; o banco recusa com mensagem)
create function public._imp_chave(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g'))
$$;

create function public._imp_data(p text, p_campo text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or btrim(p) = '' then
    return null;
  end if;
  if btrim(p) !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '% inválida: %.', p_campo, p;
  end if;
  return btrim(p)::date;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception '% inválida: %.', p_campo, p;
end $$;

create function public._imp_competencia(p text, p_campo text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or btrim(p) = '' then
    return null;
  end if;
  if btrim(p) !~ '^\d{4}-\d{2}(-\d{2})?$' then
    raise exception '% inválida: %.', p_campo, p;
  end if;
  return date_trunc('month', (left(btrim(p), 7) || '-01')::date)::date;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception '% inválida: %.', p_campo, p;
end $$;

create function public._imp_inteiro(p text, p_campo text) returns integer
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or btrim(p) = '' then
    return null;
  end if;
  if btrim(p) !~ '^\d{1,6}$' then
    raise exception '% inválido: %.', p_campo, p;
  end if;
  return btrim(p)::integer;
end $$;

revoke execute on function public._imp_chave(text), public._imp_data(text, text), public._imp_competencia(text, text),
  public._imp_inteiro(text, text) from public, anon;

-- Histórico de eventos: apagar só dentro do desfazer de uma importação
create or replace function public.trg_eventos_imutaveis() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_setting('app.desfazendo_importacao', true) = 'on' then
    return old;
  end if;
  raise exception 'O histórico do contrato não pode ser alterado.';
end $$;
