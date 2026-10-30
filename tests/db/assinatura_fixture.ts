import type pg from 'pg';
import { comoDono, comoUsuario } from './helpers';
import { cenarioEsteira, digitar, forcarFase, type Cenario } from './esteira_fixture';

export interface CenarioAss extends Cenario {
  convenio: string;
  contrato: string;
}

let seqAde = 8100000;
/** Contrato averbado (com ADE) no Acre, que tem modelo ativo. Fica como dono. */
export async function contratoAverbado(c: pg.PoolClient, s?: Cenario): Promise<CenarioAss> {
  const base = s ?? (await cenarioEsteira(c));
  const convenio = (await c.query(
    `update public.convenios set dia_corte = 2, dia_vencimento = 28 where nome = 'Governo do Acre' returning id`,
  )).rows[0].id;
  if (!(await c.query(`select 1 from public.contrato_modelos where convenio_id = $1 and ativo`, [convenio])).rowCount) {
    await c.query(`insert into public.contrato_modelos (convenio_id, versao, texto) values ($1, 1, 'Contrato de {cliente.nome}')`, [convenio]);
  }
  const contrato = await digitar(c, base);
  await forcarFase(c, contrato, 'averbado', true);
  seqAde += 1;
  await c.query(
    `insert into public.contrato_averbacoes (contrato_id, convenio_id, matricula_id, ade, situacao, valor_averbado)
     select id, convenio_id, matricula_id, $2, 'ativa', valor_parcela from public.contratos where id = $1`,
    [contrato, String(seqAde)],
  );
  return { ...base, convenio, contrato };
}

/** Age como as Edge Functions (chave de serviço). */
export async function comoServico(c: pg.PoolClient): Promise<void> {
  await c.query('set local role service_role');
  await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
}

/** Prepara como operador e devolve o resultado (volta a dono). */
export async function preparar(c: pg.PoolClient, s: CenarioAss): Promise<{ assinatura_id: string; [k: string]: unknown }> {
  await comoUsuario(c, s.operador);
  const r = await c.query(`select public.assinatura_preparar($1) as r`, [s.contrato]);
  await comoDono(c);
  return r.rows[0].r;
}

let seqToken = 0;
/** Prepara e registra o envio (contrato vai para aguardando_assinatura). Devolve id e token. */
export async function enviado(c: pg.PoolClient, s: CenarioAss): Promise<{ id: string; token: string }> {
  const p = await preparar(c, s);
  seqToken += 1;
  const token = `doc-${Date.now()}-${seqToken}`;
  await comoServico(c);
  await c.query(`select public._assinatura_registrar_envio($1, $2, $3, '[]')`, [p.assinatura_id, `${s.contrato}/${p.assinatura_id}/enviado.pdf`, token]);
  await comoDono(c);
  return { id: p.assinatura_id, token };
}

/** Envio já assinado pelo cliente. */
export async function assinado(c: pg.PoolClient, s: CenarioAss): Promise<{ id: string; token: string }> {
  const e = await enviado(c, s);
  await comoServico(c);
  await c.query(`select public._assinatura_atualizar($1, 'assinado', $2, '{"ip":"1.2.3.4"}')`, [e.token, `${s.contrato}/${e.id}/assinado.pdf`]);
  await comoDono(c);
  return e;
}
