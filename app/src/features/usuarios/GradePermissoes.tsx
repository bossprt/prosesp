import type { Perfil } from '../../lib/permissoes';

export const PERFIS: Perfil[] = ['administrador', 'gerente', 'financeiro', 'operador', 'consulta', 'parceiro'];

// Mesmo teto do banco (trigger trg_teto_parceiro): o parceiro nunca recebe outras.
export const TETO_PARCEIRO = new Set(['simulador.usar', 'convenios.ver', 'clientes.ver', 'clientes.editar']);

interface Props {
  permissoes: { chave: string; descricao: string }[];
  /** "perfil:permissao" */
  marcadas: Set<string>;
  onAlternar: (perfil: Perfil, permissao: string, marcar: boolean) => void;
  desabilitado?: boolean;
}

export function GradePermissoes({ permissoes, marcadas, onAlternar, desabilitado }: Props) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Permissão</th>
            {PERFIS.map((p) => (
              <th key={p} className="px-2 py-2 font-medium capitalize">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {permissoes.map((perm) => (
            <tr key={perm.chave}>
              <td className="px-3 py-2">{perm.descricao}</td>
              {PERFIS.map((perfil) => {
                const chave = `${perfil}:${perm.chave}`;
                const foraDoTeto = perfil === 'parceiro' && !TETO_PARCEIRO.has(perm.chave);
                return (
                  <td key={perfil} className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${perfil} — ${perm.descricao}`}
                      checked={marcadas.has(chave)}
                      disabled={desabilitado || foraDoTeto}
                      title={foraDoTeto ? 'Esta permissão não pode ser dada ao perfil parceiro.' : undefined}
                      onChange={(e) => onAlternar(perfil, perm.chave, e.target.checked)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
