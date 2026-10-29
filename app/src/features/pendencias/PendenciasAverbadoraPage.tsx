import { Link } from 'react-router-dom';
import { Aviso, Botao, Pagina, Tabela } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { supabase } from '../../lib/supabase';

export function PendenciasAverbadoraPage() {
  const lista = useConsulta(['pendencias-averbadora'], async () =>
    (await exigir(
      supabase
        .from('pendencias_averbadora')
        .select('id, tipo, motivo, criado_em, contrato_id, contratos(numero), contrato_averbacoes(ade), mensalidade_averbacoes(ade)')
        .is('resolvida_em', null)
        .order('criado_em'),
    )) ?? [],
  );
  const resolver = useAcao((id: string) => exigir(supabase.rpc('resolver_pendencia', { p_id: id })), [['pendencias-averbadora']]);
  return (
    <Pagina titulo="Pendências na averbadora">
      <Aviso>{resolver.erro}</Aviso>
      {lista.data?.length === 0 && <Aviso tipo="ok">Nenhuma pendência.</Aviso>}
      <Tabela colunas={['Desde', 'O que fazer', 'Contrato', 'ADE', 'Motivo', '']}>
        {(lista.data ?? []).map((p) => (
          <tr key={p.id}>
            <td className="whitespace-nowrap px-3 py-1.5">{new Date(p.criado_em).toLocaleDateString('pt-BR')}</td>
            <td className="px-3 py-1.5 font-medium">{p.tipo === 'cancelar' ? 'Cancelar na averbadora' : 'Ajustar na averbadora'}</td>
            <td className="px-3 py-1.5">
              {p.contrato_id ? <Link to={`/contratos/${p.contrato_id}`} className="text-sky-800 hover:underline">nº {p.contratos?.numero}</Link> : 'Mensalidade'}
            </td>
            <td className="px-3 py-1.5">{p.contrato_averbacoes?.ade ?? p.mensalidade_averbacoes?.ade ?? '—'}</td>
            <td className="px-3 py-1.5">{p.motivo}</td>
            <td className="px-3 py-1.5 text-right">
              <Botao onClick={() => confirm('Confirmar que já foi feito na averbadora?') && resolver.mutate(p.id)}>Feito</Botao>
            </td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
