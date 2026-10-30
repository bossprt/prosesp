import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { cenarioEsteira, digitar, type Cenario } from './esteira_fixture';

async function preparar(c: pg.PoolClient): Promise<Cenario> {
  const s = await cenarioEsteira(c);
  await c.query(`update public.convenios set dia_corte = 2, dia_vencimento = 28 where nome = 'Governo do Acre'`);
  return s;
}

async function dados(c: pg.PoolClient, usuario: string, id: string, data = '2026-10-01') {
  await comoUsuario(c, usuario);
  const r = await c.query(`select public.contrato_dados_documento($1, $2::date) as d`, [id, data]);
  await comoDono(c);
  return r.rows[0].d;
}

describe('0030 dados do documento', () => {
  it('campos batem com a lista do modelo e as parcelas previstas seguem a regra da liberação', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await digitar(c, s);
      const d = await dados(c, s.operador, id);
      const lista = await c.query(`select chave from public.modelo_campos() where chave not like 'se %' and chave <> 'parcelas.tabela'`);
      expect(Object.keys(d.campos).sort()).toEqual(lista.rows.map((x) => x.chave).sort());
      const k = (await c.query(`select prazo, valor_parcela from public.contratos where id = $1`, [id])).rows[0];
      expect(d.parcelas).toHaveLength(k.prazo);
      // 01/10 está antes do corte (dia 2): primeira competência 10/2026, vencimento dia 28
      expect(d.parcelas[0]).toEqual({ numero: 1, competencia: '10/2026', vencimento: '28/10/2026', valor: d.campos['contrato.valor_parcela'] });
      expect(d.campos['contrato.primeira_competencia']).toBe('10/2026');
      expect(d.campos['contrato.valor_parcela']).toMatch(/^R\$ \d{1,3}(\.\d{3})*,\d{2}$/);
      expect(d.valores.prazo).toBe(k.prazo);
      expect(d.valores.valor_parcela).toBe(k.valor_parcela);
      expect(d.campos['documento.data']).toBe('01/10/2026');
      expect(d.campos['documento.data_extenso']).toBe('1 de outubro de 2026');
      expect(d.campos['cliente.cpf']).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
    });
  });

  it('condições: quitação e mensalidade', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const velho = await digitar(c, s);
      const id = await digitar(c, s);
      await c.query(`update public.contratos set mensalidade_proposta = null where id = $1`, [id]);
      let d = await dados(c, s.operador, id);
      expect(d.condicoes).toEqual({ mensalidade: false, quitacoes: false, dividas: false });
      await c.query(`update public.contratos set fase = 'credito_liberado' where id = $1`, [velho]);
      await c.query(`insert into public.contrato_quitacoes (contrato_id, contrato_quitado_id, saldo_devedor, fonte) values ($1, $2, 100, 'calculo')`, [id, velho]);
      await c.query(`update public.contratos set mensalidade_proposta = 35, total_quitado = 100 where id = $1`, [id]);
      d = await dados(c, s.operador, id);
      expect(d.condicoes).toEqual({ mensalidade: true, quitacoes: true, dividas: false });
      expect(d.campos['mensalidade.valor']).toBe('R$ 35,00');
      expect(d.campos['contrato.quitacoes']).toBe('R$ 100,00');
      const n = (await c.query(`select numero::text from public.contratos where id = $1`, [velho])).rows[0].numero;
      expect(d.campos['contrato.quitados']).toBe(n);
    });
  });

  it('campo sem valor sai vazio; corte passado vai para o mês seguinte', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await digitar(c, s);
      await c.query(`update public.clientes set rg = null where id = $1`, [s.cliente]);
      const d = await dados(c, s.operador, id, '2026-10-15');
      expect(d.campos['cliente.rg']).toBe('');
      expect(d.campos['contrato.ade']).toBe('');
      expect(d.parcelas[0].competencia).toBe('11/2026');
    });
  });

  it('parceiro de outro contrato não lê', async () => {
    await emTransacao(async (c) => {
      const s = await preparar(c);
      const id = await digitar(c, s);
      const p = await criarParceiroTeste(c);
      const parc = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, parc);
      expect(await erroDe(c, `select public.contrato_dados_documento($1)`, [id])).toBe('Contrato não encontrado.');
    });
  });
});
