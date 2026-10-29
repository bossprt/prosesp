import { useState } from 'react';
import { Aviso, Botao, Campo } from '../../components/ui';
import { exigeMotivo, ROTULO_FASE, transicoesPermitidas, type Fase, type Transicao } from '../../lib/contratos';

interface Props {
  fase: Fase;
  faseRetorno?: Fase | null;
  matriz: Transicao[];
  pode: (permissao: string) => boolean;
  onMover: (para: Fase, motivo: string | null) => Promise<unknown> | void;
}

export function AcoesFase({ fase, faseRetorno, matriz, pode, onMover }: Props) {
  const destinos = transicoesPermitidas(fase, matriz, pode, faseRetorno);
  const [escolhido, setEscolhido] = useState<Fase | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');

  if (destinos.length === 0) return null;

  function confirmar(para: Fase) {
    if (exigeMotivo(para) && !motivo.trim()) return setErro('Informe o motivo.');
    setErro('');
    onMover(para, motivo.trim() || null);
    setEscolhido(null);
    setMotivo('');
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {destinos.map((d) => (
          <Botao
            key={d}
            variante={d === 'recusado' ? 'perigo' : d === 'pendente' ? 'secundario' : 'primario'}
            onClick={() => (exigeMotivo(d) ? setEscolhido(d) : onMover(d, null))}
          >
            {ROTULO_FASE[d]}
          </Botao>
        ))}
      </div>
      {escolhido && (
        <div className="flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-slate-50 p-2">
          <Campo rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="flex-1" />
          <Botao onClick={() => confirmar(escolhido)}>Confirmar</Botao>
          <Botao variante="secundario" onClick={() => (setEscolhido(null), setErro(''))}>
            Voltar
          </Botao>
        </div>
      )}
      <Aviso>{erro}</Aviso>
    </div>
  );
}
