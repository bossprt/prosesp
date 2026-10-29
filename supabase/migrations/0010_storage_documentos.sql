-- 0010 — Documentos no Storage (bucket privado) e desativação de usuários

insert into storage.buckets (id, name, public) values ('documentos-clientes', 'documentos-clientes', false)
on conflict (id) do update set public = false;

-- Cliente dono do arquivo: primeira pasta do caminho (<cliente_id>/arquivo). Null se não for uuid.
create function public.cliente_do_caminho(p_nome text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_nome, '/', 1)::uuid;
exception when others then
  return null;
end $$;

create policy documentos_equipe_ler on storage.objects for select to authenticated
  using (bucket_id = 'documentos-clientes' and public.app_equipe_pode('clientes.ver'));

create policy documentos_equipe_enviar on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos-clientes'
    and public.app_equipe_pode('clientes.editar')
    and exists (select 1 from public.clientes c where c.id = public.cliente_do_caminho(name))
  );

create policy documentos_equipe_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'documentos-clientes' and public.app_equipe_pode('clientes.editar'));

create policy documentos_parceiro_ler on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos-clientes'
    and public.app_pode('clientes.ver')
    and public.parceiro_ve_cliente(public.cliente_do_caminho(name))
  );

-- ── Desativar usuário (nunca apagar) ──────────────────────────
create function public.desativar_usuario(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.app_exigir('usuarios.gerenciar');
  if p_id = auth.uid() then
    raise exception 'Você não pode desativar o seu próprio acesso.';
  end if;
  update public.usuarios set ativo = false where id = p_id;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;
end $$;

revoke execute on function public.desativar_usuario(uuid) from public, anon;
grant execute on function public.desativar_usuario(uuid) to authenticated;
