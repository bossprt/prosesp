import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { comoDono, comoUsuario, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { inserirContratoBase } from './contratos_fixture';
import { cenarioEsteira, digitar, forcarFase, type Cenario } from './esteira_fixture';

const LIBERAR = `select public.liberar_credito($1, $2::date)`;
let seqAde = 5000000;

/** Contrato digitado, levado a aguardando_pagamento com ADE ativo (e ADE de mensalidade se houver proposta). */
async function prontoParaLiberar(c: pg.PoolClient, s: Cenario, proposta: string | null = null, extra: Record<string, unknown> = {}) {
  const id = await digitar(c, s, extra);
  await forcarFase(c, id, 'aguardando_pagamento', true);
  await c.query(`update public.contratos set mensalidade_proposta = $2 where id = $1`, [id, proposta]);
  seqAde += 1;
  await c.query(
    `insert into public.contrato_averbacoes (contrato_id, convenio_id, matricula_id, ade, situacao, valor_averbado)
     select id, convenio_id, matricula_id, $2, 'ativa', valor_parcela from public.contratos where id = $1`,
    [id, String(seqAde)],
  );
  if (proposta) {
    seqAde += 1;
    await c.query(
      `insert into public.mensalidade_averbacoes (matricula_id, convenio_id, contrato_origem_id, ade, situacao, valor_averbado)
       select matricula_id, convenio_id, id, $2, 'proposta', $3 from public.contratos where id = $1`,
      [id, String(seqAde), proposta],
    );
  }
  return id;
}

async function configurarConvenio(c: pg.PoolClient, s: Cenario) {
  await c.query(`update public.convenios set dia_corte = 2, dia_vencimento = 28 where id = $1`, [s.f.convenio]);
}

async function financeiro(c: pg.PoolClient) {
  const u = await criarUsuarioTeste(c, 'financeiro');
  await comoUsuario(c, u);
  return u;
}

describe('0019 liberação', () => {
  it('liberar gera 24 parcelas a partir da competência certa', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      await configurarConvenio(c, s);
      const a = await prontoParaLiberar(c, s);
      const b = await prontoParaLiberar(c, s);
      await financeiro(c);
      await c.query(LIBERAR, [a, '2026-11-02']);
      await c.query(LIBERAR, [b, '2026-11-03']);
      await comoDono(c);
      const pa = await c.query(
        `select count(*)::int as n, min(competencia)::text as primeira, min(vencimento)::text as venc, max(competencia)::text as ultima,
                sum(valor)::text as total from public.parcelas where contrato_id = $1`,
        [a],
      );
      expect(pa.rows[0]).toEqual({ n: 24, primeira: '2026-11-01', venc: '2026-11-28', ultima: '2028-10-01', total: '1468.80' });
      expect((await c.query(`select min(competencia)::text as p from public.parcelas where contrato_id = $1`, [b])).rows[0].p).toBe('2026-12-01');
      expect((await c.query(`select fase, situacao, data_liberacao::text as d, primeiro_vencimento::text as v from public.contratos where id = $1`, [a])).rows[0]).toEqual({
        fase: 'credito_liberado', situacao: 'ativo', d: '2026-11-02', v: '2026-11-28',
      });
    });
  });

  it('liberar sem dia de corte configurado mostra a mensagem', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const a = await prontoParaLiberar(c, s);
      await financeiro(c);
      expect(await erroDe(c, LIBERAR, [a, '2026-11-02'])).toBe(
        'Configure o dia de corte e o dia de vencimento do convênio antes de liberar.',
      );
    });
  });

  it('segunda liberação do mesmo contrato é recusada; operador não libera', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      await configurarConvenio(c, s);
      const a = await prontoParaLiberar(c, s);
      await comoUsuario(c, s.operador);
      expect(await erroDe(c, LIBERAR, [a, '2026-11-02'])).toBe('Você não tem permissão para esta ação.');
      await comoDono(c);
      await financeiro(c);
      await c.query(LIBERAR, [a, '2026-11-02']);
      expect(await erroDe(c, LIBERAR, [a, '2026-11-02'])).toBe('Este crédito já foi liberado.');
    });
  });

  it('refin: antigo fica renovado, parcelas futuras canceladas, anteriores abertas, averbação cancelada', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      await configurarConvenio(c, s);
      const lr = await c.query(
        `insert into public.tabela_linhas (tabela_id, vinculo_id, tipo, prazo, vigencia, fator) values ($1, $2, 'refinanciamento', 24, '[2026-01-01,)', 0.0612) returning id`,
        [s.f.tabela, s.f.efetivo],
      );
      await c.query(`insert into public.tabela_linha_comissoes (linha_id, percentual, base) values ($1, 6, 'liquido')`, [lr.rows[0].id]);
      const antigo = await prontoParaLiberar(c, s);
      await financeiro(c);
      await c.query(LIBERAR, [antigo, '2026-01-02']);
      await comoDono(c);
      const novo = await prontoParaLiberar(c, s, null, {
        tipo: 'refinanciamento',
        quitacoes: [{ contrato_quitado_id: antigo, saldo_devedor: '700.00', fonte: 'calculo' }],
      });
      await financeiro(c);
      await c.query(LIBERAR, [novo, '2026-06-02']);
      await comoDono(c);
      expect((await c.query(`select situacao from public.contratos where id = $1`, [antigo])).rows[0].situacao).toBe('renovado');
      const p = await c.query(
        `select count(*) filter (where status = 'cancelada')::int as canc, count(*) filter (where status <> 'cancelada')::int as abertas,
                min(competencia) filter (where status = 'cancelada')::text as primeira_canc
         from public.parcelas where contrato_id = $1`,
        [antigo],
      );
      expect(p.rows[0]).toEqual({ canc: 19, abertas: 5, primeira_canc: '2026-06-01' });
      expect((await c.query(`select situacao from public.contrato_averbacoes where contrato_id = $1`, [antigo])).rows[0].situacao).toBe('cancelada');
      expect((await c.query(`select reservado from public.contrato_quitacoes where contrato_id = $1`, [novo])).rows[0].reservado).toBe(false);
    });
  });

  it('primeiro contrato da matrícula cria mensalidade nova', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      await configurarConvenio(c, s);
      const a = await prontoParaLiberar(c, s, '35.00');
      await financeiro(c);
      await c.query(LIBERAR, [a, '2026-11-02']);
      await comoDono(c);
      const m = await c.query(
        `select m.situacao, v.valor, v.tipo, v.vigente_desde::text as desde from public.mensalidades m
         join public.mensalidade_valores v on v.mensalidade_id = m.id where m.matricula_id = $1`,
        [s.matricula],
      );
      expect(m.rows).toEqual([{ situacao: 'ativa', valor: '35.00', tipo: 'nova', desde: '2026-11-01' }]);
      expect((await c.query(`select situacao from public.mensalidade_averbacoes where contrato_origem_id = $1`, [a])).rows[0].situacao).toBe('ativa');
      expect((await c.query(`select public.mensalidade_vigente($1) as v`, [s.matricula])).rows[0].v).toBe('35.00');
    });
  });

  it('contrato com mensalidade maior reajusta e o ADE antigo fica migrado', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      await configurarConvenio(c, s);
      const a = await prontoParaLiberar(c, s, '35.00');
      await financeiro(c);
      await c.query(LIBERAR, [a, '2026-01-02']);
      await comoDono(c);
      const b = await prontoParaLiberar(c, s, '50.00');
      await financeiro(c);
      await c.query(LIBERAR, [b, '2026-06-02']);
      await comoDono(c);
      const v = await c.query(
        `select v.valor, v.tipo from public.mensalidade_valores v join public.mensalidades m on m.id = v.mensalidade_id
         where m.matricula_id = $1 order by v.vigente_desde`,
        [s.matricula],
      );
      expect(v.rows).toEqual([
        { valor: '35.00', tipo: 'nova' },
        { valor: '50.00', tipo: 'reajuste' },
      ]);
      const av = await c.query(
        `select valor_averbado, situacao, migrada_para is not null as ligada from public.mensalidade_averbacoes where matricula_id = $1 order by valor_averbado`,
        [s.matricula],
      );
      expect(av.rows).toEqual([
        { valor_averbado: '35.00', situacao: 'migrada', ligada: true },
        { valor_averbado: '50.00', situacao: 'ativa', ligada: false },
      ]);
    });
  });

  it('contrato com a mesma mensalidade não muda nada', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      await configurarConvenio(c, s);
      const a = await prontoParaLiberar(c, s, '35.00');
      await financeiro(c);
      await c.query(LIBERAR, [a, '2026-01-02']);
      await comoDono(c);
      const b = await prontoParaLiberar(c, s, null);
      await financeiro(c);
      await c.query(LIBERAR, [b, '2026-06-02']);
      await comoDono(c);
      expect((await c.query(`select count(*)::int as n from public.mensalidade_valores`)).rows[0].n).toBe(1);
    });
  });

  it('dois contratos aumentando: vale o maior e o proposto menor fica migrado', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      await configurarConvenio(c, s);
      const a = await prontoParaLiberar(c, s, '50.00');
      const b = await prontoParaLiberar(c, s, '45.00');
      await financeiro(c);
      await c.query(LIBERAR, [a, '2026-11-02']);
      await c.query(LIBERAR, [b, '2026-11-02']);
      await comoDono(c);
      expect((await c.query(`select public.mensalidade_vigente($1) as v`, [s.matricula])).rows[0].v).toBe('50.00');
      expect((await c.query(`select situacao from public.mensalidade_averbacoes where contrato_origem_id = $1`, [b])).rows[0].situacao).toBe(
        'migrada',
      );
    });
  });

  it('gerar_mensalidades_competencia é idempotente', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      await configurarConvenio(c, s);
      const a = await prontoParaLiberar(c, s, '35.00');
      await financeiro(c);
      await c.query(LIBERAR, [a, '2026-11-02']);
      expect((await c.query(`select public.gerar_mensalidades_competencia('2026-12-01') as n`)).rows[0].n).toBe(1);
      expect((await c.query(`select public.gerar_mensalidades_competencia('2026-12-01') as n`)).rows[0].n).toBe(0);
      await comoDono(c);
      expect((await c.query(`select count(*)::int as n from public.mensalidade_parcelas`)).rows[0].n).toBe(2);
    });
  });

  it('reaverbar mantém pagamentos na averbação de origem e move o saldo', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      await configurarConvenio(c, s);
      const a = await prontoParaLiberar(c, s);
      await financeiro(c);
      await c.query(LIBERAR, [a, '2026-11-02']);
      await comoDono(c);
      const antiga = (await c.query(`select id from public.contrato_averbacoes where contrato_id = $1 and situacao = 'ativa'`, [a])).rows[0].id;
      const p1 = (await c.query(`select id from public.parcelas where contrato_id = $1 and numero = 1`, [a])).rows[0].id;
      await c.query(
        `insert into public.parcela_pagamentos (parcela_id, valor, competencia_desconto, averbacao_id) values ($1, 30, '2026-11-01', $2)`,
        [p1, antiga],
      );
      await c.query(`update public.parcelas set status = 'parcial' where id = $1`, [p1]);
      await comoUsuario(c, s.operador);
      await c.query(`select public.reaverbar($1, '9999999', '9999999')`, [a]);
      await comoDono(c);
      const nova = (await c.query(`select id from public.contrato_averbacoes where contrato_id = $1 and situacao = 'ativa'`, [a])).rows[0].id;
      expect((await c.query(`select averbacao_id from public.parcelas where id = $1`, [p1])).rows[0].averbacao_id).toBe(nova);
      expect((await c.query(`select averbacao_id from public.parcela_pagamentos where parcela_id = $1`, [p1])).rows[0].averbacao_id).toBe(antiga);
      expect((await c.query(`select saldo from public.v_parcelas_saldo where parcela_id = $1`, [p1])).rows[0].saldo).toBe('31.20');
    });
  });
});

