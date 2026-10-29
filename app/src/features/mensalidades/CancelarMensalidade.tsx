import { useState } from 'react';
import { Aviso, Botao, Campo, Selecao } from '../../components/ui';
import { mensagemErro } from '../../lib/erros';

interface Props {
  requerimentos: { id: string; nome: string }[];
  onCancelar: (documentoId: string, motivo: string) => Promise<unknown> | void;
}

/** Cancelar a mensalidade só com o requerimento assinado pelo cliente já anexado. */
export function CancelarMensalidade({ requerimentos, onCancelar }: Props) {
  const [doc, setDoc] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  return (
    <div className="space-y-2 rounded border border-red-200 bg-red-50 p-3">
      {requerimentos.length === 0 && (
        <p className="text-sm text-red-800">Anexe primeiro o requerimento assinado nos documentos do cliente.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Selecao rotulo="Requerimento assinado" value={doc} onChange={(e) => setDoc(e.target.value)}
          opcoes={requerimentos.map((r) => ({ valor: r.id, rotulo: r.nome }))} />
        <Campo rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="flex-1" />
        <Botao
          variante="perigo"
          disabled={!doc || !motivo.trim()}
          onClick={async () => {
            setErro('');
            try {
              await onCancelar(doc, motivo.trim());
            } catch (err) {
              setErro(mensagemErro(err));
            }
          }}
        >
          Cancelar mensalidade
        </Botao>
      </div>
      <Aviso>{erro}</Aviso>
    </div>
  );
}
