-- 0029 — Assinatura: modelos de contrato com versões, configuração por convênio, envios e bucket

-- ── Configuração da assinatura no convênio ─────────────────────
alter table public.convenios
  drop column modelo_contrato,
  add column assinatura_prazo_dias integer not null default 7 check (assinatura_prazo_dias between 1 and 90),
  add column assinatura_selfie boolean not null default true,
  add column assinatura_documento boolean not null default true,
  add column assinatura_codigo boolean not null default true,
  add column assinatura_email boolean not null default true,
  add column assinatura_whatsapp boolean not null default true;

insert into public.configuracoes (chave, valor, descricao) values
  ('ambiente_producao', 'false', 'Este banco é o de produção (bloqueia modelo de contrato de teste)');

-- Assinantes fixos além do cliente (representante, testemunhas).
create table public.convenio_assinantes (
  id uuid primary key default gen_random_uuid(),
  convenio_id uuid not null references public.convenios (id),
  nome text not null check (btrim(nome) <> ''),
  email text,
  celular text,
  papel text not null check (btrim(papel) <> ''),
  ordem integer not null default 1,
  ativo boolean not null default true,
  check (email is not null or celular is not null)
);
create index convenio_assinantes_convenio_idx on public.convenio_assinantes (convenio_id);
alter table public.convenio_assinantes enable row level security;
create policy convenio_assinantes_ler on public.convenio_assinantes for select to authenticated
  using (public.app_pode('convenios.ver'));
create policy convenio_assinantes_escrever on public.convenio_assinantes for all to authenticated
  using (public.app_pode('convenios.editar')) with check (public.app_pode('convenios.editar'));
revoke all on public.convenio_assinantes from anon;
create trigger trg_auditoria after insert or update or delete on public.convenio_assinantes
  for each row execute function public.auditar();

-- ── Modelos de contrato (salvar = nova versão) ─────────────────
create table public.contrato_modelos (
  id uuid primary key default gen_random_uuid(),
  convenio_id uuid not null references public.convenios (id),
  versao integer not null check (versao > 0),
  texto text not null check (btrim(texto) <> ''),
  teste boolean not null default false,
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (convenio_id, versao)
);
create unique index contrato_modelos_um_ativo on public.contrato_modelos (convenio_id) where ativo;
alter table public.contrato_modelos enable row level security;
create policy contrato_modelos_ler on public.contrato_modelos for select to authenticated
  using (public.app_pode('convenios.ver'));
revoke all on public.contrato_modelos from anon, authenticated;
grant select on public.contrato_modelos to authenticated;
create trigger trg_auditoria after insert or update or delete on public.contrato_modelos
  for each row execute function public.auditar();

