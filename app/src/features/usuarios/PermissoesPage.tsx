import { Aviso, Pagina } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import type { Perfil } from '../../lib/permissoes';
import { supabase } from '../../lib/supabase';
import { GradePermissoes } from './GradePermissoes';

export function PermissoesPage() {
  const permissoes = useConsulta(['permissoes'], () =>
    exigir(supabase.from('permissoes').select('chave, descricao').order('chave')),
  );
  const matriz = useConsulta(['perfil_permissoes'], () =>
    exigir(supabase.from('perfil_permissoes').select('perfil, permissao')),
  );
  const alternar = useAcao(
    async ({ perfil, permissao, marcar }: { perfil: Perfil; permissao: string; marcar: boolean }) => {
      if (marcar) await exigir(supabase.from('perfil_permissoes').insert({ perfil, permissao }));
      else await exigir(supabase.from('perfil_permissoes').delete().match({ perfil, permissao }));
    },
    [['perfil_permissoes'], ['acesso']],
  );

  const marcadas = new Set((matriz.data ?? []).map((m) => `${m.perfil}:${m.permissao}`));
  return (
    <Pagina titulo="Permissões por perfil">
      <Aviso tipo="info">
        O que cada perfil pode fazer. O parceiro sempre enxerga só os próprios clientes, mesmo que alguma caixa seja marcada.
      </Aviso>
      <Aviso>{alternar.erro}</Aviso>
      <GradePermissoes
        permissoes={permissoes.data ?? []}
        marcadas={marcadas}
        desabilitado={alternar.isPending}
        onAlternar={(perfil, permissao, marcar) => alternar.mutate({ perfil, permissao, marcar })}
      />
    </Pagina>
  );
}
