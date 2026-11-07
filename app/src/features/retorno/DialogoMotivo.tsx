import { useState, type ReactNode } from 'react';
import { Aviso, Botao } from '../../components/ui';

/** Pede um motivo (obrigatório) antes de confirmar uma ação. */
export function DialogoMotivo({
  titulo, explicacao, rotuloConfirmar = 'Confirmar', onConfirmar, onCancelar, erro, ocupado, children,
}: {
  titulo: string;
  explicacao?: string;
  rotuloConfirmar?: string;
  onConfirmar: (motivo: string) => void;
  onCancelar: () => void;
  erro?: string;
  ocupado?: boolean;
  /** Campos extras acima do motivo. */
  children?: ReactNode;
}) {
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState('');
  function confirmar() {
    if (!motivo.trim()) return setAviso('Informe o motivo.');
    setAviso('');
    onConfirmar(motivo.trim());
  }
  return (
    <div role="dialog" aria-label={titulo} className="space-y-2 rounded border border-slate-300 bg-slate-50 p-3">
      <p className="text-sm font-medium">{titulo}</p>
      {explicacao && <p className="text-sm text-slate-600">{explicacao}</p>}
      {children}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Motivo</span>
        <textarea
          className="rounded border border-slate-300 px-2 py-1.5"
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </label>
      <Aviso>{aviso || erro}</Aviso>
      <div className="flex gap-2">
        <Botao onClick={confirmar} disabled={ocupado}>{rotuloConfirmar}</Botao>
        <Botao variante="secundario" onClick={onCancelar} disabled={ocupado}>Cancelar</Botao>
      </div>
    </div>
  );
}
