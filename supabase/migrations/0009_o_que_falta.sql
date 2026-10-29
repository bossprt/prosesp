-- 0009 — Documentos do cliente e "o que falta" por convênio

create table public.cliente_documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  tipo text not null check (tipo in ('rg', 'comprovante_residencia', 'outro')),
  caminho text not null unique,  -- caminho no Storage: <cliente_id>/<arquivo>
  nome_arquivo text,
  enviado_por uuid default auth.uid(),
  enviado_em timestamptz not null default now(),
  check (split_part(caminho, '/', 1) = cliente_id::text)
);
create index cliente_documentos_cliente_idx on public.cliente_documentos (cliente_id);

alter table public.cliente_documentos enable row level security;
create policy cliente_documentos_equipe_ler on public.cliente_documentos for select to authenticated
  using (public.app_equipe_pode('clientes.ver'));
create policy cliente_documentos_equipe_escrever on public.cliente_documentos for all to authenticated
  using (public.app_equipe_pode('clientes.editar')) with check (public.app_equipe_pode('clientes.editar'));
create policy cliente_documentos_parceiro_ler on public.cliente_documentos for select to authenticated
  using (public.app_pode('clientes.ver') and public.parceiro_ve_cliente(cliente_id));
revoke all on public.cliente_documentos from anon;

create trigger trg_auditoria after insert or update or delete on public.cliente_documentos
  for each row execute function public.auditar();

-- Respeita a RLS de quem chama (security invoker): só responde sobre clientes visíveis.
create function public.o_que_falta(p_cliente_id uuid, p_convenio_id uuid)
returns table (chave text, rotulo text)
language plpgsql stable security invoker set search_path = '' as $$
declare
  c public.clientes;
  v_campos text[];
  v_campo text;
  v_falta boolean;
begin
  select * into c from public.clientes x where x.id = p_cliente_id;
  if c.id is null then
    raise exception 'Cliente não encontrado.';
  end if;
  select cv.campos_obrigatorios into v_campos from public.convenios cv where cv.id = p_convenio_id;
  if v_campos is null then
    raise exception 'Convênio não encontrado.';
  end if;

  if not exists (select 1 from public.cliente_matriculas m
                 where m.cliente_id = c.id and m.convenio_id = p_convenio_id and m.ativa) then
    chave := 'matricula'; rotulo := 'Matrícula neste convênio';
    return next;
  end if;

  foreach v_campo in array v_campos loop
    v_falta := case v_campo
      when 'rg' then btrim(coalesce(c.rg, '')) = ''
      when 'rg_orgao' then btrim(coalesce(c.rg_orgao, '')) = ''
      when 'data_nascimento' then c.data_nascimento is null
      when 'nome_mae' then btrim(coalesce(c.nome_mae, '')) = ''
      when 'nome_pai' then btrim(coalesce(c.nome_pai, '')) = ''
      when 'estado_civil' then c.estado_civil is null
      when 'escolaridade' then btrim(coalesce(c.escolaridade, '')) = ''
      when 'pis' then btrim(coalesce(c.pis, '')) = ''
      when 'endereco' then '' in (btrim(coalesce(c.cep, '')), btrim(coalesce(c.logradouro, '')),
                                   btrim(coalesce(c.numero, '')), btrim(coalesce(c.bairro, '')),
                                   btrim(coalesce(c.cidade, '')), btrim(coalesce(c.uf, '')))
      when 'pep' then c.pep is null
      when 'analfabeto' then c.analfabeto is null
      when 'conjuge' then c.estado_civil in ('casado', 'uniao_estavel')
                          and (btrim(coalesce(c.conjuge_nome, '')) = '' or c.conjuge_cpf is null)
      when 'email' then btrim(coalesce(c.email, '')) = ''
      when 'conta_principal' then not exists (select 1 from public.cliente_contas x
                                              where x.cliente_id = c.id and x.principal)
      when 'beneficiario' then not exists (select 1 from public.cliente_beneficiarios x where x.cliente_id = c.id)
      when 'doc_rg' then not exists (select 1 from public.cliente_documentos x
                                     where x.cliente_id = c.id and x.tipo = 'rg')
      when 'doc_comprovante_residencia' then not exists (select 1 from public.cliente_documentos x
                                     where x.cliente_id = c.id and x.tipo = 'comprovante_residencia')
      else false
    end;
    if v_falta then
      chave := v_campo;
      select k.rotulo into rotulo from public.catalogo_campos_cliente() k where k.chave = v_campo;
      return next;
    end if;
  end loop;
end $$;

revoke execute on function public.o_que_falta(uuid, uuid) from public, anon;
grant execute on function public.o_que_falta(uuid, uuid) to authenticated;
