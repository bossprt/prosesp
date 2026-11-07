import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Aviso, Botao, Pagina, Selecao, Tabela } from '../../components/ui';
import type { Database } from '../../lib/database.types';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { supabase } from '../../lib/supabase';
import { useSessao } from '../auth/sessao';
import { useConveniosOpcoes } from '../convenios/useConvenios';
import { DialogoMotivo } from './DialogoMotivo';
import { competenciaBr, reais } from './comum';

export interface Diferenca {
  tipo: 'parcela' | 'mensalidade';
  parcela_id?: string | null;
  mensalidade_parcela_id?: string | null;
  contrato_id?: string | null;
  contrato_numero: number | null;
  cliente: string;
  convenio: string;
  competencia: string;
  valor: string | number;
  pago: string | number;
  saldo: string | number;
  status: string;
}

const STATUS: Record<string, string> = {
  aberta: 'Aberta', parcial: 'Parcial', atrasada: 'Atrasada', paga: 'Paga',
};

export function TabelaDiferencas({ itens, podeBaixar, onBaixar }: {
  itens: Diferenca[];
  podeBaixar: boolean;
  onBaixar: (d: Diferenca) => void;
}) {
  if (itens.length === 0) return <p className="text-sm text-slate-500">Nenhuma diferença em aberto.</p>;
  return (
    <Tabela colunas={['Tipo', 'Contrato', 'Cliente', 'Convênio', 'Competência', 'Valor', 'Pago', 'Falta', 'Situação', 'Ações']}>
      {itens.map((d) => (
        <tr key={d.parcela_id ?? d.mensalidade_parcela_id ?? `${d.contrato_numero}-${d.competencia}`}>
          <td className="px-3 py-1.5">{d.tipo === 'parcela' ? 'Parcela' : 'Mensalidade'}</td>
          <td className="px-3 py-1.5">
            {d.contrato_id ? <Link to={`/contratos/${d.contrato_id}`} className="text-sky-800 hover:underline">nº {d.contrato_numero}</Link> : (d.contrato_numero ?? '—')}
          </td>
          <td className="px-3 py-1.5">{d.cliente}</td>
          <td className="px-3 py-1.5">{d.convenio}</td>
          <td className="px-3 py-1.5">{competenciaBr(d.competencia)}</td>
          <td className="px-3 py-1.5">{reais(d.valor)}</td>
          <td className="px-3 py-1.5">{reais(d.pago)}</td>
          <td className="px-3 py-1.5">{reais(d.saldo)}</td>
          <td className="px-3 py-1.5">{STATUS[d.status] ?? d.status}</td>
          <td className="px-3 py-1.5">
            {podeBaixar && <Botao variante="secundario" onClick={() => onBaixar(d)}>Dar baixa</Botao>}
          </td>
        </tr>
      ))}
    </Tabela>
  );
}

type ArgsDiferencas = Database['public']['Functions']['diferencas_abertas']['Args'];

export function DiferencasPage() {
  const { pode } = useSessao();
  const convenios = useConveniosOpcoes();
  const [convenioId, setConvenioId] = useState('');
  const [alvo, setAlvo] = useState<Diferenca | null>(null);
  const lista = useConsulta(['diferencas', convenioId], async () =>
    ((await exigir(supabase.rpc('diferencas_abertas', { p_convenio_id: convenioId || undefined } as ArgsDiferencas))) ?? []) as unknown as Diferenca[],
  );
  const baixar = useAcao(
    ({ d, motivo }: { d: Diferenca; motivo: string }) =>
      exigir(supabase.rpc('diferenca_baixar', {
        p_parcela_id: (d.tipo === 'parcela' ? d.parcela_id : null) as string,
        p_mensalidade_parcela_id: (d.tipo === 'mensalidade' ? d.mensalidade_parcela_id : null) as string,
        p_motivo: motivo,
      })),
    [['diferencas'], ['adimplencia'], ['retorno']],
  );
  return (
    <Pagina titulo="Diferenças em aberto">
      <p className="text-sm text-slate-600">
        São parcelas e mensalidades em que o desconto veio menor que o combinado. Dar baixa significa aceitar a diferença e parar de cobrá-la.
      </p>
      <Selecao rotulo="Convênio" vazio="Todos os convênios" value={convenioId} onChange={(e) => setConvenioId(e.target.value)}
        opcoes={(convenios.data ?? []).map((c) => ({ valor: c.id, rotulo: c.nome }))} className="max-w-xs" />
      <Aviso>{lista.error ? 'Não foi possível carregar as diferenças.' : ''}</Aviso>
      {alvo && (
        <DialogoMotivo
          titulo={`Dar baixa na diferença de ${reais(alvo.saldo)} (${alvo.cliente})`}
          explicacao="O valor que falta deixa de ser cobrado."
          rotuloConfirmar="Dar baixa"
          erro={baixar.erro}
          ocupado={baixar.isPending}
          onCancelar={() => setAlvo(null)}
          onConfirmar={(motivo) => baixar.mutate({ d: alvo, motivo }, { onSuccess: () => setAlvo(null) })}
        />
      )}
      <TabelaDiferencas itens={lista.data ?? []} podeBaixar={pode('retorno.baixar_diferenca')} onBaixar={(d) => { baixar.reset(); setAlvo(d); }} />
    </Pagina>
  );
}
