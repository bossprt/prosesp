import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Aviso, Botao, Pagina, Tabela } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { formatarCpf } from '../../lib/mascaras';
import { supabase } from '../../lib/supabase';
import { chamarAssinatura } from './useAssinaturas';

export type Aba = 'conferir' | 'vencidas' | 'recusadas' | 'cancelar';

export interface ItemLista {
  assinatura_id: string;
  contrato_id: string;
  contrato_numero: number;
  cliente: string;
  cpf: string;
  convenio: string;
  situacao: string;
  prazo: string | null;
  erro: string | null;
}

const ABAS: { aba: Aba; rotulo: string }[] = [
  { aba: 'conferir', rotulo: 'Para conferir' },
  { aba: 'vencidas', rotulo: 'Vencidas' },
  { aba: 'recusadas', rotulo: 'Recusadas pelo cliente' },
  { aba: 'cancelar', rotulo: 'Cancelar na ZapSign' },
];

export function ListasAssinaturas({ aba, onAba, itens, onTentarDeNovo }: {
  aba: Aba;
  onAba: (a: Aba) => void;
  itens: ItemLista[];
  onTentarDeNovo: () => void;
}) {
  return (
    <div className="space-y-3">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
        {ABAS.map((a) => (
          <button
            key={a.aba}
            role="tab"
            type="button"
            aria-selected={a.aba === aba}
            onClick={() => onAba(a.aba)}
            className={`rounded-t px-3 py-1.5 text-sm ${a.aba === aba ? 'border border-b-white border-slate-200 bg-white font-medium' : 'text-slate-600'}`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      {aba === 'cancelar' && itens.length > 0 && <Botao onClick={onTentarDeNovo}>Tentar de novo</Botao>}
      {itens.length === 0 ? (
        <p className="text-sm text-slate-500">Nada nesta lista.</p>
      ) : (
        <Tabela colunas={['Contrato', 'Cliente', 'CPF', 'Convênio', aba === 'cancelar' ? 'Último erro' : 'Prazo']}>
          {itens.map((i) => (
            <tr key={i.assinatura_id}>
              <td className="px-3 py-1.5">
                <Link to={`/contratos/${i.contrato_id}`} className="text-sky-800 hover:underline">nº {i.contrato_numero}</Link>
              </td>
              <td className="px-3 py-1.5">{i.cliente}</td>
              <td className="px-3 py-1.5">{formatarCpf(i.cpf)}</td>
              <td className="px-3 py-1.5">{i.convenio}</td>
              <td className="px-3 py-1.5">
                {aba === 'cancelar' ? (i.erro ?? '—') : i.prazo ? new Date(`${i.prazo}T12:00:00`).toLocaleDateString('pt-BR') : '—'}
              </td>
            </tr>
          ))}
        </Tabela>
      )}
    </div>
  );
}

export function AssinaturasPage() {
  const [aba, setAba] = useState<Aba>('conferir');
  const lista = useConsulta(['assinaturas', aba], async () =>
    ((await exigir(supabase.rpc('assinaturas_lista', { p_tipo: aba }))) ?? []) as unknown as ItemLista[],
  );
  const tentar = useAcao(() => chamarAssinatura({ acao: 'processar_cancelamentos' }), [['assinaturas']]);
  return (
    <Pagina titulo="Assinaturas">
      <Aviso>{tentar.erro}</Aviso>
      <ListasAssinaturas aba={aba} onAba={setAba} itens={lista.data ?? []} onTentarDeNovo={() => tentar.mutate(undefined)} />
    </Pagina>
  );
}