-- Lista única de campos, blocos e condições que o modelo pode usar.
create function public.modelo_campos() returns table (chave text, rotulo text, exemplo text)
language sql immutable set search_path = '' as $$
  values
    ('cliente.nome', 'Nome do cliente', 'Maria da Silva'),
    ('cliente.cpf', 'CPF do cliente', '123.456.789-09'),
    ('cliente.rg', 'RG (com órgão)', '123456 SSP/AC'),
    ('cliente.data_nascimento', 'Data de nascimento', '10/05/1980'),
    ('cliente.estado_civil', 'Estado civil', 'casado(a)'),
    ('cliente.nome_mae', 'Nome da mãe', 'Ana da Silva'),
    ('cliente.endereco', 'Endereço', 'Rua das Flores, 100, Centro'),
    ('cliente.cidade_uf', 'Cidade/UF', 'Rio Branco/AC'),
    ('cliente.cep', 'CEP', '69900-000'),
    ('cliente.celular', 'Celular', '(68) 99999-0000'),
    ('cliente.email', 'E-mail', 'maria@exemplo.com'),
    ('matricula.numero', 'Matrícula', '123456'),
    ('matricula.orgao', 'Órgão', 'Secretaria de Educação'),
    ('matricula.vinculo', 'Vínculo', 'Efetivo'),
    ('convenio.nome', 'Convênio', 'Governo do Acre'),
    ('contrato.numero', 'Número do contrato', '1024'),
    ('contrato.tipo', 'Tipo do contrato', 'Novo'),
    ('contrato.prazo', 'Prazo (parcelas)', '24'),
    ('contrato.valor_parcela', 'Valor da parcela', 'R$ 122,40'),
    ('contrato.valor_bruto', 'Valor bruto', 'R$ 2.000,00'),
    ('contrato.descontos', 'Total de descontos', 'R$ 0,00'),
    ('contrato.quitacoes', 'Total de quitações', 'R$ 0,00'),
    ('contrato.dividas', 'Total de dívidas compradas', 'R$ 0,00'),
    ('contrato.valor_liquido', 'Valor líquido', 'R$ 2.000,00'),
    ('contrato.quitados', 'Contratos quitados (números)', '1001, 1002'),
    ('contrato.primeira_competencia', 'Primeira competência (prevista)', '06/2024'),
    ('contrato.primeiro_vencimento', 'Primeiro vencimento (previsto)', '28/06/2024'),
    ('contrato.ultimo_vencimento', 'Último vencimento (previsto)', '28/05/2026'),
    ('contrato.ade', 'ADE do contrato', '700123'),
    ('mensalidade.valor', 'Valor da mensalidade', 'R$ 35,00'),
    ('mensalidade.ade', 'ADE da mensalidade', '700124'),
    ('conta.banco', 'Banco da conta de crédito', 'Banco do Brasil'),
    ('conta.agencia', 'Agência', '1234'),
    ('conta.conta', 'Conta', '56789-0'),
    ('conta.tipo', 'Tipo de conta', 'Corrente'),
    ('conta.pix', 'Chave PIX', '123.456.789-09'),
    ('documento.data', 'Data do documento', '29/10/2026'),
    ('documento.data_extenso', 'Data por extenso', '29 de outubro de 2026'),
    ('parcelas.tabela', 'Tabela de parcelas (sozinha na linha)', '(tabela)'),
    ('se mensalidade', 'Início do trecho só com mensalidade (fecha com {fim})', ''),
    ('se quitacoes', 'Início do trecho só com quitações (fecha com {fim})', ''),
    ('se dividas', 'Início do trecho só com dívidas compradas (fecha com {fim})', '')
$$;
revoke execute on function public.modelo_campos() from public, anon;
grant execute on function public.modelo_campos() to authenticated;

-- Confere os marcadores {…} do texto; dá erro em português no primeiro problema.
create function public._modelo_validar(p_texto text) returns void
language plpgsql stable set search_path = '' as $$
declare
  m text;
  v_aberto text;
begin
  if btrim(coalesce(p_texto, '')) = '' then
    raise exception 'Escreva o texto do contrato.';
  end if;
  for m in select (regexp_matches(p_texto, '\{([^{}]*)\}', 'g'))[1] loop
    m := btrim(m);
    if m = 'fim' then
      if v_aberto is null then
        raise exception '{fim} sem bloco aberto.';
      end if;
      v_aberto := null;
    elsif m like 'se %' then
      if not exists (select 1 from public.modelo_campos() f where f.chave = m) then
        raise exception 'Condição desconhecida: {%}.', m;
      end if;
      if v_aberto is not null then
        raise exception 'Bloco "{%}" sem {fim}.', v_aberto;
      end if;
      v_aberto := m;
    elsif not exists (select 1 from public.modelo_campos() f where f.chave = m and f.chave not like 'se %') then
      raise exception 'Campo desconhecido: {%}.', m;
    end if;
  end loop;
  if v_aberto is not null then
    raise exception 'Bloco "{%}" sem {fim}.', v_aberto;
  end if;
end $$;
revoke execute on function public._modelo_validar(text) from public, anon, authenticated;

