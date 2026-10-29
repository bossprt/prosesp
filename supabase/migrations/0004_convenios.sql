-- 0004 — Convênios configuráveis
-- Cada convênio é configuração no banco: entrar um convênio novo é cadastro, não código.

-- Catálogo dos itens que um convênio pode exigir no cadastro do cliente.
-- Reusado por o_que_falta() (0009).
create function public.catalogo_campos_cliente() returns table (chave text, rotulo text)
language sql immutable set search_path = '' as $$
  values
    ('rg', 'RG'),
    ('rg_orgao', 'Órgão emissor do RG'),
    ('data_nascimento', 'Data de nascimento'),
    ('nome_mae', 'Nome da mãe'),
    ('nome_pai', 'Nome do pai'),
    ('estado_civil', 'Estado civil'),
    ('escolaridade', 'Escolaridade'),
    ('pis', 'PIS'),
    ('endereco', 'Endereço completo'),
    ('pep', 'Pessoa exposta politicamente'),
    ('analfabeto', 'Analfabeto (sim/não)'),
    ('conjuge', 'Dados do cônjuge'),
    ('email', 'E-mail'),
    ('conta_principal', 'Conta bancária principal'),
    ('beneficiario', 'Beneficiário'),
    ('doc_rg', 'Documento: RG'),
    ('doc_comprovante_residencia', 'Documento: comprovante de residência')
$$;

create table public.convenios (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (btrim(nome) <> ''),
  uf char(2),
  ente text,
  ativo boolean not null default true,
  averbadora text,
  ade_regex text,
  ade_descricao text,
  ade_modo text not null default 'seguro' check (ade_modo in ('seguro', 'rapido')),
  dia_vencimento smallint constraint convenios_dia_vencimento_check check (dia_vencimento between 1 and 28),
  dia_corte smallint check (dia_corte between 1 and 28),
  dias_prejuizo integer not null default 90 check (dias_prejuizo > 0),
  prazo_min integer check (prazo_min > 0),
  prazo_max integer check (prazo_max >= prazo_min),
  margem_percentual numeric(7,4) check (margem_percentual between 0 and 100),
  campos_obrigatorios text[] not null default '{}',
  layout_retorno jsonb,
  layout_remessa jsonb,
  modelo_contrato text,
  criado_em timestamptz not null default now()
);

create function public.trg_convenios_validar() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_campo text;
begin
  if new.ade_regex is not null then
    begin
      perform '' ~ new.ade_regex;
    exception when others then
      raise exception 'Formato de ADE inválido.';
    end;
  end if;
  foreach v_campo in array new.campos_obrigatorios loop
    if not exists (select 1 from public.catalogo_campos_cliente() k where k.chave = v_campo) then
      raise exception 'Campo obrigatório desconhecido: %', v_campo;
    end if;
  end loop;
  return new;
end $$;

create trigger trg_convenios_validar before insert or update on public.convenios
  for each row execute function public.trg_convenios_validar();

create table public.convenio_vinculos (
  id uuid primary key default gen_random_uuid(),
  convenio_id uuid not null references public.convenios (id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  ativo boolean not null default true,
  unique (convenio_id, nome)
);

-- Sementes: convênios ativos hoje. Demais configurações: pendentes da PROSESP.
with c as (
  insert into public.convenios (nome, uf, ente) values
    ('Governo do Acre', 'AC', 'Estado'),
    ('Prefeitura de Rio Branco', 'AC', 'Município')
  returning id, nome
)
insert into public.convenio_vinculos (convenio_id, nome)
select id, v from c, unnest(case when nome = 'Governo do Acre'
                                 then array['Efetivo', 'Temporário'] else array['Efetivo'] end) v;

alter table public.convenios enable row level security;
alter table public.convenio_vinculos enable row level security;

create policy convenios_ler on public.convenios for select to authenticated
  using (public.app_pode('convenios.ver') or public.app_pode('simulador.usar'));
create policy convenios_escrever on public.convenios for all to authenticated
  using (public.app_pode('convenios.editar')) with check (public.app_pode('convenios.editar'));

create policy convenio_vinculos_ler on public.convenio_vinculos for select to authenticated
  using (public.app_pode('convenios.ver') or public.app_pode('simulador.usar'));
create policy convenio_vinculos_escrever on public.convenio_vinculos for all to authenticated
  using (public.app_pode('convenios.editar')) with check (public.app_pode('convenios.editar'));

revoke all on public.convenios, public.convenio_vinculos from anon;

create trigger trg_auditoria after insert or update or delete on public.convenios
  for each row execute function public.auditar();
create trigger trg_auditoria after insert or update or delete on public.convenio_vinculos
  for each row execute function public.auditar();
