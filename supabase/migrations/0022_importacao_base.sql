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

-- Índices nas chaves estrangeiras que o desfazer percorre em cascata (sem eles, cada linha apagada varre a tabela)
create index if not exists parcela_pagamentos_parcela on public.parcela_pagamentos (parcela_id);
create index if not exists parcela_pagamentos_averbacao on public.parcela_pagamentos (averbacao_id);
create index if not exists parcelas_averbacao on public.parcelas (averbacao_id);
create index if not exists contrato_quitacoes_contrato on public.contrato_quitacoes (contrato_id);
create index if not exists contrato_quitacoes_quitado on public.contrato_quitacoes (contrato_quitado_id);
create index if not exists contrato_descontos_contrato on public.contrato_descontos (contrato_id);
create index if not exists contrato_dividas_contrato on public.contrato_dividas_externas (contrato_id);
create index if not exists contrato_eventos_contrato on public.contrato_eventos (contrato_id);
create index if not exists contrato_averbacoes_contrato on public.contrato_averbacoes (contrato_id);
create index if not exists contrato_versoes_contrato on public.contrato_versoes (contrato_id);
create index if not exists pendencias_contrato on public.pendencias_averbadora (contrato_id);
create index if not exists pendencias_averbacao on public.pendencias_averbadora (averbacao_id);
create index if not exists pendencias_mens_averbacao on public.pendencias_averbadora (mensalidade_averbacao_id);
create index if not exists mensalidade_averbacoes_origem on public.mensalidade_averbacoes (contrato_origem_id);
create index if not exists mensalidade_averbacoes_mensalidade on public.mensalidade_averbacoes (mensalidade_id);
create index if not exists mensalidade_valores_averbacao on public.mensalidade_valores (averbacao_id);
create index if not exists cliente_historico_cliente on public.cliente_historico (cliente_id);

-- A marca de importação só é posta pelas funções do sistema (base segura do desfazer)
create function public.trg_importacao_id_protegido() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and ((tg_op = 'INSERT' and new.importacao_id is not null)
          or (tg_op = 'UPDATE' and new.importacao_id is distinct from old.importacao_id)) then
    raise exception 'A marca de importação só é definida pelo próprio sistema.';
  end if;
  return new;
end $$;
create trigger trg_importacao_id_protegido before insert or update on public.clientes
  for each row execute function public.trg_importacao_id_protegido();
create trigger trg_importacao_id_protegido before insert or update on public.cliente_matriculas
  for each row execute function public.trg_importacao_id_protegido();
create trigger trg_importacao_id_protegido before insert or update on public.contratos
  for each row execute function public.trg_importacao_id_protegido();
create trigger trg_importacao_id_protegido before insert or update on public.mensalidades
  for each row execute function public.trg_importacao_id_protegido();
create trigger trg_importacao_id_protegido before insert or update on public.mensalidade_averbacoes
  for each row execute function public.trg_importacao_id_protegido();
create trigger trg_importacao_id_protegido before insert or update on public.contrato_averbacoes
  for each row execute function public.trg_importacao_id_protegido();

alter table public.importacoes add column ultimo_lote_em timestamptz;
