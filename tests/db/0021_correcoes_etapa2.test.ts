import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { cenarioEsteira, contratoLiberado, digitar, forcarFase, type Cenario } from './esteira_fixture';

const LIBERAR = `select public.liberar_credito($1, '2026-11-02')`;

async function preparar(c: pg.PoolClient): Promise<Cenario> {
  const s = await cenarioEsteira(c);
  await c.query(`update public.convenios set dia_corte = 2, dia_vencimento = 28 where id = $1`, [s.f.convenio]);
  const lr = await c.query(
    `insert into public.tabela_linhas (tabela_id, vinculo_id, tipo, prazo, vigencia, fator) values ($1, $2, 'refinanciamento', 24, '[2026-01-01,)', 0.0612) returning id`,
    [s.f.tabela, s.f.efetivo],
  );
  await c.query(`insert into public.tabela_linha_comissoes (linha_id, percentual, base) values ($1, 6, 'liquido')`, [lr.rows[0].id]);
  return s;
}

/** Contrato pronto para liberar: aguardando pagamento com ADE ativo e sem mexer na mensalidade. */
async function aguardandoPagamento(c: pg.PoolClient, s: Cenario, extra: Record<string, unknown> = {}) {
  const id = await digitar(c, s, extra);
  await forcarFase(c, id, 'aguardando_pagamento', true);
  await c.query(`update public.contratos set mensalidade_proposta = null where id = $1`, [id]);
  await c.query(
    `insert into public.contrato_averbacoes (contrato_id, convenio_id, matricula_id, ade, situacao, valor_averbado)
     select id, convenio_id, matricula_id, '88' || numero, 'ativa', valor_parcela from public.contratos where id = $1`,
    [id],
  );
  return id;
}

async function financeiro(c: pg.PoolClient) {
  await comoUsuario(c, await criarUsuarioTeste(c, 'financeiro'));
}

describe('0021 correções da revisão da Etapa 2', () => {
  it('liberação recusa refin cujo contrato quitado mudou de situação', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const antigo = await contratoLiberado(c, s, '2026-01-02');
      const novo = await aguardandoPagamento(c, s, {
        tipo: 'refinanciamento',
        quitacoes: [{ contrato_quitado_id: antigo, saldo_devedor: '500.00', fonte: 'calculo' }],
      });
      await c.query(`update public.contratos set situacao = 'prejuizo' where id = $1`, [antigo]);
      const n = (await c.query(`select numero from public.contratos where id = $1`, [antigo])).rows[0].numero;
      await financeiro(c);
      expect(await erroDe(c, LIBERAR, [novo])).toBe(
        `O contrato nº ${n} que seria quitado não está mais ativo nesta matrícula. Revise o refinanciamento.`,
      );
    });
  });

  it('liberação recusa contrato com ajuste pendente na averbadora', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await aguardandoPagamento(c, s);
      await c.query(`insert into public.pendencias_averbadora (tipo, contrato_id, motivo) values ('ajustar', $1, 'valor mudou')`, [id]);
      await financeiro(c);
      expect(await erroDe(c, LIBERAR, [id])).toBe('Há ajuste pendente na averbadora para este contrato. Resolva antes de liberar.');
    });
  });

  it('liberação recusa quando o ADE da mensalidade falta ou tem outro valor', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await aguardandoPagamento(c, s);
      await c.query(`update public.contratos set mensalidade_proposta = 50 where id = $1`, [id]);
      await financeiro(c);
      expect(await erroDe(c, LIBERAR, [id])).toBe('Falta registrar o ADE da mensalidade deste contrato.');
      await comoDono(c);
      await c.query(
        `insert into public.mensalidade_averbacoes (matricula_id, convenio_id, contrato_origem_id, ade, situacao, valor_averbado)
         select matricula_id, convenio_id, id, '7777777', 'proposta', 35 from public.contratos where id = $1`,
        [id],
      );
      await financeiro(c);
      expect(await erroDe(c, LIBERAR, [id])).toBe(
        'O ADE da mensalidade foi registrado com outro valor. Cancele-o na averbadora e registre de novo.',
      );
    });
  });

  it('reaverbar e migrar recusam contrato encerrado', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await contratoLiberado(c, s, '2026-11-02');
      await c.query(`update public.contratos set situacao = 'prejuizo' where id = $1`, [id]);
      await comoUsuario(c, s.operador);
      expect(await erroDe(c, `select public.reaverbar($1, '4444444', '4444444')`, [id])).toBe(
        'Este contrato não aceita mudança de averbação na situação atual.',
      );
    });
  });

  it('valores NaN são recusados', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const antigo = await contratoLiberado(c, s, '2026-01-02');
      await comoUsuario(c, s.operador);
      const d = {
        cliente_id: s.cliente, matricula_id: s.matricula, tipo: 'refinanciamento', prazo: 24, modo: 'valor', quantia: '1000.00',
        quitacoes: [{ contrato_quitado_id: antigo, saldo_devedor: 'NaN', fonte: 'calculo' }],
      };
      expect(await erroDe(c, `select public.digitar_contrato($1)`, [d])).toBe('Valor inválido: NaN.');
      expect(await erroDe(c, `select public.digitar_contrato($1)`, [{ ...d, tipo: 'novo', quitacoes: [], quantia: 'NaN' }])).toBe(
        'Valor inválido: NaN.',
      );
    });
  });

  it('trocar a matrícula de contrato averbado cria pendência de ajuste', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await aguardandoPagamento(c, s);
      const nova = (
        await c.query(
          `insert into public.cliente_matriculas (cliente_id, convenio_id, vinculo_id, matricula) values ($1, $2, $3, '555666') returning id`,
          [s.cliente, s.f.convenio, s.f.efetivo],
        )
      ).rows[0].id;
      await comoUsuario(c, s.gerente);
      await c.query(`select public.editar_contrato($1, $2, 'matrícula errada')`, [
        id,
        { cliente_id: s.cliente, matricula_id: nova, tipo: 'novo', prazo: 24, modo: 'valor', quantia: '1000.00' },
      ]);
      await comoDono(c);
      expect((await c.query(`select tipo from public.pendencias_averbadora where contrato_id = $1`, [id])).rows).toEqual([{ tipo: 'ajustar' }]);
    });
  });

  it('mover registra desde quando o contrato está na fase', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await digitar(c, s);
      await c.query(`update public.contratos set fase_desde = '2020-01-01' where id = $1`, [id]);
      await comoUsuario(c, s.operador);
      await c.query(`select public.mover_contrato($1, 'em_validacao', null)`, [id]);
      await comoDono(c);
      expect((await c.query(`select fase_desde > now() - interval '1 minute' as ok from public.contratos where id = $1`, [id])).rows[0].ok).toBe(true);
    });
  });

  it('parceiro não consulta mensalidade de matrícula pela função interna', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const p = await criarParceiroTeste(c);
      await comoUsuario(c, await criarUsuarioTeste(c, 'parceiro', { parceiroId: p }));
      expect(await erroDe(c, `select public.mensalidade_vigente($1)`, [s.matricula])).toMatch(/permission denied/);
    });
  });
});
