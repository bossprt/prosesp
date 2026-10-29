import { Tabela } from '../../components/ui';
import { formatarReais } from '../../lib/mascaras';

const STATUS: Record<string, string> = {
  aberta: 'Aberta', paga: 'Paga', parcial: 'Parcial', atrasada: 'Atrasada', prejuizo: 'Prejuízo', cancelada: 'Cancelada',
};

const mesAno = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;
const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function ParcelasTabela({
  parcelas,
}: {
  parcelas: { id: string; numero: number; competencia: string; vencimento: string; valor: number | string; status: string }[];
}) {
  if (parcelas.length === 0) return <p className="text-sm text-slate-500">As parcelas são criadas quando o crédito é liberado.</p>;
  return (
    <Tabela colunas={['Nº', 'Competência', 'Vencimento', 'Valor', 'Situação']}>
      {parcelas.map((p) => (
        <tr key={p.id} className={p.status === 'cancelada' ? 'text-slate-400' : p.status === 'atrasada' ? 'text-red-700' : ''}>
          <td className="px-3 py-1.5">{p.numero}</td>
          <td className="px-3 py-1.5">{mesAno(p.competencia)}</td>
          <td className="px-3 py-1.5">{dataBr(p.vencimento)}</td>
          <td className="px-3 py-1.5">{formatarReais(p.valor)}</td>
          <td className="px-3 py-1.5">{STATUS[p.status] ?? p.status}</td>
        </tr>
      ))}
    </Tabela>
  );
}
