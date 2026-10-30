// Passos da assinatura eletrônica. As regras ficam no banco (RPCs); aqui só PDF, Storage e ZapSign.
import { renderizarModelo, type DadosDocumento } from './modelo.ts';
import { gerarPdf } from './pdf.ts';
import type { AssinanteZapSign, ClienteZapSign } from './zapsign.ts';

/** Erro com mensagem pronta para a tela. */
export class ErroUsuario extends Error {}

export const MSG_ENVIO = 'Não foi possível enviar para a ZapSign. Tente de novo em alguns minutos.';
export const MSG_REENVIO = 'Não foi possível reenviar pela ZapSign. Tente de novo em alguns minutos.';

export interface Dependencias {
  /** RPC com o login de quem chamou (regras e permissões do banco valem). */
  rpcUsuario(nome: string, args: Record<string, unknown>): Promise<any>;
  /** RPC com a chave de serviço (funções _assinatura_*). */
  rpcServico(nome: string, args: Record<string, unknown>): Promise<any>;
  upload(caminho: string, bytes: Uint8Array, tipo: string): Promise<void>;
  envioPorToken(zapsignToken: string): Promise<{ id: string; contrato_id: string; situacao: string } | null>;
  cancelamentosPendentes(): Promise<{ id: string; zapsign_token: string }[]>;
  zapsign: ClienteZapSign;
}

interface Assinante {
  nome: string;
  email: string | null;
  celular: string | null;
  papel: string;
  signer_token?: string;
}

interface Preparado {
  assinatura_id: string;
  contrato_numero: number;
  modelo: { texto: string; teste: boolean; versao: number };
  dados: DadosDocumento;
  config: { selfie: boolean; documento: boolean; codigo: boolean; email: boolean; whatsapp: boolean; data_limite: string };
  assinantes: Assinante[];
}

