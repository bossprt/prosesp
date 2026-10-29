const GENERICA = 'Algo deu errado. Tente de novo ou fale com o administrador.';

/** Converte qualquer erro (Supabase, rede, JS) numa mensagem em português claro. */
export function mensagemErro(e: unknown): string {
  if (!e) return GENERICA;
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) {
    return 'Sem conexão com o servidor. Tente de novo.';
  }
  const { code, message = '' } = e as { code?: string; message?: string };
  switch (code) {
    case '23505':
      return message.includes('clientes_cpf_key') ? 'Já existe um cliente com este CPF.' : 'Este registro já existe.';
    case '23P01':
      return 'Já existe uma linha de tabela que atende este mesmo caso.';
    case '42501':
      return 'Você não tem permissão para esta ação.';
    case 'P0001':
      return message || GENERICA;
  }
  if (/row-level security/i.test(message)) return 'Você não tem permissão para esta ação.';
  return GENERICA;
}
