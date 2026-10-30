// Assinatura eletrônica: enviar, reenviar, prévia do PDF e cancelamentos pendentes na ZapSign.
// As regras e permissões ficam no banco: as RPCs de usuário rodam com o login de quem chamou.
import { criarFluxo, ErroUsuario } from '../_shared/fluxo.ts';
import { cors, dependencias, resposta, zapsignConfigurada } from '../_shared/deps-deno.ts';

const NAO_CONFIGURADA = 'A assinatura eletrônica ainda não foi configurada.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido.' });
  const authorization = req.headers.get('Authorization');
  if (!authorization) return resposta(401, { erro: 'Você precisa estar logado.' });

  let corpo: { acao?: string; contrato_id?: string; texto?: string; teste?: boolean; atualizar_contato?: boolean };
  try {
    corpo = await req.json();
  } catch {
    return resposta(400, { erro: 'Dados inválidos.' });
  }

  const deps = dependencias(authorization);
  const fluxo = criarFluxo(deps);
  try {
    switch (corpo.acao) {
      case 'previa': {
        if (typeof corpo.texto !== 'string') return resposta(400, { erro: 'Dados inválidos.' });
        const pdf = await fluxo.previa(corpo.contrato_id ?? null, corpo.texto, Boolean(corpo.teste));
        return new Response(pdf, { status: 200, headers: { ...cors, 'Content-Type': 'application/pdf' } });
      }
      case 'enviar':
      case 'reenviar': {
        if (!corpo.contrato_id) return resposta(400, { erro: 'Dados inválidos.' });
        if (!zapsignConfigurada()) return resposta(503, { erro: NAO_CONFIGURADA });
        if (corpo.acao === 'enviar') await fluxo.enviar(corpo.contrato_id);
        else await fluxo.reenviar(corpo.contrato_id, Boolean(corpo.atualizar_contato));
        return resposta(200, { ok: true });
      }
      case 'processar_cancelamentos': {
        if (!zapsignConfigurada()) return resposta(503, { erro: NAO_CONFIGURADA });
        // só quem mexe na esteira dispara; a função não recebe dados do usuário
        if (!(await deps.rpcUsuario('app_equipe_pode', { p_permissao: 'contratos.mover' }))) {
          return resposta(403, { erro: 'Você não tem permissão para esta ação.' });
        }
        await fluxo.processarCancelamentos();
        return resposta(200, { ok: true });
      }
      default:
        return resposta(400, { erro: 'Ação inválida.' });
    }
  } catch (e) {
    if (e instanceof ErroUsuario) return resposta(400, { erro: e.message });
    console.error(e);
    return resposta(500, { erro: 'Erro inesperado. Tente de novo.' });
  }
});
