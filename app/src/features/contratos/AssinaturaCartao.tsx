import { useState } from 'react';
import { Aviso, Botao, Campo } from '../../components/ui';
import { ROTULO_ENVIO } from '../assinaturas/useAssinaturas';

export interface EnvioAssinatura {
  id: string;
  situacao: string;
  prazo: string | null;
  enviado_em: string | null;
  assinado_em: string | null;
  pdf_caminho: string | null;
  pdf_assinado_caminho: string | null;
  erro: string | null;
  reenvios: number;
}

interface Props {
  fase: string;
  envio: EnvioAssinatura | null;
  podeMover: boolean;
  ehParceiro: boolean;
  onEnviar: () => void;
  onReenviar: (atualizarContato: boolean) => void;
  onAprovar: () => void;
  onNaoAprovar: (motivo: string) => void;
  onAbrir: (caminho: string) => void;
}

const data = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString('pt-BR') : '—');

export function AssinaturaCartao({ fase, envio, podeMover, ehParceiro, onEnviar, onReenviar, onAprovar, onNaoAprovar, onAbrir }: Props) {
  const [naoAprovar, setNaoAprovar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const acoes = podeMover && !ehParceiro;
  const s = envio?.situacao;
  const podeEnviar = acoes && fase === 'averbado' && (!envio || !['preparando', 'enviado', 'assinado'].includes(s!));
  const podeEnviarDeNovo = acoes && fase === 'aguardando_assinatura' && ['vencido', 'recusado_cliente', 'falhou'].includes(s ?? '');

  if (!envio && !podeEnviar) return null;

  function confirmar() {
    if (!motivo.trim()) return setErro('Informe o motivo.');
    setErro('');
    onNaoAprovar(motivo.trim());
    setNaoAprovar(false);
    setMotivo('');
  }

  return (
    <div className="space-y-2 rounded border border-slate-200 bg-white p-3 text-sm">
      {envio && (
        <dl className="grid gap-2 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Situação</dt>
            <dd className="font-medium">{ROTULO_ENVIO[envio.situacao] ?? envio.situacao}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Enviado em</dt>
            <dd>{data(envio.enviado_em)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Prazo para assinar</dt>
            <dd>{data(envio.prazo)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Assinado em</dt>
            <dd>{data(envio.assinado_em)}</dd>
          </div>
        </dl>
      )}
      {envio?.erro && !ehParceiro && <p className="text-xs text-slate-500">Detalhe técnico: {envio.erro}</p>}
      <div className="flex flex-wrap gap-2">
        {envio?.pdf_caminho && (
          <Botao variante="secundario" onClick={() => onAbrir(envio.pdf_caminho!)}>PDF enviado</Botao>
        )}
        {envio?.pdf_assinado_caminho && (
          <Botao variante="secundario" onClick={() => onAbrir(envio.pdf_assinado_caminho!)}>PDF assinado</Botao>
        )}
        {podeEnviar && <Botao onClick={onEnviar}>Enviar para assinatura</Botao>}
        {podeEnviarDeNovo && <Botao onClick={onEnviar}>Enviar de novo</Botao>}
        {acoes && s === 'enviado' && (
          <>
            <Botao variante="secundario" onClick={() => onReenviar(false)}>Reenviar</Botao>
            <Botao variante="secundario" onClick={() => onReenviar(true)}>Reenviar para o contato novo</Botao>
          </>
        )}
        {acoes && s === 'assinado' && fase === 'aguardando_assinatura' && (
          <>
            <Botao onClick={onAprovar}>Aprovar assinatura</Botao>
            <Botao variante="secundario" onClick={() => setNaoAprovar(true)}>Não aprovar</Botao>
          </>
        )}
      </div>
      {naoAprovar && (
        <div className="flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-slate-50 p-2">
          <Campo rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="flex-1" />
          <Botao onClick={confirmar}>Confirmar</Botao>
          <Botao variante="secundario" onClick={() => (setNaoAprovar(false), setErro(''))}>Voltar</Botao>
        </div>
      )}
      <Aviso>{erro}</Aviso>
    </div>
  );
}
