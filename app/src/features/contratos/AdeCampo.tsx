import { useState, type FormEvent } from 'react';
import { Aviso, Botao, Campo } from '../../components/ui';
import { mensagemErro } from '../../lib/erros';

interface Props {
  modo: 'seguro' | 'rapido';
  descricao?: string | null;
  rotuloBotao?: string;
  onConfirmar: (ade: string, confirmacao: string | null) => Promise<unknown>;
}

/** Campo do ADE: no modo seguro, digitar duas vezes e sem colar (o banco confere de novo). */
export function AdeCampo({ modo, descricao, rotuloBotao = 'Registrar ADE', onConfirmar }: Props) {
  const [ade, setAde] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const seguro = modo === 'seguro';
  const bloquearColar = (e: { preventDefault: () => void }) => {
    if (!seguro) return;
    e.preventDefault();
    setErro('No modo seguro o ADE precisa ser digitado.');
  };
  const pronto = ade.trim() !== '' && (!seguro || ade.trim() === confirmacao.trim());

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    try {
      await onConfirmar(ade.trim(), seguro ? confirmacao.trim() : null);
      setAde('');
      setConfirmacao('');
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-end gap-2">
      <Campo
        rotulo="ADE"
        value={ade}
        autoComplete="off"
        placeholder={descricao ?? undefined}
        onPaste={bloquearColar}
        onDrop={bloquearColar}
        onChange={(e) => setAde(e.target.value)}
      />
      {seguro && (
        <Campo
          rotulo="Repita o ADE"
          value={confirmacao}
          autoComplete="off"
          onPaste={bloquearColar}
          onDrop={bloquearColar}
          onChange={(e) => setConfirmacao(e.target.value)}
        />
      )}
      <Botao type="submit" disabled={!pronto}>
        {rotuloBotao}
      </Botao>
      <div className="w-full">
        <Aviso>{erro}</Aviso>
      </div>
    </form>
  );
}
