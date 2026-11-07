-- 0035 — Base do retorno (Etapa 5): permissões, retornos e linhas, pagamentos de mensalidade,
-- baixas de diferença, saldos e recálculo de situação de parcelas e contratos.

insert into public.permissoes (chave, descricao) values
  ('retorno.ver',              'Ver retornos, remessa e adimplência'),
  ('retorno.importar',         'Importar retorno, tratar linhas e gerar remessa'),
  ('retorno.baixar_diferenca', 'Dar baixa em diferença de desconto e desfazer retorno');
insert into public.perfil_permissoes (perfil, permissao) values
  ('administrador', 'retorno.ver'), ('administrador', 'retorno.importar'), ('administrador', 'retorno.baixar_diferenca'),
  ('gerente', 'retorno.ver'), ('gerente', 'retorno.importar'), ('gerente', 'retorno.baixar_diferenca'),
  ('financeiro', 'retorno.ver'), ('financeiro', 'retorno.importar'),
  ('operador', 'retorno.ver'),
  ('consulta', 'retorno.ver');

-- ── Retornos importados ───────────────────────────────────────
create table public.retornos (
  id uuid primary key default gen_random_uuid(),
  convenio_id uuid not null references public.convenios (id),
  produto text not null check (produto in ('parcelas', 'mensalidades')),
  tipo text not null check (tipo in ('descontados', 'nao_descontados')),
  competencia date not null check (extract(day from competencia) = 1),
  arquivo_nome text not null check (btrim(arquivo_nome) <> ''),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  situacao text not null default 'gravado' check (situacao in ('gravado', 'desfeito')),
  resumo jsonb not null default '{}'::jsonb,
  usuario_id uuid default auth.uid(),
  criado_em timestamptz not null default clock_timestamp(),
  desfeito_em timestamptz,
  desfeito_por uuid,
  motivo_desfazer text
);
create unique index retornos_hash_gravado on public.retornos (hash) where situacao = 'gravado';
create index retornos_convenio on public.retornos (convenio_id, produto, competencia);

create table public.retorno_linhas (
  id uuid primary key default gen_random_uuid(),
  retorno_id uuid not null references public.retornos (id) on delete cascade,
  linha integer not null,
  dados jsonb not null default '{}'::jsonb,
  ade text, cpf text, matricula text, nome text,
  valor numeric(14,2),
  competencia_arquivo date,
  observacao text,
  situacao text not null check (situacao in ('conciliada', 'parcial', 'ade_antiga', 'divergente', 'nao_encontrada',
                                             'duplicada', 'nao_descontada', 'ignorada')),
  motivo text,
  contrato_id uuid references public.contratos (id),
  parcela_id uuid references public.parcelas (id),
  mensalidade_id uuid references public.mensalidades (id),
  mensalidade_parcela_id uuid references public.mensalidade_parcelas (id),
  sugestao_contrato_id uuid references public.contratos (id),
  sugestao_mensalidade_id uuid references public.mensalidades (id),
  valor_aplicado numeric(14,2),
  tratamento text check (tratamento in ('vinculada', 'ignorada')),
  tratamento_motivo text,
  tratada_por uuid,
  tratada_em timestamptz
);
create index retorno_linhas_retorno on public.retorno_linhas (retorno_id, situacao);
create index retorno_linhas_parcela on public.retorno_linhas (parcela_id) where parcela_id is not null;
create index retorno_linhas_mens_parcela on public.retorno_linhas (mensalidade_parcela_id) where mensalidade_parcela_id is not null;

alter table public.parcela_pagamentos add column retorno_linha_id uuid references public.retorno_linhas (id);
create index parcela_pagamentos_linha on public.parcela_pagamentos (retorno_linha_id) where retorno_linha_id is not null;

create table public.mensalidade_pagamentos (
  id uuid primary key default gen_random_uuid(),
  mensalidade_parcela_id uuid not null references public.mensalidade_parcelas (id) on delete cascade,
  valor numeric(14,2) not null check (valor > 0),
  competencia_desconto date not null,
  origem text not null default 'retorno',
  retorno_linha_id uuid references public.retorno_linhas (id),
  criado_em timestamptz not null default now()
);
create index mensalidade_pagamentos_parcela on public.mensalidade_pagamentos (mensalidade_parcela_id);
create index mensalidade_pagamentos_linha on public.mensalidade_pagamentos (retorno_linha_id) where retorno_linha_id is not null;

create table public.diferenca_baixas (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid references public.parcelas (id) on delete cascade,
  mensalidade_parcela_id uuid references public.mensalidade_parcelas (id) on delete cascade,
  valor numeric(14,2) not null check (valor > 0),
  motivo text not null check (btrim(motivo) <> ''),
  usuario_id uuid default auth.uid(),
  criado_em timestamptz not null default clock_timestamp(),
  check ((parcela_id is null) <> (mensalidade_parcela_id is null))
);
create index diferenca_baixas_parcela on public.diferenca_baixas (parcela_id) where parcela_id is not null;
create index diferenca_baixas_mens on public.diferenca_baixas (mensalidade_parcela_id) where mensalidade_parcela_id is not null;

