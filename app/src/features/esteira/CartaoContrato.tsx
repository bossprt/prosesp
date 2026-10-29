import { Link } from 'react-router-dom';
import { formatarReais } from '../../lib/mascaras';

export interface ContratoCartao {
  id: string;
  numero: number;
  cliente: string;
  valor_bruto: number | string;
  valor_parcela: number | string;
  prazo: number;
  /** quando entrou na fase atual */
  desde: string;
  parceiro?: string | null;
}

/** Cartão do quadro da esteira. Nunca mostra comissão. */
export function CartaoContrato({ contrato: k, hoje = new Date() }: { contrato: ContratoCartao; hoje?: Date }) {
  const dias = Math.max(0, Math.floor((hoje.getTime() - new Date(k.desde).getTime()) / 86_400_000));
  return (
    <Link to={`/contratos/${k.id}`} className="block space-y-1 rounded border border-slate-200 bg-white p-2 text-sm shadow-sm hover:border-sky-400">
      <div className="flex justify-between text-xs text-slate-500">
        <span>nº {k.numero}</span>
        <span>{dias === 1 ? '1 dia' : `${dias} dias`}</span>
      </div>
      <div className="font-medium">{k.cliente}</div>
      <div>
        {formatarReais(k.valor_bruto)} · {k.prazo}x {formatarReais(k.valor_parcela)}
      </div>
      {k.parceiro && <div className="text-xs text-slate-500">{k.parceiro}</div>}
    </Link>
  );
}
