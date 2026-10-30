import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { emTransacao } from './helpers';
import { cenarioImportacao, comContratos, conferir, gravar } from './importacao_fixture';

async function parcelas(c: pg.PoolClient, num: string | number | null) {
  return (
    await c.query(
      `select p.numero, p.competencia::text, p.vencimento::text, p.status,
              (select count(*)::int from public.parcela_pagamentos g where g.parcela_id = p.id and g.origem = 'legado') as pag
       from public.parcelas p join public.contratos k on k.id = p.contrato_id where k.numero_legado = $1 order by p.numero`,
      [num],
    )
  ).rows;
}
async function situacao(c: pg.PoolClient, num: string | number | null) {
  return (await c.query(`select situacao::text from public.contratos where numero_legado = $1`, [num])).rows[0]?.situacao;
}

describe('0025 parcelas importadas', () => {
  it('gera 24 parcelas com 5 pagas e pagamentos legado', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({});
      d.posicao = '2024-11-15';
      const { r } = await gravar(c, s, d);
      expect(r.erros).toEqual([]);
      const p = await parcelas(c, d.contratos[0].numero_antigo);
      expect(p).toHaveLength(24);
      expect(p[0]).toEqual({ numero: 1, competencia: '2024-06-01', vencimento: '2024-06-28', status: 'paga', pag: 1 });
      expect(p[4]).toMatchObject({ numero: 5, status: 'paga', pag: 1 });
      expect(p[5]).toMatchObject({ numero: 6, competencia: '2024-11-01', status: 'aberta', pag: 0 });
      expect(p[23]).toMatchObject({ numero: 24, competencia: '2026-05-01' });
      expect(await situacao(c, d.contratos[0].numero_antigo)).toBe('ativo');
    });
  });

  it('parcelas vencidas antes da posição ficam atrasadas e o contrato vira em atraso com aviso', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({});
      d.posicao = '2025-01-10';
      const { r } = await gravar(c, s, d);
      const p = await parcelas(c, d.contratos[0].numero_antigo);
      expect(p.filter((x) => x.status === 'atrasada').map((x) => x.numero)).toEqual([6, 7]);
      expect(await situacao(c, d.contratos[0].numero_antigo)).toBe('em_atraso');
      expect(r.avisos).toEqual([
        { aba: 'Contratos', linha: 2, mensagem: 'Situação ajustada para em atraso pelas parcelas vencidas até a data da posição.' },
      ]);
    });
  });

  it('contrato quitado tem as parcelas restantes canceladas; prejuízo fica em prejuízo', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({ situacao: 'quitado' }, { situacao: 'prejuízo' });
      await gravar(c, s, d);
      const q = await parcelas(c, d.contratos[0].numero_antigo);
      expect(new Set(q.slice(5).map((x) => x.status))).toEqual(new Set(['cancelada']));
      const pj = await parcelas(c, d.contratos[1].numero_antigo);
      expect(new Set(pj.slice(5).map((x) => x.status))).toEqual(new Set(['prejuizo']));
      expect(await situacao(c, d.contratos[0].numero_antigo)).toBe('quitado');
    });
  });

  it('aba Parcelas substitui a regra de parcelas pagas', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({ prazo: '3', parcelas_pagas: '0', valor_parcela: '700.00' });
      const num = d.contratos[0].numero_antigo;
      d.parcelas = [
        { linha: 2, numero_antigo: num, numero: '1', competencia: '2024-06-01', valor: '700.00', situacao: 'paga' },
        { linha: 3, numero_antigo: num, numero: '2', competencia: '2024-07-01', valor: '700.00', situacao: 'Atrasada' },
        { linha: 4, numero_antigo: num, numero: '3', competencia: '2024-08-01', valor: '700.00', situacao: 'aberta' },
      ];
      const { r } = await gravar(c, s, d);
      expect(r.resumo.Parcelas).toEqual({ novas: 3, existentes: 0, erros: 0 });
      expect((await parcelas(c, num)).map((x) => [x.status, x.pag])).toEqual([['paga', 1], ['atrasada', 0], ['atrasada', 0]]);
      expect(await situacao(c, num)).toBe('em_atraso');
    });
  });

  it('aba Parcelas incompleta é erro', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({ prazo: '3', parcelas_pagas: '0', valor_parcela: '700.00' });
      d.parcelas = [{ linha: 2, numero_antigo: d.contratos[0].numero_antigo, numero: '1', competencia: '2024-06-01', valor: '700.00', situacao: 'paga' }];
      const r = await conferir(c, s, d);
      expect(r.erros).toContainEqual({ aba: 'Contratos', linha: 2, mensagem: 'A aba Parcelas precisa ter as 3 parcelas deste contrato.' });
    });
  });

  it('erro numa parcela afasta o CPF inteiro', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({ prazo: '2', parcelas_pagas: '0', valor_parcela: '1050.00' }, {}, {});
      const num = d.contratos[0].numero_antigo;
      d.parcelas = [
        { linha: 2, numero_antigo: num, numero: '1', competencia: '2024-06-01', valor: '1050.00', situacao: 'paga' },
        { linha: 3, numero_antigo: num, numero: '2', competencia: '2024-07-01', valor: '1050.00', situacao: 'xyz' },
      ];
      const { r } = await gravar(c, s, d);
      expect(r.erros).toContainEqual({ aba: 'Parcelas', linha: 3, mensagem: 'Situação da parcela inválida: xyz.' });
      for (const [aba, linha] of [['Clientes', 2], ['Matrículas', 2], ['Contratos', 2], ['Contratos', 3], ['Contratos', 4], ['Parcelas', 2]] as const) {
        expect(r.erros).toContainEqual({ aba, linha, mensagem: 'Não importado: há erro em outra linha deste CPF.' });
      }
      expect((await c.query(`select 1 from public.clientes where cpf = $1`, [d.clientes[0].cpf])).rowCount).toBe(0);
    });
  });

  it('o cálculo diário de atraso não muda nada se a posição é hoje', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({ parcelas_pagas: '3' }, { situacao: 'em atraso', parcelas_pagas: '24' });
      d.posicao = new Date().toISOString().slice(0, 10);
      await gravar(c, s, d);
      const antes = [await parcelas(c, d.contratos[0].numero_antigo), await situacao(c, d.contratos[0].numero_antigo),
        await situacao(c, d.contratos[1].numero_antigo)];
      await c.query(`select public.recalcular_atrasos(current_date)`);
      const depois = [await parcelas(c, d.contratos[0].numero_antigo), await situacao(c, d.contratos[0].numero_antigo),
        await situacao(c, d.contratos[1].numero_antigo)];
      expect(depois).toEqual(antes);
      expect(antes[2]).toBe('ativo');
    });
  });
});
