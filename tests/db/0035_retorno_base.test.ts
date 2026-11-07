import { describe, expect, it } from 'vitest';
import { comoDono, comoUsuario, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe, type Perfil } from './helpers';
import { cenarioRetorno, parcela } from './retorno_fixture';

const pode = async (c: import('pg').PoolClient, perfil: Perfil, chave: string) => {
  const u = await criarUsuarioTeste(c, perfil, perfil === 'parceiro' ? { parceiroId: await criarParceiroTeste(c) } : {});
  await comoUsuario(c, u);
  const r = (await c.query(`select public.app_equipe_pode($1) as ok`, [chave])).rows[0].ok;
  await comoDono(c);
  return r;
};

describe('0035 base do retorno', () => {
  it('permissões por perfil', async () => {
    await emTransacao(async (c) => {
      expect(await pode(c, 'financeiro', 'retorno.importar')).toBe(true);
      expect(await pode(c, 'financeiro', 'retorno.baixar_diferenca')).toBe(false);
      expect(await pode(c, 'gerente', 'retorno.baixar_diferenca')).toBe(true);
      expect(await pode(c, 'operador', 'retorno.ver')).toBe(true);
      expect(await pode(c, 'operador', 'retorno.importar')).toBe(false);
      expect(await pode(c, 'consulta', 'retorno.ver')).toBe(true);
      expect(await pode(c, 'parceiro', 'retorno.ver')).toBe(false);
    });
  });

  it('layout do retorno e da remessa é conferido pelo banco', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const upd = (r: unknown, m: unknown) =>
        erroDe(c, `update public.convenios set layout_retorno = $2, layout_remessa = $3 where id = $1`, [s.f.convenio, r, m]);
      expect(await upd({ versao: 1, colunas: { ade: 'ID' } }, null)).toBe('Layout do retorno: as colunas do ADE e do valor são obrigatórias.');
      expect(await upd({ versao: 1, colunas: { ade: 'ID', valor: 'id' } }, null)).toBe('Layout do retorno: a coluna "id" está em dois campos.');
      expect(await upd({ versao: 1, colunas: { ade: 'ID', valor: 'V', xpto: 'X' } }, null)).toBe('Layout do retorno: campo desconhecido "xpto".');
      expect(await upd(null, { versao: 1, colunas: [{ titulo: 'A', campo: 'banana' }] })).toBe('Layout da remessa: campo desconhecido "banana".');
      await c.query(`update public.convenios set layout_retorno = $2, layout_remessa = $3 where id = $1`, [
        s.f.convenio, { versao: 1, colunas: { ade: 'ID_Consignacao', valor: 'Valor_Desconto' }, linha_cabecalho: 1 },
        { versao: 1, colunas: [{ titulo: 'ADE', campo: 'ade' }] },
      ]);
    });
  });

  it('saldo desconta pagamentos e baixas; recálculo segue o saldo e o vencimento', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const p = await parcela(c, s.contrato);
      expect(p.status).toBe('aberta');
      await c.query(`insert into public.parcela_pagamentos (parcela_id, valor, competencia_desconto, origem) values ($1, 10, '2026-11-01', 'retorno')`, [p.id]);
      await c.query(`select public._recalcular_parcela($1, '2026-11-10')`, [p.id]);
      expect((await parcela(c, s.contrato)).status).toBe('parcial');
      await c.query(`select public._recalcular_parcela($1, '2026-12-01')`, [p.id]);
      expect((await parcela(c, s.contrato)).status).toBe('atrasada');
      await c.query(`select public._recalcular_situacao_contrato($1)`, [s.contrato]);
      expect((await c.query(`select situacao from public.contratos where id = $1`, [s.contrato])).rows[0].situacao).toBe('em_atraso');

      const saldo = (await parcela(c, s.contrato)).saldo;
      await c.query(`insert into public.diferenca_baixas (parcela_id, valor, motivo) values ($1, $2, 'acordo')`, [p.id, saldo]);
      await c.query(`select public._recalcular_parcela($1, '2026-12-01')`, [p.id]);
      const depois = await parcela(c, s.contrato);
      expect(depois).toMatchObject({ status: 'paga', saldo: '0.00', pago: '10.00', baixado: saldo });
      await c.query(`select public._recalcular_situacao_contrato($1)`, [s.contrato]);
      expect((await c.query(`select situacao from public.contratos where id = $1`, [s.contrato])).rows[0].situacao).toBe('ativo');

      await c.query(`update public.parcelas set status = 'cancelada' where id = $1`, [p.id]);
      await c.query(`select public._recalcular_parcela($1, '2026-12-01')`, [p.id]);
      expect((await parcela(c, s.contrato)).status).toBe('cancelada');
    });
  });

  it('parceiro não lê retornos nem baixas; funções internas fechadas', async () => {
    await emTransacao(async (c) => {
      const p = await criarParceiroTeste(c);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await c.query(`insert into public.retornos (convenio_id, produto, tipo, competencia, arquivo_nome, hash)
                     select id, 'parcelas', 'descontados', '2026-11-01', 'a.xlsx', repeat('a', 64) from public.convenios limit 1`);
      await comoUsuario(c, u);
      expect((await c.query(`select count(*)::int as n from public.retornos`)).rows[0].n).toBe(0);
      expect(await erroDe(c, `select public._recalcular_parcela(gen_random_uuid())`)).toMatch(/permission denied/);
      await comoDono(c);
    });
  });
});
