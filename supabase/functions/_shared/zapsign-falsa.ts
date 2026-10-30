// ZapSign falsa (só testes e teste no navegador). Imita as rotas usadas da API v1
// e tem rotas de controle: POST /_assinar/:doc, /_recusar/:doc, /_falhar (a próxima chamada da API dá 500).
import { createServer, type IncomingMessage, type Server } from 'node:http';

export interface DocFalso {
  token: string;
  name: string;
  status: 'pending' | 'signed' | 'refused';
  deleted: boolean;
  base64_pdf: string;
  date_limit_to_sign: string | null;
  signers: Record<string, unknown>[];
}

export interface ZapSignFalsa {
  url: string;
  docs: Map<string, DocFalso>;
  chamadas: { metodo: string; caminho: string; corpo: unknown; auth: string | undefined }[];
  fechar(): Promise<void>;
}

async function corpo(req: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = [];
  for await (const p of req) partes.push(p as Buffer);
  const t = Buffer.concat(partes).toString('utf8');
  return t ? JSON.parse(t) : null;
}

/** urlPublica: endereço que aparece nos links de arquivo (ex.: http://host.docker.internal:porta, para as Edge Functions). */
export async function iniciarZapSignFalsa(porta = 0, host = '127.0.0.1', urlPublica?: string): Promise<ZapSignFalsa> {
  const docs = new Map<string, DocFalso>();
  const chamadas: ZapSignFalsa['chamadas'] = [];
  let falhar = 0;
  let seq = 0;
  let url = '';

  const server: Server = createServer(async (req, res) => {
    const caminho = (req.url ?? '').split('?')[0];
    const b = req.method === 'GET' || req.method === 'DELETE' ? null : await corpo(req);
    const json = (status: number, dados: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dados));
    };
    const visao = (d: DocFalso) => ({
      token: d.token, name: d.name, status: d.status, deleted: d.deleted,
      signed_file: d.status === 'signed' ? `${url}/arquivos/${d.token}.pdf` : null, signers: d.signers,
    });

    let m: RegExpMatchArray | null;
    if (req.method === 'POST' && (m = caminho.match(/^\/_(assinar|recusar)\/([^/]+)$/))) {
      const d = docs.get(m[2]);
      if (!d) return json(404, {});
      d.status = m[1] === 'assinar' ? 'signed' : 'refused';
      d.signers = d.signers.map((s) => ({ ...s, status: m![1] === 'assinar' ? 'signed' : 'refused', signed_at: '2026-10-30T12:00:00Z',
        selfie_photo_url: s.require_selfie_photo ? `${url}/arquivos/selfie.jpg` : '', document_photo_url: '' }));
      return json(200, visao(d));
    }
    if (req.method === 'POST' && caminho === '/_falhar') {
      falhar += 1;
      return json(200, {});
    }
    if (req.method === 'GET' && (m = caminho.match(/^\/arquivos\/(.+)$/))) {
      res.writeHead(200, { 'Content-Type': m[1].endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' });
      return res.end(m[1].endsWith('.pdf') ? '%PDF-1.7 assinado' : 'JPEG');
    }

    chamadas.push({ metodo: req.method ?? '', caminho, corpo: b, auth: req.headers.authorization });
    if (falhar > 0) {
      falhar -= 1;
      return json(500, { detail: 'erro simulado' });
    }
    if (req.method === 'POST' && caminho === '/api/v1/docs/') {
      const c = b as Record<string, unknown>;
      seq += 1;
      const d: DocFalso = {
        token: `doc-falso-${seq}`, name: String(c.name), status: 'pending', deleted: false, base64_pdf: String(c.base64_pdf),
        date_limit_to_sign: (c.date_limit_to_sign as string) ?? null,
        signers: ((c.signers as Record<string, unknown>[]) ?? []).map((s, i) => ({ ...s, token: `signer-${seq}-${i}`, status: 'new',
          sign_url: `${url}/verificar/signer-${seq}-${i}` })),
      };
      docs.set(d.token, d);
      return json(200, visao(d));
    }
    if ((m = caminho.match(/^\/api\/v1\/docs\/([^/]+)\/$/))) {
      const d = docs.get(m[1]);
      if (!d || (d.deleted && req.method === 'DELETE')) return json(404, { detail: 'Not found' });
      if (req.method === 'GET') return json(200, visao(d));
      if (req.method === 'DELETE') {
        d.deleted = true;
        return json(200, visao(d));
      }
    }
    if (req.method === 'POST' && (m = caminho.match(/^\/api\/v1\/signers\/([^/]+)\/$/))) {
      for (const d of docs.values()) {
        const s = d.signers.find((x) => x.token === m![1]);
        if (s) {
          Object.assign(s, b as object);
          return json(200, s);
        }
      }
      return json(404, {});
    }
    json(404, { detail: 'rota desconhecida' });
  });

  await new Promise<void>((ok) => server.listen(porta, host, ok));
  const end = server.address();
  url = urlPublica ?? `http://${host}:${typeof end === 'object' && end ? end.port : porta}`;
  return { url, docs, chamadas, fechar: () => new Promise((ok) => server.close(() => ok())) };
}
