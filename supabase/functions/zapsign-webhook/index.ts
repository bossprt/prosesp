// Aviso da ZapSign (webhook). Protegido por segredo (cabeçalho X-Webhook-Secret ou ?segredo=).
// Nunca confia no conteúdo do aviso: só usa o token do documento e confirma a situação na própria ZapSign.
import { criarFluxo, segredoConfere } from '../_shared/fluxo.ts';
import { dependencias, resposta } from '../_shared/deps-deno.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido.' });
  const recebido = req.headers.get('x-webhook-secret') ?? new URL(req.url).searchParams.get('segredo');
  if (!segredoConfere(recebido, Deno.env.get('ZAPSIGN_WEBHOOK_SEGREDO') ?? '')) {
    return resposta(401, { erro: 'Não autorizado.' });
  }
  let token: unknown;
  try {
    const corpo = await req.json();
    token = corpo?.token ?? corpo?.doc?.token;
  } catch {
    return resposta(400, { erro: 'Dados inválidos.' });
  }
  if (typeof token !== 'string' || !token) return resposta(200, { ok: true });
  try {
    await criarFluxo(dependencias(null)).receberAviso(token);
  } catch (e) {
    console.error(e);
    // 500 faz a ZapSign tentar de novo mais tarde
    return resposta(500, { erro: 'Falha ao processar o aviso.' });
  }
  return resposta(200, { ok: true });
});