create function public.salvar_modelo_contrato(p_convenio_id uuid, p_texto text, p_teste boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_versao integer;
begin
  perform public.app_exigir('convenios.editar');
  if not exists (select 1 from public.convenios where id = p_convenio_id) then
    raise exception 'Convênio não encontrado.';
  end if;
  perform public._modelo_validar(p_texto);
  perform 1 from public.convenios where id = p_convenio_id for update;
  select coalesce(max(versao), 0) + 1 into v_versao from public.contrato_modelos where convenio_id = p_convenio_id;
  update public.contrato_modelos set ativo = false where convenio_id = p_convenio_id and ativo;
  insert into public.contrato_modelos (convenio_id, versao, texto, teste)
  values (p_convenio_id, v_versao, p_texto, coalesce(p_teste, false));
  return v_versao;
end $$;
revoke execute on function public.salvar_modelo_contrato(uuid, text, boolean) from public, anon;
grant execute on function public.salvar_modelo_contrato(uuid, text, boolean) to authenticated;

-- ── Envios para assinatura ─────────────────────────────────────
create table public.contrato_assinaturas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos (id),
  modelo_id uuid references public.contrato_modelos (id),
  situacao text not null check (situacao in ('preparando', 'enviado', 'assinado', 'aprovado', 'falhou',
                                             'recusado_cliente', 'vencido', 'cancelamento_pendente', 'cancelado')),
  valores jsonb not null,
  pdf_caminho text,
  pdf_assinado_caminho text,
  zapsign_token text unique,
  assinantes jsonb,
  prazo date,
  erro text,
  enviado_por uuid default auth.uid(),
  enviado_em timestamptz,
  assinado_em timestamptz,
  conferido_por uuid,
  conferido_em timestamptz,
  cancelado_em timestamptz,
  criado_em timestamptz not null default now()
);
create unique index contrato_assinaturas_uma_aberta on public.contrato_assinaturas (contrato_id)
  where situacao in ('preparando', 'enviado', 'assinado');
create index contrato_assinaturas_contrato_idx on public.contrato_assinaturas (contrato_id);
create index contrato_assinaturas_modelo_idx on public.contrato_assinaturas (modelo_id);
create index contrato_assinaturas_situacao_idx on public.contrato_assinaturas (situacao);
alter table public.contrato_assinaturas enable row level security;
create policy contrato_assinaturas_ler on public.contrato_assinaturas for select to authenticated
  using (public.contrato_visivel(contrato_id));
revoke all on public.contrato_assinaturas from anon, authenticated;
grant select on public.contrato_assinaturas to authenticated;
create trigger trg_auditoria after insert or update or delete on public.contrato_assinaturas
  for each row execute function public.auditar();

-- Selfie, documento, IP etc. registrados pela ZapSign: só a equipe vê (parceiro não).
create table public.contrato_assinatura_evidencias (
  assinatura_id uuid primary key references public.contrato_assinaturas (id),
  dados jsonb not null,
  criado_em timestamptz not null default now()
);
alter table public.contrato_assinatura_evidencias enable row level security;
create policy contrato_assinatura_evidencias_ler on public.contrato_assinatura_evidencias for select to authenticated
  using (public.app_equipe_pode('contratos.ver'));
revoke all on public.contrato_assinatura_evidencias from anon, authenticated;
grant select on public.contrato_assinatura_evidencias to authenticated;
create trigger trg_auditoria after insert or update or delete on public.contrato_assinatura_evidencias
  for each row execute function public.auditar();

-- ── Bucket privado: <contrato_id>/<assinatura_id>/{enviado.pdf|assinado.pdf|evidencias/…} ──
insert into storage.buckets (id, name, public) values ('contratos-assinatura', 'contratos-assinatura', false)
on conflict (id) do update set public = false;

create policy assinatura_equipe_ler on storage.objects for select to authenticated
  using (bucket_id = 'contratos-assinatura' and public.app_equipe_pode('contratos.ver'));
create policy assinatura_parceiro_ler on storage.objects for select to authenticated
  using (
    bucket_id = 'contratos-assinatura'
    and name ~ '^[^/]+/[^/]+/[^/]+\.pdf$'
    and public.app_pode('contratos.ver')
    and public.contrato_visivel(public.cliente_do_caminho(name))
  );
