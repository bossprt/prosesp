// Cliente mínimo da API v1 da ZapSign (https://docs.zapsign.com.br).
// Endpoints usados: POST /api/v1/docs/ (criar), GET /api/v1/docs/{doc}/ (consultar),
// DELETE /api/v1/docs/{doc}/ (cancelar), POST /api/v1/signers/{signer}/ (atualizar assinante / lembrete).

export class ErroZapSign extends Error {
  constructor(public status: number, detalhe: string) {
    super(`ZapSign respondeu ${status}: ${detalhe.slice(0, 300)}`);
  }
}

export interface AssinanteZapSign {
  name: string;
  email?: string;
  phone_country?: string;
  phone_number?: string;
  auth_mode: string;
  require_selfie_photo: boolean;
  require_document_photo: boolean;
  send_automatic_email: boolean;
  send_automatic_whatsapp: boolean;
  qualification?: string;
  lock_name?: boolean;
  lock_email?: boolean;
  lock_phone?: boolean;
}

export interface NovoDocumento {
  name: string;
  base64_pdf: string;
  signers: AssinanteZapSign[];
  date_limit_to_sign: string;
  external_id: string;
  lang: 'pt-br';
}

export interface SignatarioZapSign {
  token: string;
  name: string;
  status?: string;
  qualification?: string;
  signed_at?: string | null;
  ip?: string | null;
  geo_latitude?: string | null;
  geo_longitude?: string | null;
  selfie_photo_url?: string | null;
  document_photo_url?: string | null;
  document_verse_photo_url?: string | null;
}

export interface DocumentoZapSign {
  token: string;
  status: 'pending' | 'signed' | 'refused' | string;
  signed_file?: string | null;
  deleted?: boolean;
  signers: SignatarioZapSign[];
}

export interface ClienteZapSign {
  criarDocumento(doc: NovoDocumento): Promise<DocumentoZapSign>;
  consultar(docToken: string): Promise<DocumentoZapSign | null>;
  atualizarAssinante(signerToken: string, campos: Record<string, unknown>): Promise<void>;
  /** 'cancelado' ou 'nao_encontrado' (já não existe na ZapSign). */
  cancelar(docToken: string): Promise<'cancelado' | 'nao_encontrado'>;
  baixar(url: string): Promise<Uint8Array>;
}

export function criarClienteZapSign(opts: { url: string; token: string; fetch?: typeof fetch }): ClienteZapSign {
  const f = opts.fetch ?? fetch;
  const base = opts.url.replace(/\/+$/, '');
  async function chamar(metodo: string, caminho: string, corpo?: unknown): Promise<Response> {
    const r = await f(`${base}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return r;
  }
  async function exigirOk(r: Response): Promise<Response> {
    if (!r.ok) throw new ErroZapSign(r.status, await r.text().catch(() => ''));
    return r;
  }
  return {
    async criarDocumento(doc) {
      return await (await exigirOk(await chamar('POST', '/api/v1/docs/', doc))).json();
    },
    async consultar(docToken) {
      const r = await chamar('GET', `/api/v1/docs/${encodeURIComponent(docToken)}/`);
      if (r.status === 404) return null;
      return await (await exigirOk(r)).json();
    },
    async atualizarAssinante(signerToken, campos) {
      await exigirOk(await chamar('POST', `/api/v1/signers/${encodeURIComponent(signerToken)}/`, campos));
    },
    async cancelar(docToken) {
      const r = await chamar('DELETE', `/api/v1/docs/${encodeURIComponent(docToken)}/`);
      if (r.status === 404) return 'nao_encontrado';
      await exigirOk(r);
      return 'cancelado';
    },
    async baixar(url) {
      const r = await f(url);
      if (!r.ok) throw new ErroZapSign(r.status, 'falha ao baixar arquivo');
      return new Uint8Array(await r.arrayBuffer());
    },
  };
}
