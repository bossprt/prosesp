-- 0012 — Cadastro rápido pela equipe: cliente + matrícula numa única operação (tudo ou nada).

create function public.cadastrar_cliente(p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.app_equipe_pode('clientes.editar') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  insert into public.clientes (cpf, nome, celular, whatsapp, email, data_nascimento)
  values (p_dados->>'cpf', p_dados->>'nome', p_dados->>'celular', p_dados->>'whatsapp',
          nullif(p_dados->>'email', ''), (nullif(p_dados->>'data_nascimento', ''))::date)
  returning id into v_id;
  begin
    insert into public.cliente_matriculas (cliente_id, convenio_id, vinculo_id, matricula, orgao)
    values (v_id, (p_dados->>'convenio_id')::uuid, (p_dados->>'vinculo_id')::uuid,
            p_dados->>'matricula', nullif(p_dados->>'orgao', ''));
  exception when unique_violation then
    raise exception 'Esta matrícula já está cadastrada neste convênio.';
  end;
  return v_id;
end $$;

revoke execute on function public.cadastrar_cliente(jsonb) from public, anon;
grant execute on function public.cadastrar_cliente(jsonb) to authenticated;
