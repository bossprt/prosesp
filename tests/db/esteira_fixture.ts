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

/** Coloca o contrato direto numa fase (como dono), sem passar pela esteira. */
export async function forcarFase(c: pg.PoolClient, id: string, fase: string, travar = false): Promise<void> {
  await c.query(
    `update public.contratos set fase = $2::public.fase_contrato,
       valores_travados_em = case when $3 then coalesce(valores_travados_em, now()) else valores_travados_em end
     where id = $1`,
    [id, fase, travar],
  );
}
