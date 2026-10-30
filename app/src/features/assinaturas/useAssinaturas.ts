import { supabase } from '../../lib/supabase';

export const BUCKET_ASSINATURA = 'contratos-assinatura';

export const ROTULO_ENVIO: Record<string, string> = {
  preparando: 'Preparando o envio',
  enviado: 'Enviado — aguardando o cliente assinar',
  assinado: 'Assinado — falta conferir',
  aprovado: 'Assinatura conferida',
  falhou: 'Falhou ao enviar',
  recusado_cliente: 'Recusado pelo cliente',
  vencido: 'Prazo para assinar vencido',
  cancelamento_pendente: 'Cancelar na ZapSign',
  cancelado: 'Cancelado',
};

type Corpo =
  | { acao: 'enviar'; contrato_id: string }
  | { acao: 'reenviar'; contrato_id: string; atualizar_contato: boolean }
  | { acao: 'previa'; texto: string; teste: boolean; contrato_id?: string }
  | { acao: 'processar_cancelamentos' };

/** Chama a Edge Function "assinatura". Erros voltam no formato que mensagemErro entende (P0001 + texto). */
export async function chamarAssinatura(corpo: Corpo): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('assinatura', { body: corpo });
  if (error) {
    let mensagem = '';
    try {
      const ctx = (error as { context?: Response }).context;
      mensagem = ((await ctx?.json()) as { erro?: string })?.erro ?? '';
    } catch {
      // sem corpo legível: fica a mensagem genérica
    }
    throw { code: mensagem ? 'P0001' : undefined, message: mensagem };
  }
  return data;
}

/** Abre um arquivo do bucket privado numa aba nova (link temporário). */
export async function abrirArquivo(caminho: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET_ASSINATURA).createSignedUrl(caminho, 120);
  if (error || !data) throw { message: 'Não foi possível abrir o arquivo.', code: 'P0001' };
  window.open(data.signedUrl, '_blank', 'noopener');
}

export function abrirPdf(dados: unknown): void {
  const blob = dados instanceof Blob ? dados : new Blob([dados as BlobPart], { type: 'application/pdf' });
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}