-- ── Saldos (pagamentos + baixas) ──────────────────────────────
create or replace view public.v_parcelas_saldo with (security_invoker = true) as
  select p.id as parcela_id, p.valor,
         coalesce(g.pago, 0)::numeric(14,2) as pago,
         (p.valor - coalesce(g.pago, 0) - coalesce(b.baixado, 0))::numeric(14,2) as saldo,
         coalesce(b.baixado, 0)::numeric(14,2) as baixado
  from public.parcelas p
  left join (select parcela_id, sum(valor) as pago from public.parcela_pagamentos group by parcela_id) g on g.parcela_id = p.id
  left join (select parcela_id, sum(valor) as baixado from public.diferenca_baixas where parcela_id is not null group by parcela_id) b
    on b.parcela_id = p.id;
revoke all on public.v_parcelas_saldo from anon;

create view public.v_mensalidade_parcelas_saldo with (security_invoker = true) as
  select p.id as mensalidade_parcela_id, p.valor,
         coalesce(g.pago, 0)::numeric(14,2) as pago,
         coalesce(b.baixado, 0)::numeric(14,2) as baixado,
         (p.valor - coalesce(g.pago, 0) - coalesce(b.baixado, 0))::numeric(14,2) as saldo
  from public.mensalidade_parcelas p
  left join (select mensalidade_parcela_id, sum(valor) as pago from public.mensalidade_pagamentos group by mensalidade_parcela_id) g
    on g.mensalidade_parcela_id = p.id
  left join (select mensalidade_parcela_id, sum(valor) as baixado from public.diferenca_baixas
             where mensalidade_parcela_id is not null group by mensalidade_parcela_id) b on b.mensalidade_parcela_id = p.id;
revoke all on public.v_mensalidade_parcelas_saldo from anon;