describe('0019 liberação concorrente', () => {
  it('duas liberações ao mesmo tempo geram parcelas uma vez só', async () => {
    const url = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    const dono = new pg.Client({ connectionString: url });
    const a = new pg.Client({ connectionString: url });
    const b = new pg.Client({ connectionString: url });
    await Promise.all([dono.connect(), a.connect(), b.connect()]);
    let ids: { contrato: string; cliente: string; usuario: string } | null = null;
    const inicio = (await dono.query(`select clock_timestamp() as t`)).rows[0].t;
    try {
      // dados commitados (as duas conexões precisam enxergar o mesmo contrato)
      await dono.query('begin');
      const k = await inserirContratoBase(dono as unknown as pg.PoolClient, { fase: 'aguardando_pagamento' });
      await dono.query(`update public.contratos set valores_travados_em = now() where id = $1`, [k.id]);
      const conv = (await dono.query(`select convenio_id from public.contratos where id = $1`, [k.id])).rows[0].convenio_id;
      await dono.query(`update public.convenios set dia_corte = 2, dia_vencimento = 28 where id = $1`, [conv]);
      const usuario = await criarUsuarioTeste(dono as unknown as pg.PoolClient, 'financeiro');
      await dono.query('commit');
      ids = { contrato: k.id, cliente: k.clienteId, usuario };

      for (const cli of [a, b]) {
        await cli.query('begin');
        await comoUsuario(cli as unknown as pg.PoolClient, usuario);
      }
      await a.query(LIBERAR, [k.id, '2026-11-02']);
      const segunda = b.query(LIBERAR, [k.id, '2026-11-02']).then(
        () => 'ok',
        (e: Error) => e.message,
      );
      await a.query('commit');
      expect(await segunda).toBe('Este crédito já foi liberado.');
      await b.query('rollback');
      expect((await dono.query(`select count(*)::int as n from public.parcelas where contrato_id = $1`, [k.id])).rows[0].n).toBe(24);
    } finally {
      if (ids) {
        // limpeza dos dados commitados (desliga triggers de imutabilidade só nesta sessão)
        await dono.query(`set session_replication_role = replica`);
        await dono.query(`delete from public.contrato_eventos where contrato_id = $1`, [ids.contrato]);
        await dono.query(`set session_replication_role = origin`);
        await dono.query(`delete from public.contratos where id = $1`, [ids.contrato]);
        await dono.query(`delete from public.cliente_matriculas where cliente_id = $1`, [ids.cliente]);
        await dono.query(`delete from public.cliente_historico where cliente_id = $1`, [ids.cliente]);
        await dono.query(`delete from public.clientes where id = $1`, [ids.cliente]);
        await dono.query(`delete from public.usuarios where id = $1`, [ids.usuario]);
        await dono.query(`delete from auth.users where id = $1`, [ids.usuario]);
        await dono.query(`update public.convenios set dia_corte = null, dia_vencimento = null where nome = 'Governo do Acre'`);
        await dono.query(`set session_replication_role = replica`);
        await dono.query(`delete from public.auditoria where em >= $1`, [inicio]);
        await dono.query(`set session_replication_role = origin`);
      }
      await Promise.all([dono.end(), a.end(), b.end()]);
    }
  });
});
