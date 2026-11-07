import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { cenarioRetorno, comoFin, gravarRet, linha, type CenarioRet } from './retorno_fixture';

const q = async (c: pg.PoolClient, u: string, sql: string, params: unknown[]) =>
  comoFin(c, u, async () => (await c.query(sql, params)).rows[0].r);
const ADIMP = `select public.adimplencia($1, '2026-11-01') as r`;

async function parcial(c: pg.PoolClient, s: CenarioRet) {
  return gravarRet(c, s, [linha(s, { valor: (Number(s.valorParcela) - 5).toFixed(2) })]);
}

describe('0038 consultas do retorno', () => {
  it('adimplência com números fixos, tudo pago e não descontadas', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c, '30.00');
      const vp = Number(s.valorParcela);
      let a = await q(c, s.fin, ADIMP, [s.f.convenio]);
      expect(a.parcelas).toEqual({ esperado: vp.toFixed(2), recebido: '0.00', percentual: '0.00', pagas: 0, parciais: 0, nao_pagas: 1 });
      expect(a.mensalidades).toMatchObject({ esperado: '30.00', recebido: '0.00', nao_pagas: 1 });

      await parcial(c, s);
      const ade = (await c.query(`select ade from public.mensalidade_averbacoes where contrato_origem_id = $1`, [s.contrato])).rows[0].ade;
      await gravarRet(c, s, [linha(s, { ade, valor: null, observacao: 'Exonerado' })], { produto: 'mensalidades', tipo: 'nao_descontados' });
      a = await q(c, s.fin, ADIMP, [s.f.convenio]);
      expect(a.parcelas).toEqual({
        esperado: vp.toFixed(2), recebido: (vp - 5).toFixed(2), percentual: (Math.round(((vp - 5) * 10000) / vp) / 100).toFixed(2),
        pagas: 0, parciais: 1, nao_pagas: 0,
      });
      expect(a.nao_descontadas).toHaveLength(1);
      expect(a.nao_descontadas[0]).toMatchObject({ produto: 'mensalidades', motivo: 'Exonerado', ade });
      expect(a.tudo_pago).toEqual([]);

      await c.query(`update public.parcelas set status = 'paga' where contrato_id = $1`, [s.contrato]);
      a = await q(c, s.fin, ADIMP, [s.f.convenio]);
      expect(a.tudo_pago.map((x: { contrato_id: string }) => x.contrato_id)).toEqual([s.contrato]);
    });
  });

  it('em atraso traz dias e saldo; ausentes some depois que o retorno cita o contrato', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      await c.query(`update public.parcelas set vencimento = current_date - 10, status = 'atrasada' where contrato_id = $1 and competencia = '2026-11-01'`, [s.contrato]);
      await c.query(`update public.contratos set situacao = 'em_atraso' where id = $1`, [s.contrato]);
      const a = await q(c, s.fin, ADIMP, [s.f.convenio]);
      expect(a.em_atraso).toEqual([expect.objectContaining({ contrato_id: s.contrato, dias: 10, parcelas: 1, saldo: s.valorParcela })]);

      const AUS = `select public.retorno_ausentes($1, 'parcelas', '2026-11-01') as r`;
      expect((await q(c, s.fin, AUS, [s.f.convenio])).map((x: { contrato_id: string }) => x.contrato_id)).toEqual([s.contrato]);
      await gravarRet(c, s, [linha(s, { valor: null })], { tipo: 'nao_descontados' });
      expect(await q(c, s.fin, AUS, [s.f.convenio])).toEqual([]);
    });
  });

  it('remessa: saldo limitado ao averbado, só ADE ativo, mensalidade futura projetada; registra quem gerou', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c, '30.00');
      const REM = `select public.remessa_dados($1, $2, $3::date) as r`;
      let r = await q(c, s.fin, REM, [s.f.convenio, 'parcelas', '2026-11-01']);
      expect(r).toEqual([expect.objectContaining({ ade: s.ade, valor: s.valorParcela, parcela_numero: 1, parcela_total: 24, servico: 'Empréstimo' })]);
      await parcial(c, s);
      await c.query(`update public.contrato_averbacoes set valor_averbado = 3 where contrato_id = $1`, [s.contrato]);
      r = await q(c, s.fin, REM, [s.f.convenio, 'parcelas', '2026-11-01']);
      expect(r[0].valor).toBe('3.00');
      await c.query(`update public.contrato_averbacoes set situacao = 'cancelamento_pendente' where contrato_id = $1`, [s.contrato]);
      expect(await q(c, s.fin, REM, [s.f.convenio, 'parcelas', '2026-12-01'])).toEqual([]);

      // dezembro: a parcela da mensalidade ainda não foi gerada (cron do dia 1)
      r = await q(c, s.fin, REM, [s.f.convenio, 'mensalidades', '2026-12-01']);
      expect(r).toEqual([expect.objectContaining({ valor: '30.00', servico: 'Mensalidade' })]);
      const aud = (await c.query(`select count(*)::int as n from public.auditoria where acao = 'remessa_gerada' and usuario_id = $1`, [s.fin])).rows[0].n;
      expect(aud).toBe(4);
    });
  });

  it('diferenças em aberto lista o parcial; permissões e parceiro', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      await parcial(c, s);
      const d = await q(c, s.fin, `select public.diferencas_abertas($1) as r`, [s.f.convenio]);
      expect(d).toEqual([expect.objectContaining({ tipo: 'parcela', contrato_id: s.contrato, saldo: '5.00' })]);

      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(await erroDe(c, `select public.remessa_dados($1, 'parcelas', '2026-11-01')`, [s.f.convenio])).toBe('Você não tem permissão para esta ação.');
      await c.query(ADIMP, [s.f.convenio]);
      await comoDono(c);
      const parc = await criarUsuarioTeste(c, 'parceiro', { parceiroId: await criarParceiroTeste(c) });
      await comoUsuario(c, parc);
      expect(await erroDe(c, ADIMP, [s.f.convenio])).toBe('Você não tem permissão para esta ação.');
      expect(await erroDe(c, `select public.diferencas_abertas(null)`)).toBe('Você não tem permissão para esta ação.');
      await comoDono(c);
    });
  });
});
