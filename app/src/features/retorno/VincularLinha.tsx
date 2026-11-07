import { useState } from 'react';
import { Campo } from '../../components/ui';
import { DialogoMotivo } from './DialogoMotivo';
import type { Produto } from './comum';

/** Para onde vai o desconto: a sugestão do sistema, o nº do contrato ou (mensalidades) a matrícula.
 *  parcelaMes ('AAAA-MM') escolhe outra parcela (regularização); vazio = a parcela do mês do retorno. */
export type Destino =
  | { tipo: 'sugestao'; parcelaMes: string }
  | { tipo: 'numero'; numero: number; parcelaMes: string }
  | { tipo: 'matricula'; matricula: string; parcelaMes: string };

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
  const [matricula, setMatricula] = useState('');
  const [parcelaMes, setParcelaMes] = useState('');
  const [aviso, setAviso] = useState('');
  const porSugestao = Boolean(sugestao) && usarSugestao;

  function confirmar(motivo: string) {
    if (porSugestao) return onConfirmar({ tipo: 'sugestao', parcelaMes }, motivo);
    if (produto === 'parcelas') {
      const n = Number(numero);
      if (!Number.isInteger(n) || n < 1) return setAviso('Informe o número do contrato.');
      setAviso('');
      return onConfirmar({ tipo: 'numero', numero: n, parcelaMes }, motivo);
    }
    if (!matricula.trim()) return setAviso('Informe a matrícula do cliente.');
    setAviso('');
    onConfirmar({ tipo: 'matricula', matricula: matricula.trim(), parcelaMes }, motivo);
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
        <Campo rotulo="Matrícula do cliente (neste convênio)" value={matricula} onChange={(e) => setMatricula(e.target.value)} />
      )}
      <Campo
        rotulo="Pagar a parcela de outro mês (opcional)"
        type="month"
        value={parcelaMes}
        onChange={(e) => setParcelaMes(e.target.value)}
      />
      <p className="text-xs text-slate-500">Deixe vazio para pagar a parcela do mês deste retorno. Use para regularizar uma parcela atrasada.</p>
    </DialogoMotivo>
  );
}
