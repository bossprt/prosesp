import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoAnon, comoDono, comoUsuario, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { montarTabela, type Fixture } from './tabelas_fixture';

const DIA = '2026-10-28';

async function porValor(c: pg.PoolClient, f: Fixture, valor: string, gravar = false) {
  const r = await c.query(
    `select * from public.simular_por_valor($1, $2, 'novo', 24, $3, null, $4, $5)`,
    [f.convenio, f.efetivo, valor, DIA, gravar],
  );
  return r.rows[0];
}

async function porParcela(c: pg.PoolClient, f: Fixture, parcela: string) {
  const r = await c.query(
    `select * from public.simular_por_parcela($1, $2, 'novo', 24, $3, null, $4, false)`,
    [f.convenio, f.efetivo, parcela, DIA],
  );
  return r.rows[0];
}

async function comoOperador(c: pg.PoolClient) {
  const u = await criarUsuarioTeste(c, 'operador');
  await comoUsuario(c, u);
  return u;
}

describe('0006 simulador', () => {
  it('R$ 1.000,00 gera parcela R$ 61,20', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      await comoOperador(c);
      const r = await porValor(c, f, '1000');
      expect(r.parcela).toBe('61.20');
      expect(r.linha_id).toBe(f.linhas.l3);
      expect(r.valor_mensalidade).toBe('35.00');
      expect(r.percentual_comissao).toBe('8.0000');
      expect(r.base_comissao).toBe('liquido');
    });
  });

  it('parcela R$ 61,20 gera valor R$ 1.000,00', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      await comoOperador(c);
      const r = await porParcela(c, f, '61.20');
      expect(r.valor).toBe('1000.00');
      expect(r.linha_id).toBe(f.linhas.l3);
    });
  });

  it('parcela R$ 61,21 gera valor arredondado para baixo', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      await comoOperador(c);
      expect((await porParcela(c, f, '61.21')).valor).toBe('1000.16');
    });
  });

  it('R$ 499,99 e R$ 500,00 caem em linhas diferentes', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      await comoOperador(c);
      expect((await porValor(c, f, '499.99')).linha_id).toBe(f.linhas.l1);
      expect((await porValor(c, f, '500.00')).linha_id).toBe(f.linhas.l2);
    });
  });

  it('sem linha vigente devolve mensagem em português', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      await comoOperador(c);
      await expect(porValor(c, f, '50000')).rejects.toThrow('Nenhuma tabela vigente atende esta simulação.');
    });
  });

  it('faixa de idade exige data de nascimento', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      await c.query(
        `insert into public.tabela_linhas (tabela_id, vinculo_id, tipo, prazo, faixa_idade, vigencia, fator)
         values ($1, $2, 'refinanciamento', 12, public.faixa_anos(18, 65), '[2026-01-01,)', 0.1)`,
        [f.tabela, f.efetivo],
      );
      await comoOperador(c);
      expect(
        await erroDe(c, `select * from public.simular_por_valor($1, $2, 'refinanciamento', 12, 1000, null, $3)`, [
          f.convenio,
          f.efetivo,
          DIA,
        ]),
      ).toBe('Informe a data de nascimento para simular.');
      const r = await c.query(
        `select * from public.simular_por_valor($1, $2, 'refinanciamento', 12, 1000, '1980-05-10', $3)`,
        [f.convenio, f.efetivo, DIA],
      );
      expect(r.rows[0].parcela).toBe('100.00');
      await expect(
        c.query(`select * from public.simular_por_valor($1, $2, 'refinanciamento', 12, 1000, '1950-05-10', $3)`, [
          f.convenio,
          f.efetivo,
          DIA,
        ]),
      ).rejects.toThrow('Nenhuma tabela vigente atende esta simulação.');
    });
  });

  it('parceiro pode simular; anon não pode', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const p = await criarParceiroTeste(c);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, u);
      expect((await porValor(c, f, '1000')).parcela).toBe('61.20');
      await comoDono(c);
      await comoAnon(c);
      await expect(porValor(c, f, '1000')).rejects.toThrow(/permission denied/);
    });
  });

  it('p_gravar cria simulacao com a linha usada', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const u = await comoOperador(c);
      const r = await porValor(c, f, '1000', true);
      await comoDono(c);
      const s = await c.query(`select linha_id, entrada, valor, parcela, criado_por from public.simulacoes where id = $1`, [
        r.simulacao_id,
      ]);
      expect(s.rows[0]).toEqual({ linha_id: f.linhas.l3, entrada: 'valor', valor: '1000.00', parcela: '61.20', criado_por: u });
    });
  });
});
