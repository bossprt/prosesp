import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type Perfil = 'administrador' | 'gerente' | 'financeiro' | 'operador' | 'consulta' | 'parceiro';

export interface ItemMenu {
  rota: string;
  rotulo: string;
  permissao: string;
  publico: 'equipe' | 'parceiro' | 'todos';
}

const MENU: ItemMenu[] = [
  { rota: '/simulador', rotulo: 'Simulador', permissao: 'simulador.usar', publico: 'todos' },
  { rota: '/clientes', rotulo: 'Clientes', permissao: 'clientes.ver', publico: 'equipe' },
  { rota: '/parceiro/clientes', rotulo: 'Meus clientes', permissao: 'clientes.ver', publico: 'parceiro' },
  { rota: '/convenios', rotulo: 'Convênios', permissao: 'convenios.ver', publico: 'equipe' },
  { rota: '/tabelas', rotulo: 'Tabelas', permissao: 'tabelas.editar', publico: 'equipe' },
  { rota: '/parceiros', rotulo: 'Parceiros', permissao: 'parceiros.ver', publico: 'equipe' },
  { rota: '/apoio', rotulo: 'Bancos e origens', permissao: 'apoio.editar', publico: 'equipe' },
  { rota: '/aprovacoes', rotulo: 'Aprovações', permissao: 'clientes.aprovar_alteracoes', publico: 'equipe' },
  { rota: '/usuarios', rotulo: 'Usuários', permissao: 'usuarios.gerenciar', publico: 'equipe' },
  { rota: '/permissoes', rotulo: 'Permissões', permissao: 'permissoes.gerenciar', publico: 'equipe' },
  { rota: '/auditoria', rotulo: 'Auditoria', permissao: 'auditoria.ver', publico: 'equipe' },
];

export function itensMenu(pode: (chave: string) => boolean, ehParceiro: boolean): ItemMenu[] {
  return MENU.filter(
    (i) => pode(i.permissao) && (i.publico === 'todos' || (i.publico === 'parceiro') === ehParceiro),
  );
}

export interface Acesso {
  id: string;
  nome: string;
  perfil: Perfil;
  parceiroId: string | null;
  permissoes: string[];
}

/** Perfil e permissões do usuário logado (a decisão real é sempre do banco). */
export function useAcesso(userId: string | undefined) {
  return useQuery({
    queryKey: ['acesso', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Acesso | null> => {
      const { data: u, error } = await supabase
        .from('usuarios')
        .select('id, nome, perfil, parceiro_id, ativo')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      if (!u || !u.ativo) return null;
      const { data: pp, error: e2 } = await supabase
        .from('perfil_permissoes')
        .select('permissao')
        .eq('perfil', u.perfil);
      if (e2) throw e2;
      return {
        id: u.id,
        nome: u.nome,
        perfil: u.perfil,
        parceiroId: u.parceiro_id,
        permissoes: (pp ?? []).map((p) => p.permissao),
      };
    },
  });
}
