import { FunctionsHttpError } from '@supabase/supabase-js';
import { Aviso, Botao, Pagina, Tabela } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { supabase } from '../../lib/supabase';
import { useSessao } from '../auth/sessao';
import { ConviteForm, type DadosConvite } from './ConviteForm';

async function convidar(d: DadosConvite) {
  const { error } = await supabase.functions.invoke('criar-usuario', { body: d });
  if (error) {
    const corpo = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(corpo?.erro ?? 'Não foi possível enviar o convite.');
  }
}

export function UsuariosPage() {
  const { acesso } = useSessao();
  const usuarios = useConsulta(['usuarios'], () =>
    exigir(supabase.from('usuarios').select('id, nome, email, perfil, ativo, parceiros(nome)').order('nome')),
  );
  const parceiros = useConsulta(['parceiros-lista'], () =>
    exigir(supabase.from('parceiros').select('id, nome').eq('ativo', true).order('nome')),
  );
  const desativar = useAcao((id: string) => exigir(supabase.rpc('desativar_usuario', { p_id: id })), [['usuarios']]);
  const recarregar = () => usuarios.refetch();

  return (
    <Pagina titulo="Usuários">
      <ConviteForm
        parceiros={parceiros.data ?? []}
        onConvidar={async (d) => {
          await convidar(d);
          await recarregar();
        }}
      />
      <Aviso>{desativar.erro}</Aviso>
      <Tabela colunas={['Nome', 'E-mail', 'Perfil', 'Situação', '']}>
        {(usuarios.data ?? []).map((u) => (
          <tr key={u.id}>
            <td className="px-3 py-2">{u.nome}</td>
            <td className="px-3 py-2">{u.email}</td>
            <td className="px-3 py-2">
              {u.perfil}
              {(u.parceiros as { nome?: string } | null)?.nome ? ` (${(u.parceiros as { nome: string }).nome})` : ''}
            </td>
            <td className="px-3 py-2">{u.ativo ? 'Ativo' : 'Desativado'}</td>
            <td className="px-3 py-2 text-right">
              {u.ativo && u.id !== acesso?.id && (
                <Botao variante="perigo" onClick={() => desativar.mutate(u.id)}>
                  Desativar
                </Botao>
              )}
            </td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
