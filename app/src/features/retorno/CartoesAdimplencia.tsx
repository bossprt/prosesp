import { percentual, reais } from './comum';

export interface ResumoProduto {
  esperado: string | number;
  recebido: string | number;
  percentual: string | number | null;
  pagas?: number;
  parciais?: number;
  nao_pagas?: number;
  atrasadas?: number;
}

function Cartao({ titulo, r }: { titulo: string; r: ResumoProduto }) {
  return (
    <section aria-label={titulo} className="space-y-1 rounded border border-slate-200 bg-white p-3 text-sm">
      <h2 className="font-medium">{titulo}</h2>
      <p>Esperado: <strong>{reais(r.esperado)}</strong></p>
      <p>Recebido: <strong>{reais(r.recebido)}</strong></p>
      <p>Recebido sobre o esperado: <strong>{percentual(r.percentual)}</strong></p>
      <p className="text-slate-600">
        {r.pagas ?? 0} pagas · {r.parciais ?? 0} parciais · {r.nao_pagas ?? 0} não pagas
        {r.atrasadas !== undefined ? ` · ${r.atrasadas} atrasadas` : ''}
      </p>
    </section>
  );
}

export function CartoesAdimplencia({ parcelas, mensalidades }: { parcelas: ResumoProduto; mensalidades: ResumoProduto }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Cartao titulo="Parcelas" r={parcelas} />
      <Cartao titulo="Mensalidades" r={mensalidades} />
    </div>
  );
}
