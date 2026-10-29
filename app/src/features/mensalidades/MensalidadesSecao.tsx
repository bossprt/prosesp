import { Aviso, Tabela } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { formatarReais } from '../../lib/mascaras';
import { supabase } from '../../lib/supabase';
import { useSessao } from '../auth/sessao';
import { CancelarMensalidade } from './CancelarMensalidade';

const TIPO: Record<string, string> = { nova: 'Nova', reajuste: 'Reajuste', migracao: 'Migração' };
const mesAno = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Mensalidades (uma por matrícula) do cliente, com histórico mês a mês. Só equipe. */
export function MensalidadesSecao({ clienteId }: { clienteId: string }) {
  const { pode } = useSessao();
  const dados = useConsulta(['mensalidades', clienteId], async () => {
    const ms = (await exigir(
      supabase
        .from('mensalidades')
        .select('id, situacao, cancelada_em, motivo_cancelamento, cliente_matriculas!inner(cliente_id, matricula, convenios(nome)), mensalidade_valores(valor, vigente_desde, tipo), mensalidade_parcelas(competencia, valor, status)')
        .eq('cliente_matriculas.cliente_id', clienteId),
    )) ?? [];
    const reqs = (await exigir(
      supabase.from('cliente_documentos').select('id, nome_arquivo, enviado_em').eq('cliente_id', clienteId).eq('tipo', 'requerimento_cancelamento'),
    )) ?? [];
    return { ms, reqs };
  });
  const cancelar = useAcao(
    ({ id, doc, motivo }: { id: string; doc: string; motivo: string }) =>
      exigir(supabase.rpc('cancelar_mensalidade', { p_mensalidade_id: id, p_documento_id: doc, p_motivo: motivo })),
    [['mensalidades', clienteId]],
  );

  if (!dados.data || dados.data.ms.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="font-medium">Mensalidades</h3>
      <Aviso>{cancelar.erro}</Aviso>
      {dados.data.ms.map((m) => {
        const valores = [...m.mensalidade_valores].sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde));
        const atual = valores[valores.length - 1];
        return (
          <div key={m.id} className="space-y-2 rounded border border-slate-200 bg-white p-3 text-sm">
            <p>
              <strong>{m.cliente_matriculas.convenios?.nome}</strong> · matrícula {m.cliente_matriculas.matricula} ·{' '}
              {m.situacao === 'ativa' ? `ativa, ${atual ? formatarReais(atual.valor) : '—'} por mês` : `cancelada (${m.motivo_cancelamento ?? ''})`}
            </p>
            <p className="text-slate-600">
              Valores: {valores.map((v) => `${TIPO[v.tipo]} ${formatarReais(v.valor)} desde ${mesAno(v.vigente_desde)}`).join(' → ')}
            </p>
            <Tabela colunas={['Competência', 'Valor', 'Situação']}>
              {[...m.mensalidade_parcelas]
                .sort((a, b) => b.competencia.localeCompare(a.competencia))
                .slice(0, 12)
                .map((p) => (
                  <tr key={p.competencia}>
                    <td className="px-3 py-1">{mesAno(p.competencia)}</td>
                    <td className="px-3 py-1">{formatarReais(p.valor)}</td>
                    <td className="px-3 py-1">{p.status}</td>
                  </tr>
                ))}
            </Tabela>
            {m.situacao === 'ativa' && pode('mensalidades.cancelar') && (
              <CancelarMensalidade
                requerimentos={dados.data.reqs.map((r) => ({ id: r.id, nome: `${r.nome_arquivo ?? 'requerimento'} (${new Date(r.enviado_em).toLocaleDateString('pt-BR')})` }))}
                onCancelar={async (doc, motivo) => {
                  if (confirm('Cancelar esta mensalidade?')) await cancelar.mutateAsync({ id: m.id, doc, motivo });
                }}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}
