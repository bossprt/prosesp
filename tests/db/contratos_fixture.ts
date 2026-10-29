import type pg from 'pg';
import { criarClienteTeste } from './helpers';

export interface ContratoTeste {
  id: string;
  clienteId: string;
  matriculaId: string;
}

/**
 * Insere um contrato direto (como dono, sem RPC): fator 0.0612, prazo 24, parcela 61.20,
 * mensalidade 35. Cria cliente + matrícula (Gov. Acre / Efetivo) se não for informado.
 */
export async function inserirContratoBase(
  c: pg.PoolClient,
  opts: {
    cliente?: { id: string; matriculaId: string };
    parceiroId?: string | null;
    fase?: string;
    situacao?: string;
    tipo?: string;
    valor?: string;
  } = {},
): Promise<ContratoTeste> {
  let cliente = opts.cliente;
  if (!cliente) {
    const cli = await criarClienteTeste(c);
    const m = await c.query(`select id from public.cliente_matriculas where cliente_id = $1`, [cli.id]);
    cliente = { id: cli.id, matriculaId: m.rows[0].id };
  }
  const r = await c.query(
    `insert into public.contratos (cliente_id, matricula_id, tipo, parceiro_id, fase, situacao,
       fator, prazo, valor_parcela, valor_bruto, valor_mensalidade_tabela)
     values ($1, $2, $3::public.tipo_contrato, $4, $5::public.fase_contrato, $6::public.situacao_contrato,
       0.0612, 24, 61.20, $7, 35) returning id`,
    [
      cliente.id,
      cliente.matriculaId,
      opts.tipo ?? 'novo',
      opts.parceiroId ?? null,
      opts.fase ?? 'digitado',
      opts.situacao ?? 'em_andamento',
      opts.valor ?? '1000',
    ],
  );
  return { id: r.rows[0].id, clienteId: cliente.id, matriculaId: cliente.matriculaId };
}
