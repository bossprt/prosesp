import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';

export function Pagina({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{titulo}</h1>
        {acoes}
      </header>
      {children}
    </section>
  );
}

export function Aviso({ tipo = 'erro', children }: { tipo?: 'erro' | 'ok' | 'info'; children: ReactNode }) {
  if (!children) return null;
  const cor = {
    erro: 'border-red-300 bg-red-50 text-red-800',
    ok: 'border-green-300 bg-green-50 text-green-800',
    info: 'border-sky-300 bg-sky-50 text-sky-800',
  }[tipo];
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} className={`rounded border px-3 py-2 text-sm ${cor}`}>
      {children}
    </div>
  );
}

export function Botao({
  variante = 'primario',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' | 'perigo' }) {
  const cor = {
    primario: 'bg-sky-700 text-white hover:bg-sky-800',
    secundario: 'border border-slate-300 bg-white hover:bg-slate-100',
    perigo: 'bg-red-700 text-white hover:bg-red-800',
  }[variante];
  return (
    <button
      type="button"
      className={`rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${cor} ${className}`}
      {...props}
    />
  );
}

type CampoProps = InputHTMLAttributes<HTMLInputElement> & { rotulo: string; erro?: string };

export const Campo = forwardRef<HTMLInputElement, CampoProps>(function Campo({ rotulo, erro, className = '', ...props }, ref) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <input
        id={id}
        ref={ref}
        aria-invalid={Boolean(erro)}
        className="rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
        {...props}
      />
      {erro && <span className="text-xs text-red-700">{erro}</span>}
    </div>
  );
});

type SelecaoProps = SelectHTMLAttributes<HTMLSelectElement> & {
  rotulo: string;
  erro?: string;
  opcoes: { valor: string; rotulo: string }[];
  vazio?: string;
};

export const Selecao = forwardRef<HTMLSelectElement, SelecaoProps>(function Selecao(
  { rotulo, erro, opcoes, vazio = 'Selecione…', className = '', ...props },
  ref,
) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <select id={id} ref={ref} className="rounded border border-slate-300 px-2 py-1.5 text-sm" {...props}>
        <option value="">{vazio}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      {erro && <span className="text-xs text-red-700">{erro}</span>}
    </div>
  );
});

export function Tabela({ colunas, children }: { colunas: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100">
          <tr>
            {colunas.map((c) => (
              <th key={c} className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}
