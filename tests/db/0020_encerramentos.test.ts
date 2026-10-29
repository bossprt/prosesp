import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, emTransacao, erroDe } from './helpers';
import { cenarioEsteira, contratoLiberado, type Cenario } from './esteira_fixture';

const ENCERRAR = `select public.encerrar_contrato($1, $2, $3)`;

async function preparar(c: pg.PoolClient): Promise<Cenario> {
  const s = await cenarioEsteira(c);
  await c.query(`update public.convenios set dia_corte = 2, dia_vencimento = 28 where id = $1`, [s.f.convenio]);
  return s;
}

describe('0020 encerramentos', () => {
  it('quitar cancela parcelas abertas e cria pendência de cancelar na averbadora', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await contratoLiberado(c, s, '2026-11-02');
      await comoUsuario(c, s.gerente);
      await c.query(ENCERRAR, [id, 'quitado', 'Cliente quitou à vista']);
      await comoDono(c);
      expect((await c.query(`select situacao from public.contratos where id = $1`, [id])).rows[0].situacao).toBe('quitado');
      expect((await c.query(`select count(*)::int as n from public.parcelas where contrato_id = $1 and status <> 'cancelada'`, [id])).rows[0].n).toBe(0);
      expect((await c.query(`select situacao from public.contrato_averbacoes where contrato_id = $1`, [id])).rows[0].situacao).toBe(
        'cancelamento_pendente',
      );
      expect((await c.query(`select tipo from public.pendencias_averbadora where contrato_id = $1`, [id])).rows).toEqual([{ tipo: 'cancelar' }]);
    });
  });

  it('prejuízo marca as parcelas em aberto e mantém a averbação', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await contratoLiberado(c, s, '2026-11-02');
      await comoUsuario(c, s.gerente);
      await c.query(ENCERRAR, [id, 'prejuizo', 'Servidor exonerado']);
      await comoDono(c);
      expect((await c.query(`select distinct status from public.parcelas where contrato_id = $1`, [id])).rows).toEqual([{ status: 'prejuizo' }]);
      expect((await c.query(`select situacao from public.contrato_averbacoes where contrato_id = $1`, [id])).rows[0].situacao).toBe('ativa');
    });
  });

  it('encerrar sem motivo é recusado; operador não encerra', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await contratoLiberado(c, s, '2026-11-02');
      await comoUsuario(c, s.operador);
      expect(await erroDe(c, ENCERRAR, [id, 'quitado', 'x'])).toBe('Você não tem permissão para esta ação.');
      await comoDono(c);
      await comoUsuario(c, s.gerente);
      expect(await erroDe(c, ENCERRAR, [id, 'quitado', ' '])).toBe('Informe o motivo.');
    });
  });

  it('encerrar não mexe na mensalidade', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await contratoLiberado(c, s, '2026-11-02', '35.00');
      await comoUsuario(c, s.gerente);
      await c.query(ENCERRAR, [id, 'quitado', 'Quitação']);
      await comoDono(c);
      expect((await c.query(`select situacao from public.mensalidades where matricula_id = $1`, [s.matricula])).rows[0].situacao).toBe('ativa');
      expect((await c.query(`select situacao from public.mensalidade_averbacoes where contrato_origem_id = $1`, [id])).rows[0].situacao).toBe('ativa');
    });
  });

  it('recalcular_atrasos marca parcela e contrato, e volta a ativo quando pago', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await contratoLiberado(c, s, '2026-11-02');
      await c.query(`select public.recalcular_atrasos('2026-12-05')`);
      expect((await c.query(`select status from public.parcelas where contrato_id = $1 and numero = 1`, [id])).rows[0].status).toBe('atrasada');
      expect((await c.query(`select status from public.parcelas where contrato_id = $1 and numero = 2`, [id])).rows[0].status).toBe('aberta');
      expect((await c.query(`select situacao from public.contratos where id = $1`, [id])).rows[0].situacao).toBe('em_atraso');
      await c.query(`update public.parcelas set status = 'paga' where contrato_id = $1 and numero = 1`, [id]);
      await c.query(`select public.recalcular_atrasos('2026-12-05')`);
      expect((await c.query(`select situacao from public.contratos where id = $1`, [id])).rows[0].situacao).toBe('ativo');
    });
  });

  it('atraso de mensalidade não marca o contrato', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await contratoLiberado(c, s, '2026-11-02', '35.00');
      await c.query(`update public.parcelas set status = 'paga' where contrato_id = $1 and numero = 1`, [id]);
      await c.query(`select public.recalcular_atrasos('2026-12-05')`);
      expect((await c.query(`select status from public.mensalidade_parcelas`)).rows).toEqual([{ status: 'atrasada' }]);
      expect((await c.query(`select situacao from public.contratos where id = $1`, [id])).rows[0].situacao).toBe('ativo');
    });
  });

  it('candidato a prejuízo respeita dias_prejuizo do convênio', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await contratoLiberado(c, s, '2026-11-02');
      await c.query(
        `update public.parcelas set status = 'atrasada', vencimento = current_date - 45 where contrato_id = $1 and numero = 1`,
        [id],
      );
      await c.query(`update public.contratos set situacao = 'em_atraso' where id = $1`, [id]);
      const cand = `select dias_atraso from public.v_candidatos_prejuizo where contrato_id = $1`;
      expect((await c.query(cand, [id])).rowCount).toBe(0);
      await c.query(`update public.convenios set dias_prejuizo = 30 where id = $1`, [s.f.convenio]);
      expect((await c.query(cand, [id])).rows).toEqual([{ dias_atraso: 45 }]);
    });
  });

  it('cancelar mensalidade exige requerimento; com requerimento cria pendência', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      await contratoLiberado(c, s, '2026-11-02', '35.00');
      const m = (await c.query(`select id from public.mensalidades where matricula_id = $1`, [s.matricula])).rows[0].id;
      const outro = (
        await c.query(`insert into public.cliente_documentos (cliente_id, tipo, caminho) values ($1::uuid, 'rg', $1::text || '/rg.pdf') returning id`, [s.cliente])
      ).rows[0].id;
      const req = (
        await c.query(
          `insert into public.cliente_documentos (cliente_id, tipo, caminho) values ($1::uuid, 'requerimento_cancelamento', $1::text || '/req.pdf') returning id`,
          [s.cliente],
        )
      ).rows[0].id;
      await comoUsuario(c, s.gerente);
      expect(await erroDe(c, `select public.cancelar_mensalidade($1, $2, 'pedido do cliente')`, [m, outro])).toBe(
        'Anexe o requerimento de cancelamento assinado pelo cliente.',
      );
      await c.query(`select public.cancelar_mensalidade($1, $2, 'pedido do cliente')`, [m, req]);
      await comoDono(c);
      expect((await c.query(`select situacao from public.mensalidades where id = $1`, [m])).rows[0].situacao).toBe('cancelada');
      expect(
        (await c.query(`select tipo from public.pendencias_averbadora where mensalidade_averbacao_id is not null`)).rows,
      ).toEqual([{ tipo: 'cancelar' }]);
    });
  });
});
