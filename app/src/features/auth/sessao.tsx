import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAcesso, type Acesso } from '../../lib/permissoes';
import { supabase } from '../../lib/supabase';

interface Sessao {
  sessao: Session | null;
  carregando: boolean;
  acesso: Acesso | null;
  pode: (chave: string) => boolean;
  ehParceiro: boolean;
}

const Ctx = createContext<Sessao | null>(null);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [iniciando, setIniciando] = useState(true);

  const queryClient = useQueryClient();
  useEffect(() => {
    let usuarioAtual: string | undefined;
    supabase.auth.getSession().then(({ data }) => {
      usuarioAtual = data.session?.user.id;
      setSessao(data.session);
      setIniciando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => {
      // saiu ou trocou de usuário: nada do anterior pode aparecer na tela do próximo
      if (s?.user.id !== usuarioAtual) queryClient.clear();
      usuarioAtual = s?.user.id;
      setSessao(s);
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const consulta = useAcesso(sessao?.user.id);
  const acesso = consulta.data ?? null;
  const valor: Sessao = {
    sessao,
    carregando: iniciando || (Boolean(sessao) && consulta.isLoading),
    acesso,
    pode: (chave) => Boolean(acesso?.permissoes.includes(chave)),
    ehParceiro: acesso?.perfil === 'parceiro',
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSessao(): Sessao {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSessao fora do SessaoProvider');
  return v;
}
