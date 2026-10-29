import { describe, expect, it } from 'vitest';
import { comoUsuario, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { montarTabela } from './tabelas_fixture';

const SQL = `select public.criar_linha_tabela($1, $2, $3::public.tipo_contrato, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12, $13) as id`;

describe('0011 criar_linha_tabela', () => {
  it('cria linha e comissão juntas com base pelo tipo', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const ger = await criarUsuarioTeste(c, 'gerente');
      await comoUsuario(c, ger);
      const r = await c.query(SQL, [f.tabela, f.efetivo, 'compra', 24, '300', '999.99', 18, 70, '2026-01-01', null, '0.05', '7', '30']);
      const l = await c.query(
        `select l.faixa_valor::text as fv, l.faixa_idade::text as fi, l.vigencia::text as vig, c.percentual, c.base
         from public.tabela_linhas l join public.tabela_linha_comissoes c on c.linha_id = l.id where l.id = $1`,
        [r.rows[0].id],
      );
      expect(l.rows[0]).toEqual({
        fv: '[30000,100000)',
        fi: '[18,71)',
        vig: '[2026-01-01,)',
        percentual: '7.0000',
        base: 'bruto',
      });
    });
  });

  it('sobreposição não deixa linha nem comissão pela metade', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const ger = await criarUsuarioTeste(c, 'gerente');
      await comoUsuario(c, ger);
      const antes = (await c.query(`select count(*)::int as n from public.tabela_linhas`)).rows[0].n;
      const msg = await erroDe(c, SQL, [f.tabela, f.efetivo, 'novo', 24, '400', '600', null, null, '2026-01-01', null, '0.05', '8', '35']);
      expect(msg).toMatch(/tabela_linhas_sem_sobreposicao/);
      expect((await c.query(`select count(*)::int as n from public.tabela_linhas`)).rows[0].n).toBe(antes);
    });
  });

  it('faixa com mínimo maior que máximo é recusada', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const ger = await criarUsuarioTeste(c, 'gerente');
      await comoUsuario(c, ger);
      expect(
        await erroDe(c, SQL, [f.tabela, f.efetivo, 'novo', 36, '900', '100', null, null, '2026-01-01', null, '0.05', '8', '35']),
      ).toBe('A faixa de valor está invertida: o mínimo é maior que o máximo.');
    });
  });

  it('operador não cria linha', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(
        await erroDe(c, SQL, [f.tabela, f.efetivo, 'novo', 36, null, null, null, null, '2026-01-01', null, '0.05', '8', '35']),
      ).toBe('Você não tem permissão para esta ação.');
    });
  });
});
