import type pg from 'pg';
import { comoDono, comoUsuario, criarClienteTeste, criarUsuarioTeste } from './helpers';
import { montarTabela, type Fixture } from './tabelas_fixture';

export interface Cenario {
  f: Fixture;
  cliente: string;
  matricula: string;
  operador: string;
  gerente: string;
}

/** Tabela do Acre, cliente completo, operador e gerente. Fica como dono no fim. */
export async function cenarioEsteira(c: pg.PoolClient): Promise<Cenario> {
  const f = await montarTabela(c);
  const cli = await criarClienteTeste(c);
  await c.query(`update public.clientes set data_nascimento = '1980-05-10', email = 'cli@prosesp.test' where id = $1`, [cli.id]);
  const matricula = (await c.query(`select id from public.cliente_matriculas where cliente_id = $1`, [cli.id])).rows[0].id;
  const operador = await criarUsuarioTeste(c, 'operador');
  const gerente = await criarUsuarioTeste(c, 'gerente');
  return { f, cliente: cli.id, matricula, operador, gerente };
}

/** Digita um contrato novo de R$ 1.000 em 24x como operador e volta a dono. */
export async function digitar(c: pg.PoolClient, s: Cenario, extra: Record<string, unknown> = {}): Promise<string> {
  await comoUsuario(c, s.operador);
  const r = await c.query(`select public.digitar_contrato($1) as id`, [
    { cliente_id: s.cliente, matricula_id: s.matricula, tipo: 'novo', prazo: 24, modo: 'valor', quantia: '1000.00', ...extra },
  ]);
  await comoDono(c);
  return r.rows[0].id;
}

let seqAdeFixture = 7000000;
/**
 * Digita, leva a aguardando_pagamento com ADE (e ADE de mensalidade se houver proposta) e libera
 * como um financeiro novo. Exige convênio com dia de corte/vencimento. Volta a dono.
 */
export async function contratoLiberado(
  c: pg.PoolClient,
  s: Cenario,
  data: string,
  proposta: string | null = null,
): Promise<string> {
  const id = await digitar(c, s);
  await forcarFase(c, id, 'aguardando_pagamento', true);
  await c.query(`update public.contratos set mensalidade_proposta = $2 where id = $1`, [id, proposta]);
  seqAdeFixture += 1;
  await c.query(
    `insert into public.contrato_averbacoes (contrato_id, convenio_id, matricula_id, ade, situacao, valor_averbado)
     select id, convenio_id, matricula_id, $2, 'ativa', valor_parcela from public.contratos where id = $1`,
    [id, String(seqAdeFixture)],
  );
  if (proposta) {
    seqAdeFixture += 1;
    await c.query(
      `insert into public.mensalidade_averbacoes (matricula_id, convenio_id, contrato_origem_id, ade, situacao, valor_averbado)
       select matricula_id, convenio_id, id, $2, 'proposta', $3 from public.contratos where id = $1`,
      [id, String(seqAdeFixture), proposta],
    );
  }
  const fin = await criarUsuarioTeste(c, 'financeiro');
  await comoUsuario(c, fin);
  await c.query(`select public.liberar_credito($1, $2::date)`, [id, data]);
  await comoDono(c);
  return id;
}

/** Coloca o contrato direto numa fase (como dono), sem passar pela esteira. */
export async function forcarFase(c: pg.PoolClient, id: string, fase: string, travar = false): Promise<void> {
  await c.query(
    `update public.contratos set fase = $2::public.fase_contrato,
       valores_travados_em = case when $3 then coalesce(valores_travados_em, now()) else valores_travados_em end
     where id = $1`,
    [id, fase, travar],
  );
}
