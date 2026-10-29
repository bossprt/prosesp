import { exigir, useConsulta } from '../../lib/dados';
import { supabase } from '../../lib/supabase';
import type { ConvenioOpcao } from '../simulador/SimuladorForm';

/** Convênios ativos com seus vínculos ativos (para selects). */
export function useConveniosOpcoes() {
  return useConsulta(['convenios-opcoes'], async (): Promise<ConvenioOpcao[]> => {
    const dados = await exigir(
      supabase.from('convenios').select('id, nome, convenio_vinculos(id, nome, ativo)').eq('ativo', true).order('nome'),
    );
    return (dados ?? []).map((c) => ({
      id: c.id,
      nome: c.nome,
      vinculos: c.convenio_vinculos.filter((v) => v.ativo).map((v) => ({ id: v.id, nome: v.nome })),
    }));
  });
}
