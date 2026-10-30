// Monta as dependências do fluxo dentro das Edge Functions (Deno). A chave de serviço fica só aqui.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { ErroUsuario, type Dependencias } from './fluxo.ts';
import { criarClienteZapSign } from './zapsign.ts';

export const BUCKET = 'contratos-assinatura';
const ZAPSIGN_SANDBOX = 'https://sandbox.zapsign.com.br';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function resposta(status: number, corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function zapsignUrl(): string {
  return Deno.env.get('ZAPSIGN_URL') || ZAPSIGN_SANDBOX;
}

export function zapsignConfigurada(): boolean {
  return Boolean(Deno.env.get('ZAPSIGN_API_TOKEN'));
}

/** authorization = cabeçalho do usuário (null no aviso da ZapSign, que só usa a chave de serviço). */
export function dependencias(authorization: string | null): Dependencias {
  const url = Deno.env.get('SUPABASE_URL')!;
  const servico = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const usuario = authorization
    ? createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      })
    : null;

  const rpc = async (cliente: typeof servico, nome: string, args: Record<string, unknown>) => {
    const { data, error } = await cliente.rpc(nome, args);
    if (error) {
      // erro de regra do banco (raise exception) já vem em português
      if (error.code === 'P0001' || error.code === '42501') throw new ErroUsuario(error.message);
      throw new Error(`${nome}: ${error.message}`);
    }
    return data;
  };

  return {
    rpcUsuario: (nome, args) => {
      if (!usuario) throw new ErroUsuario('Você precisa estar logado.');
      return rpc(usuario, nome, args);
    },
    rpcServico: (nome, args) => rpc(servico, nome, args),
    upload: async (caminho, bytes, tipo) => {
      const { error } = await servico.storage.from(BUCKET).upload(caminho, bytes, { contentType: tipo, upsert: true });
      if (error) throw new Error(`upload ${caminho}: ${error.message}`);
    },
    envioPorToken: async (token) => {
      const { data } = await servico.from('contrato_assinaturas').select('id, contrato_id, situacao')
        .eq('zapsign_token', token).maybeSingle();
      return data;
    },
    cancelamentosPendentes: async () => {
      const { data } = await servico.from('contrato_assinaturas').select('id, zapsign_token')
        .eq('situacao', 'cancelamento_pendente').not('zapsign_token', 'is', null);
      return data ?? [];
    },
    zapsign: criarClienteZapSign({
      url: zapsignUrl(),
      token: Deno.env.get('ZAPSIGN_API_TOKEN') ?? '',
    }),
    // Só a API de produção conta como produção (sandbox e ZapSign falsa local aceitam modelo de teste).
    zapsignSandbox: !zapsignUrl().startsWith('https://api.zapsign.com.br'),
  };
}