-- ── Recálculo de situação ─────────────────────────────────────
-- Saldo zero = paga; vencida = atrasada; com pagamento = parcial; senão aberta. Cancelada/prejuízo não mudam.
create function public._recalcular_parcela(p_id uuid, p_hoje date default current_date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.parcelas;
  v_pago numeric;
  v_baixado numeric;
begin
  select * into p from public.parcelas where id = p_id;
  if p.id is null or p.status in ('cancelada', 'prejuizo') then
    return;
  end if;
  select coalesce(sum(valor), 0) into v_pago from public.parcela_pagamentos where parcela_id = p_id;
  select coalesce(sum(valor), 0) into v_baixado from public.diferenca_baixas where parcela_id = p_id;
  update public.parcelas set status = case
      when p.valor - v_pago - v_baixado <= 0 then 'paga'
      when p.vencimento < p_hoje then 'atrasada'
      when v_pago + v_baixado > 0 then 'parcial'
      else 'aberta' end
  where id = p_id;
end $$;

create function public._vencimento_mensalidade(p_mensalidade_parcela_id uuid) returns date
language sql stable security definer set search_path = '' as $$
  select make_date(extract(year from mp.competencia)::int, extract(month from mp.competencia)::int, coalesce(cv.dia_vencimento, 28))
  from public.mensalidade_parcelas mp
  join public.mensalidades m on m.id = mp.mensalidade_id
  join public.cliente_matriculas cm on cm.id = m.matricula_id
  join public.convenios cv on cv.id = cm.convenio_id
  where mp.id = p_mensalidade_parcela_id
$$;

create function public._recalcular_mensalidade_parcela(p_id uuid, p_hoje date default current_date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.mensalidade_parcelas;
  v_pago numeric;
  v_baixado numeric;
begin
  select * into p from public.mensalidade_parcelas where id = p_id;
  if p.id is null or p.status = 'cancelada' then
    return;
  end if;
  select coalesce(sum(valor), 0) into v_pago from public.mensalidade_pagamentos where mensalidade_parcela_id = p_id;
  select coalesce(sum(valor), 0) into v_baixado from public.diferenca_baixas where mensalidade_parcela_id = p_id;
  update public.mensalidade_parcelas set status = case
      when p.valor - v_pago - v_baixado <= 0 then 'paga'
      when public._vencimento_mensalidade(p_id) < p_hoje then 'atrasada'
      when v_pago + v_baixado > 0 then 'parcial'
      else 'aberta' end
  where id = p_id;
end $$;

-- Ativo ↔ em atraso (mesma regra da função diária); outras situações não mudam.
create function public._recalcular_situacao_contrato(p_contrato_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.contratos k set situacao = case
      when exists (select 1 from public.parcelas p where p.contrato_id = k.id and p.status = 'atrasada')
      then 'em_atraso'::public.situacao_contrato else 'ativo'::public.situacao_contrato end
  where k.id = p_contrato_id and k.situacao in ('ativo', 'em_atraso');
end $$;

revoke execute on function public._recalcular_parcela(uuid, date), public._recalcular_mensalidade_parcela(uuid, date),
  public._recalcular_situacao_contrato(uuid), public._vencimento_mensalidade(uuid) from public, anon, authenticated;

-- ── Layout do retorno e da remessa ────────────────────────────
create function public._layout_erro(p_retorno jsonb, p_remessa jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_chave text;
  v_valor jsonb;
  v_titulos text[] := '{}';
  v_item jsonb;
begin
  if p_retorno is not null then
    if jsonb_typeof(p_retorno) <> 'object' or jsonb_typeof(p_retorno -> 'colunas') is distinct from 'object' then
      return 'Layout do retorno inválido: faltam as colunas.';
    end if;
    for v_chave, v_valor in select * from jsonb_each(p_retorno -> 'colunas') loop
      if v_chave not in ('ade', 'cpf', 'matricula', 'valor', 'nome', 'competencia', 'observacao', 'parcela_paga', 'parcela_total') then
        return format('Layout do retorno: campo desconhecido "%s".', v_chave);
      end if;
      if jsonb_typeof(v_valor) <> 'string' or btrim(v_valor #>> '{}') = '' then
        return format('Layout do retorno: informe o nome da coluna do campo "%s".', v_chave);
      end if;
      if lower(btrim(v_valor #>> '{}')) = any (v_titulos) then
        return format('Layout do retorno: a coluna "%s" está em dois campos.', v_valor #>> '{}');
      end if;
      v_titulos := v_titulos || lower(btrim(v_valor #>> '{}'));
    end loop;
    if not (p_retorno -> 'colunas' ? 'ade') or not (p_retorno -> 'colunas' ? 'valor') then
      return 'Layout do retorno: as colunas do ADE e do valor são obrigatórias.';
    end if;
    if p_retorno ? 'linha_cabecalho' and (jsonb_typeof(p_retorno -> 'linha_cabecalho') <> 'number'
        or (p_retorno ->> 'linha_cabecalho')::numeric not between 1 and 50) then
      return 'Layout do retorno: a linha do cabeçalho deve ser um número entre 1 e 50.';
    end if;
  end if;
  if p_remessa is not null then
    if jsonb_typeof(p_remessa) <> 'object' or jsonb_typeof(p_remessa -> 'colunas') is distinct from 'array'
       or jsonb_array_length(p_remessa -> 'colunas') = 0 then
      return 'Layout da remessa inválido: faltam as colunas.';
    end if;
    for v_item in select * from jsonb_array_elements(p_remessa -> 'colunas') loop
      if coalesce(v_item ->> 'campo', '') not in ('ade', 'cpf', 'matricula', 'nome', 'valor', 'competencia', 'parcela_numero',
                                                  'parcela_total', 'contrato_numero', 'servico') then
        return format('Layout da remessa: campo desconhecido "%s".', coalesce(v_item ->> 'campo', ''));
      end if;
      if btrim(coalesce(v_item ->> 'titulo', '')) = '' then
        return 'Layout da remessa: toda coluna precisa de um título.';
      end if;
    end loop;
  end if;
  return null;
end $$;

create function public.trg_convenios_layout() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_erro text := public._layout_erro(new.layout_retorno, new.layout_remessa);
begin
  if v_erro is not null then
    raise exception '%', v_erro;
  end if;
  return new;
end $$;
create trigger trg_convenios_layout before insert or update of layout_retorno, layout_remessa on public.convenios
  for each row execute function public.trg_convenios_layout();

-- ── RLS, permissões de tabela e auditoria ─────────────────────
alter table public.retornos enable row level security;
alter table public.retorno_linhas enable row level security;
alter table public.mensalidade_pagamentos enable row level security;
alter table public.diferenca_baixas enable row level security;
create policy retornos_ler on public.retornos for select to authenticated using (public.app_equipe_pode('retorno.ver'));
create policy retorno_linhas_ler on public.retorno_linhas for select to authenticated using (public.app_equipe_pode('retorno.ver'));
create policy mensalidade_pagamentos_ler on public.mensalidade_pagamentos for select to authenticated
  using (public.app_equipe_pode('contratos.ver'));
create policy diferenca_baixas_ler on public.diferenca_baixas for select to authenticated using (public.app_equipe_pode('retorno.ver'));
revoke all on public.retornos, public.retorno_linhas, public.mensalidade_pagamentos, public.diferenca_baixas from anon;
revoke insert, update, delete, truncate on public.retornos, public.retorno_linhas, public.mensalidade_pagamentos,
  public.diferenca_baixas from authenticated;
create trigger trg_auditoria after insert or update or delete on public.retornos
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.diferenca_baixas
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.mensalidade_pagamentos
  for each row execute function public.auditar();