function telefone(celular: string | null): { phone_country?: string; phone_number?: string } {
  let d = (celular ?? '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  return d ? { phone_country: '55', phone_number: d } : {};
}

function paraZapSign(a: Assinante, cfg: Preparado['config']): AssinanteZapSign {
  const cliente = a.papel === 'cliente';
  const email = cfg.email && !!a.email;
  const whatsapp = cfg.whatsapp && !!a.celular;
  const codigo = cliente && cfg.codigo
    ? (whatsapp ? '-tokenWhatsapp' : a.email ? '-tokenEmail' : '-tokenSms')
    : '';
  return {
    name: a.nome,
    ...(a.email ? { email: a.email } : {}),
    ...telefone(a.celular),
    auth_mode: `assinaturaTela${codigo}`,
    require_selfie_photo: cliente && cfg.selfie,
    require_document_photo: cliente && cfg.documento,
    send_automatic_email: email,
    send_automatic_whatsapp: whatsapp,
    qualification: a.papel,
    lock_name: true,
    lock_email: true,
    lock_phone: true,
  };
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Compara o segredo do aviso sem vazar tempo. */
export function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  let dif = recebido.length ^ esperado.length;
  for (let i = 0; i < esperado.length; i++) dif |= (recebido.charCodeAt(i) || 0) ^ esperado.charCodeAt(i);
  return dif === 0;
}

export function criarFluxo(d: Dependencias) {
  return {
    async enviar(contratoId: string): Promise<void> {
      const p: Preparado = await d.rpcUsuario('assinatura_preparar', { p_contrato_id: contratoId });
      let docToken: string | null = null;
      try {
        const pdf = await gerarPdf(renderizarModelo(p.modelo.texto, p.dados), {
          teste: p.modelo.teste, titulo: `Contrato ${p.contrato_numero}`,
        });
        const caminho = `${contratoId}/${p.assinatura_id}/enviado.pdf`;
        await d.upload(caminho, pdf, 'application/pdf');
        const doc = await d.zapsign.criarDocumento({
          name: `Contrato ${p.contrato_numero}`, base64_pdf: base64(pdf), lang: 'pt-br',
          date_limit_to_sign: p.config.data_limite, external_id: p.assinatura_id,
          signers: p.assinantes.map((a) => paraZapSign(a, p.config)),
        });
        docToken = doc.token;
        const assinantes = p.assinantes.map((a, i) => ({ ...a, signer_token: doc.signers[i]?.token }));
        await d.rpcServico('_assinatura_registrar_envio', {
          p_id: p.assinatura_id, p_pdf_caminho: caminho, p_zapsign_token: doc.token, p_assinantes: assinantes,
        });
      } catch (e) {
        if (docToken) await d.zapsign.cancelar(docToken).catch(() => {});
        await d.rpcServico('_assinatura_falhou', { p_id: p.assinatura_id, p_erro: String(e) }).catch(() => {});
        throw new ErroUsuario(MSG_ENVIO);
      }
    },

    async reenviar(contratoId: string, atualizarContato: boolean): Promise<void> {
      const r = await d.rpcUsuario('assinatura_para_reenviar', { p_contrato_id: contratoId });
      const assinantes: Assinante[] = r.assinantes;
      const cliente = assinantes.find((a) => a.papel === 'cliente');
      if (!cliente?.signer_token) throw new ErroUsuario(MSG_REENVIO);
      const novo = atualizarContato ? { ...cliente, email: r.cliente.email, celular: r.cliente.celular } : cliente;
      try {
        await d.zapsign.atualizarAssinante(cliente.signer_token, {
          ...(atualizarContato ? { ...(novo.email ? { email: novo.email } : {}), ...telefone(novo.celular) } : {}),
          send_automatic_email: r.canais.email && !!novo.email,
          send_automatic_whatsapp: r.canais.whatsapp && !!novo.celular,
        });
      } catch {
        throw new ErroUsuario(MSG_REENVIO);
      }
      await d.rpcServico('_assinatura_reenviada', {
        p_id: r.assinatura_id, p_assinantes: assinantes.map((a) => (a === cliente ? novo : a)),
      });
    },

    async receberAviso(docToken: string): Promise<void> {
      const envio = await d.envioPorToken(docToken);
      if (!envio || envio.situacao !== 'enviado') return;
      const doc = await d.zapsign.consultar(docToken);
      if (!doc) return;
      const pasta = `${envio.contrato_id}/${envio.id}`;
      if (doc.status === 'signed' && doc.signed_file) {
        const caminho = `${pasta}/assinado.pdf`;
        await d.upload(caminho, await d.zapsign.baixar(doc.signed_file), 'application/pdf');
        const assinantes = [];
        for (const [i, s] of doc.signers.entries()) {
          const foto = async (url: string | null | undefined, nome: string) => {
            if (!url) return null;
            const c = `${pasta}/evidencias/${i + 1}-${nome}.jpg`;
            await d.upload(c, await d.zapsign.baixar(url), 'image/jpeg');
            return c;
          };
          assinantes.push({
            nome: s.name, papel: s.qualification ?? null, assinado_em: s.signed_at ?? null, ip: s.ip ?? null,
            latitude: s.geo_latitude ?? null, longitude: s.geo_longitude ?? null,
            selfie: await foto(s.selfie_photo_url, 'selfie'),
            documento: await foto(s.document_photo_url, 'documento'),
            documento_verso: await foto(s.document_verse_photo_url, 'documento-verso'),
          });
        }
        await d.rpcServico('_assinatura_atualizar', {
          p_zapsign_token: docToken, p_situacao: 'assinado', p_pdf_assinado_caminho: caminho, p_evidencias: { assinantes },
        });
      } else if (doc.status === 'refused') {
        await d.rpcServico('_assinatura_atualizar', {
          p_zapsign_token: docToken, p_situacao: 'recusado_cliente', p_pdf_assinado_caminho: null, p_evidencias: {},
        });
      }
    },

    async processarCancelamentos(): Promise<void> {
      for (const c of await d.cancelamentosPendentes()) {
        try {
          await d.zapsign.cancelar(c.zapsign_token);
          await d.rpcServico('_assinatura_cancelamento_feito', { p_id: c.id, p_ok: true, p_erro: null });
        } catch (e) {
          await d.rpcServico('_assinatura_cancelamento_feito', { p_id: c.id, p_ok: false, p_erro: (e as Error).message });
        }
      }
    },

    async previa(contratoId: string | null, texto: string, teste: boolean): Promise<Uint8Array> {
      await d.rpcUsuario('validar_modelo_contrato', { p_texto: texto });
      let dados: DadosDocumento;
      if (contratoId) {
        dados = await d.rpcUsuario('contrato_dados_documento', { p_contrato_id: contratoId });
      } else {
        const campos: { chave: string; exemplo: string }[] = await d.rpcUsuario('modelo_campos', {});
        dados = {
          campos: Object.fromEntries(campos.map((c) => [c.chave, c.exemplo])),
          condicoes: { mensalidade: true, quitacoes: true, dividas: true },
          parcelas: [1, 2, 3].map((n) => ({ numero: n, competencia: `0${n}/2027`, vencimento: `28/0${n}/2027`, valor: 'R$ 122,40' })),
        };
      }
      return await gerarPdf(renderizarModelo(texto, dados), { teste, titulo: 'Prévia do contrato' });
    },
  };
}
