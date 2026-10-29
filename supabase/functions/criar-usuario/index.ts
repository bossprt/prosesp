// Cria um usuário do sistema: convida por e-mail (Auth) e grava o perfil em public.usuarios.
// Só quem tem a permissão usuarios.gerenciar pode chamar. A chave de serviço fica só aqui (servidor).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const PERFIS = ['administrador', 'gerente', 'financeiro', 'operador', 'consulta', 'parceiro'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function resposta(status: number, corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido.' });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return resposta(401, { erro: 'Você precisa estar logado.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const chamador = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: pode, error: erroPermissao } = await chamador.rpc('app_pode', { p_permissao: 'usuarios.gerenciar' });
  if (erroPermissao || pode !== true) {
    return resposta(403, { erro: 'Você não tem permissão para esta ação.' });
  }

  let corpo: { nome?: string; email?: string; perfil?: string; parceiro_id?: string | null };
  try {
    corpo = await req.json();
  } catch {
    return resposta(400, { erro: 'Dados inválidos.' });
  }
  const nome = corpo.nome?.trim();
  const email = corpo.email?.trim().toLowerCase();
  const perfil = corpo.perfil;
  const parceiroId = corpo.parceiro_id || null;
  if (!nome) return resposta(400, { erro: 'Informe o nome.' });
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return resposta(400, { erro: 'Informe um e-mail válido.' });
  if (!perfil || !PERFIS.includes(perfil)) return resposta(400, { erro: 'Perfil inválido.' });
  if ((perfil === 'parceiro') !== Boolean(parceiroId)) {
    return resposta(400, { erro: 'Usuário parceiro precisa estar ligado a um parceiro (e só ele).' });
  }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: existente } = await admin.from('usuarios').select('id').eq('email', email).maybeSingle();
  if (existente) return resposta(400, { erro: 'Já existe um usuário com este e-mail.' });

  const { data: convite, error: erroConvite } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: req.headers.get('origin') ? `${req.headers.get('origin')}/redefinir-senha` : undefined,
  });
  if (erroConvite || !convite.user) {
    const jaExiste = /already|registered|exists/i.test(erroConvite?.message ?? '');
    return resposta(400, { erro: jaExiste ? 'Já existe um usuário com este e-mail.' : 'Não foi possível enviar o convite.' });
  }

  // grava com o token de quem chamou: a RLS confere a permissão e a auditoria registra o autor
  const { error: erroPerfil } = await chamador
    .from('usuarios')
    .insert({ id: convite.user.id, nome, email, perfil, parceiro_id: parceiroId });
  if (erroPerfil) {
    // só desfaz o login se ele acabou de ser criado por este convite
    const recemCriado = Date.now() - new Date(convite.user.created_at).getTime() < 60_000;
    if (recemCriado) await admin.auth.admin.deleteUser(convite.user.id);
    return resposta(400, { erro: 'Não foi possível gravar o usuário.' });
  }

  return resposta(200, { id: convite.user.id });
});
