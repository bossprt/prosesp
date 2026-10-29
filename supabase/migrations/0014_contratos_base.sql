-- 0014 — Base da esteira: fases, situações, permissões, configurações e matriz de transições

create type public.fase_contrato as enum (
  'pre_digitacao', 'digitado', 'em_validacao', 'pendente', 'em_averbacao', 'averbado',
  'aguardando_assinatura', 'aguardando_pagamento', 'credito_liberado', 'recusado', 'cancelado'
);
create type public.situacao_contrato as enum (
  'em_andamento', 'ativo', 'em_atraso', 'quitado', 'renovado', 'cancelado', 'prejuizo'
);
create type public.situacao_averbacao as enum (
  'proposta', 'ativa', 'substituida', 'migrada', 'cancelamento_pendente', 'cancelada'
);

-- ── Permissões ────────────────────────────────────────────────
insert into public.permissoes (chave, descricao) values
  ('contratos.ver',             'Ver contratos'),
  ('contratos.digitar',         'Digitar contratos (parceiro: pré-digitar)'),
  ('contratos.mover',           'Mover contratos na esteira'),
  ('contratos.recusar',         'Recusar contratos'),
  ('contratos.editar_averbado', 'Editar contrato depois de averbado'),
  ('contratos.liberar',         'Liberar o crédito ao cliente'),
  ('contratos.encerrar',        'Encerrar contratos (quitação, cancelamento, prejuízo)'),
  ('comissoes.ver',             'Ver comissões'),
  ('mensalidades.cancelar',     'Cancelar mensalidade'),
  ('averbadora.pendencias',     'Resolver pendências da averbadora');

-- teto do parceiro passa a aceitar ver e (pré-)digitar contratos
create or replace function public.trg_teto_parceiro() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.perfil = 'parceiro' and new.permissao not in (
    'simulador.usar', 'convenios.ver', 'clientes.ver', 'clientes.editar', 'contratos.ver', 'contratos.digitar'
  ) then
    raise exception 'Esta permissão não pode ser dada ao perfil parceiro.';
  end if;
  return new;
end $$;

insert into public.perfil_permissoes (perfil, permissao)
select 'administrador', chave from public.permissoes
where chave like 'contratos.%' or chave in ('comissoes.ver', 'mensalidades.cancelar', 'averbadora.pendencias');

insert into public.perfil_permissoes (perfil, permissao)
select 'gerente', chave from public.permissoes
where (chave like 'contratos.%' or chave in ('comissoes.ver', 'mensalidades.cancelar', 'averbadora.pendencias'))
  and chave <> 'contratos.liberar';

insert into public.perfil_permissoes (perfil, permissao) values
  ('financeiro', 'contratos.ver'), ('financeiro', 'contratos.liberar'), ('financeiro', 'comissoes.ver'),
  ('operador', 'contratos.ver'), ('operador', 'contratos.digitar'), ('operador', 'contratos.mover'),
  ('operador', 'averbadora.pendencias'),
  ('consulta', 'contratos.ver'),
  ('parceiro', 'contratos.ver'), ('parceiro', 'contratos.digitar');

-- ── Configurações gerais ──────────────────────────────────────
create table public.configuracoes (
  chave text primary key,
  valor jsonb not null,
  descricao text
);
insert into public.configuracoes (chave, valor, descricao) values
  ('parceiro_ve_todos_contratos', 'false', 'Parceiro vê todos os contratos dos clientes vinculados (não só os dele)');

create function public.config_bool(p_chave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (c.valor)::text::boolean from public.configuracoes c where c.chave = p_chave), false)
$$;
revoke execute on function public.config_bool(text) from public, anon;
grant execute on function public.config_bool(text) to authenticated;

alter table public.configuracoes enable row level security;
create policy configuracoes_ler on public.configuracoes for select to authenticated using (true);
create policy configuracoes_escrever on public.configuracoes for all to authenticated
  using (public.app_pode('permissoes.gerenciar')) with check (public.app_pode('permissoes.gerenciar'));
revoke all on public.configuracoes from anon;
create trigger trg_auditoria after insert or update or delete on public.configuracoes
  for each row execute function public.auditar();

-- ── Matriz de transições (configurável) ───────────────────────
create table public.fase_transicoes (
  de public.fase_contrato not null,
  para public.fase_contrato not null,
  permissao text not null references public.permissoes (chave),
  primary key (de, para),
  -- crédito liberado só pela função liberar_credito
  check (para <> 'credito_liberado')
);

insert into public.fase_transicoes (de, para, permissao) values
  ('pre_digitacao', 'digitado', 'contratos.mover'),
  ('digitado', 'em_validacao', 'contratos.mover'),
  ('em_validacao', 'em_averbacao', 'contratos.mover'),
  ('em_averbacao', 'averbado', 'contratos.mover'),
  ('averbado', 'aguardando_assinatura', 'contratos.mover'),
  ('aguardando_assinatura', 'aguardando_pagamento', 'contratos.mover');

insert into public.fase_transicoes (de, para, permissao)
select f, 'pendente', 'contratos.mover'
from unnest(array['digitado', 'em_validacao', 'em_averbacao', 'averbado',
                  'aguardando_assinatura', 'aguardando_pagamento']::public.fase_contrato[]) f;

insert into public.fase_transicoes (de, para, permissao)
select f, 'recusado', 'contratos.recusar'
from unnest(array['pre_digitacao', 'digitado', 'em_validacao', 'pendente', 'em_averbacao', 'averbado',
                  'aguardando_assinatura', 'aguardando_pagamento']::public.fase_contrato[]) f;

alter table public.fase_transicoes enable row level security;
create policy fase_transicoes_ler on public.fase_transicoes for select to authenticated using (true);
create policy fase_transicoes_escrever on public.fase_transicoes for all to authenticated
  using (public.app_pode('permissoes.gerenciar')) with check (public.app_pode('permissoes.gerenciar'));
revoke all on public.fase_transicoes from anon;
create trigger trg_auditoria after insert or update or delete on public.fase_transicoes
  for each row execute function public.auditar();

-- ── Tipos de desconto por convênio (vazio até a PROSESP definir) ─
create table public.convenio_tipos_desconto (
  id uuid primary key default gen_random_uuid(),
  convenio_id uuid not null references public.convenios (id),
  nome text not null check (btrim(nome) <> ''),
  forma text not null check (forma in ('fixo', 'percentual')),
  valor_padrao numeric(14,4) check (valor_padrao >= 0),
  ativo boolean not null default true,
  unique (convenio_id, nome)
);
alter table public.convenio_tipos_desconto enable row level security;
create policy convenio_tipos_desconto_ler on public.convenio_tipos_desconto for select to authenticated
  using (public.app_pode('convenios.ver'));
create policy convenio_tipos_desconto_escrever on public.convenio_tipos_desconto for all to authenticated
  using (public.app_pode('convenios.editar')) with check (public.app_pode('convenios.editar'));
revoke all on public.convenio_tipos_desconto from anon;
create trigger trg_auditoria after insert or update or delete on public.convenio_tipos_desconto
  for each row execute function public.auditar();

-- ── Documento: requerimento de cancelamento da mensalidade ────
alter table public.cliente_documentos drop constraint cliente_documentos_tipo_check;
alter table public.cliente_documentos add constraint cliente_documentos_tipo_check
  check (tipo in ('rg', 'comprovante_residencia', 'requerimento_cancelamento', 'outro'));
