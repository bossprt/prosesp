import { Pagina } from '../../components/ui';
import { exigir } from '../../lib/dados';
import { supabase } from '../../lib/supabase';
import { useConveniosOpcoes } from '../convenios/useConvenios';
import { SimuladorForm, type PedidoSimulacao, type ResultadoSimulacao } from './SimuladorForm';

async function simular(p: PedidoSimulacao): Promise<ResultadoSimulacao> {
  const comum = {
    p_convenio_id: p.convenioId,
    p_vinculo_id: p.vinculoId,
    p_tipo: p.tipo,
    p_prazo: p.prazo,
    p_data_nascimento: p.nascimento ?? undefined,
  };
  // valores de dinheiro seguem como texto decimal: o banco calcula em numeric
  const linhas =
    p.modo === 'valor'
      ? await exigir(supabase.rpc('simular_por_valor', { ...comum, p_valor: p.quantia as unknown as number }))
      : await exigir(supabase.rpc('simular_por_parcela', { ...comum, p_parcela: p.quantia as unknown as number }));
  const r = linhas?.[0];
  if (!r) throw new Error('Nenhuma tabela vigente atende esta simulação.');
  return {
    fator: String(r.fator),
    valor: String(r.valor),
    parcela: String(r.parcela),
    valor_mensalidade: r.valor_mensalidade === null ? null : String(r.valor_mensalidade),
    percentual_comissao: r.percentual_comissao === null ? null : String(r.percentual_comissao),
    base_comissao: r.base_comissao,
  };
}

export function SimuladorPage() {
  const convenios = useConveniosOpcoes();
  return (
    <Pagina titulo="Simulador">
      <SimuladorForm convenios={convenios.data ?? []} onSimular={simular} />
    </Pagina>
  );
}
