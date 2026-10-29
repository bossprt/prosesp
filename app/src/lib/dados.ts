import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mensagemErro } from './erros';

/** Lança o erro do Supabase (para o react-query e o mensagemErro tratarem). */
export async function exigir<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

export function useConsulta<T>(chave: unknown[], fn: () => Promise<T>, habilitado = true) {
  return useQuery({ queryKey: chave, queryFn: fn, enabled: habilitado });
}

/** Mutação que invalida as chaves informadas e expõe a mensagem de erro em português. */
export function useAcao<A, R>(fn: (arg: A) => Promise<R>, invalidar: unknown[][]) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(invalidar.map((k) => qc.invalidateQueries({ queryKey: k }))),
  });
  return { ...m, erro: m.error ? mensagemErro(m.error) : '' };
}
