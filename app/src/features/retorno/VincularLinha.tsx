import { useState } from 'react';
import { Campo } from '../../components/ui';
import { DialogoMotivo } from './DialogoMotivo';
import type { Produto } from './comum';

export type Destino = { tipo: 'sugestao' } | { tipo: 'numero'; numero: number };

/** Escolha de onde vincular a linha: a sugestão do sistema ou (parcelas) o número do contrato. */
export function VincularLinha({ produto, sugestao, onConfirmar, onCancelar, erro, ocupado }: {
  produto: Produto;
  /** Texto da sugestão, ex.: "contrato nº 12 (Maria)"; null se não houver. */
  sugestao: string | null;
  onConfirmar: (destino: Destino, motivo: string) => void;
  onCancelar: () => void;
  erro?: string;
  ocupado?: boolean;
}) {
  const [usarSugestao, setUsarSugestao] = useState(true);
  const [numero, setNumero] = useState('');
  const [aviso, setAviso] = useState('');
  const porSugestao = Boolean(sugestao) && usarSugestao;

  function confirmar(motivo: string) {
    if (porSugestao) return onConfirmar({ tipo: 'sugestao' }, motivo);
    const n = Number(numero);
    if (produto !== 'parcelas' || !Number.isInteger(n) || n < 1) {
      return setAviso(
        produto === 'parcelas' ? 'Informe o número do contrato.' : 'Não há sugestão de mensalidade para vincular esta linha.',
      );
    }
    setAviso('');
    onConfirmar({ tipo: 'numero', numero: n }, motivo);
  }

  return (
    <DialogoMotivo
      titulo="Vincular linha"
      explicacao="O pagamento será lançado no cadastro escolhido. Depois disso a linha não muda mais."
      rotuloConfirmar="Vincular"
      onConfirmar={confirmar}
      onCancelar={onCancelar}
      erro={aviso || erro}
      ocupado={ocupado}
    >
      {sugestao && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={usarSugestao} onChange={(e) => setUsarSugestao(e.target.checked)} />
          Usar a sugestão: {sugestao}
        </label>
      )}
      {!porSugestao && produto === 'parcelas' && (
        <Campo rotulo="Número do contrato" inputMode="numeric" value={numero}
          onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))} />
      )}
      {!porSugestao && produto === 'mensalidades' && (
        <p className="text-sm text-slate-600">Não há sugestão de mensalidade para esta linha.</p>
      )}
    </DialogoMotivo>
  );
}
