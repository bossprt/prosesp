import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, criarClienteTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { cenarioImportacao, comContratos, contrato, gravar, juntar, lote, type CenarioImp, type Lote } from './importacao_fixture';

const DESFAZER = `select public.desfazer_importacao($1)`;

async function desfazer(c: pg.PoolClient, s: CenarioImp, id: string): Promise<string | null> {
  await comoUsuario(c, s.admin);
  try {
    return await erroDe(c, DESFAZER, [id]);
  } catch {
    return null; // sem erro
  } finally {
    await comoDono(c);
  }
}

function completo(): Lote {
  const d = comContratos({ ade: String(600000 + Math.floor(Math.random() * 99999)) });
  const { cpf, matricula } = d.matriculas[0];
  d.mensalidades = [{ linha: 2, cpf, convenio: 'Governo do Acre', matricula, valor: '35.00', vigente_desde: '2024-06-01', situacao: 'ativa', ade: null }];
  return d;
}

describe('0027 desfazer importação', () => {
  it('desfazer apaga só o que a importação criou', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const velho = await criarClienteTeste(c, { nome: 'Maria Importada' });
      const doVelho = lote(velho.cpf, velho.matricula);
      doVelho.contratos = [contrato(velho.cpf, velho.matricula)];
      const novo = completo();
      const { id } = await gravar(c, s, juntar(doVelho, novo));
      expect(await desfazer(c, s, id)).toBeNull();
      expect((await c.query(`select 1 from public.clientes where id = $1`, [velho.id])).rowCount).toBe(1);
      expect((await c.query(`select 1 from public.cliente_matriculas where cliente_id = $1`, [velho.id])).rowCount).toBe(1);
      expect((await c.query(`select 1 from public.contratos where importacao_id = $1`, [id])).rowCount).toBe(0);
      expect((await c.query(`select 1 from public.clientes where cpf = $1`, [novo.clientes[0].cpf])).rowCount).toBe(0);
      expect((await c.query(`select 1 from public.mensalidades where importacao_id = $1`, [id])).rowCount).toBe(0);
      const i = await c.query(`select situacao, desfeita_por from public.importacoes where id = $1`, [id]);
      expect(i.rows[0]).toEqual({ situacao: 'desfeita', desfeita_por: s.admin });
    });
  });

  it('desfazer depois do cálculo diário de atraso funciona', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const { id } = await gravar(c, s, completo());
      await c.query(`select public.recalcular_atrasos(current_date + 400)`);
      expect(await desfazer(c, s, id)).toBeNull();
    });
  });

  it('contrato editado bloqueia com o nº antigo na mensagem', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = completo();
      const { id } = await gravar(c, s, d);
      await c.query(`update public.contratos set versao = 2 where importacao_id = $1`, [id]);
      expect(await desfazer(c, s, id)).toBe(`Não dá para desfazer: o contrato antigo nº ${d.contratos[0].numero_antigo} já foi alterado.`);
    });
  });

  it('pagamento manual bloqueia', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = completo();
      const { id } = await gravar(c, s, d);
      await c.query(
        `insert into public.parcela_pagamentos (parcela_id, valor, competencia_desconto)
         select p.id, 10, p.competencia from public.parcelas p join public.contratos k on k.id = p.contrato_id
         where k.importacao_id = $1 and p.numero = 10`,
        [id],
      );
      expect(await desfazer(c, s, id)).toBe(`Não dá para desfazer: o contrato antigo nº ${d.contratos[0].numero_antigo} já foi alterado.`);
    });
  });

  it('novo valor de mensalidade bloqueia', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = completo();
      const { id } = await gravar(c, s, d);
      await c.query(
        `insert into public.mensalidade_valores (mensalidade_id, valor, vigente_desde, tipo)
         select m.id, 40, '2026-11-01', 'reajuste' from public.mensalidades m where m.importacao_id = $1`,
        [id],
      );
      expect(await desfazer(c, s, id)).toBe(`Não dá para desfazer: a mensalidade da matrícula ${d.matriculas[0].matricula} já foi alterada.`);
    });
  });

  it('cliente com conta nova bloqueia', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = lote();
      const { id } = await gravar(c, s, d);
      await c.query(
        `insert into public.cliente_contas (cliente_id, banco_id, agencia, conta, tipo_conta)
         select c.id, (select id from public.bancos limit 1), '1', '2', 'corrente' from public.clientes c where c.cpf = $1`,
        [d.clientes[0].cpf],
      );
      expect(await desfazer(c, s, id)).toBe(`Não dá para desfazer: o cliente de CPF ${d.clientes[0].cpf} já foi alterado.`);
    });
  });

  it('segunda vez não pode; operador não desfaz', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const { id } = await gravar(c, s, lote());
      expect(await desfazer(c, s, id)).toBeNull();
      expect(await desfazer(c, s, id)).toBe('Esta importação não pode ser desfeita.');
      const { id: id2 } = await gravar(c, s, lote());
      await comoUsuario(c, await criarUsuarioTeste(c, 'operador'));
      expect(await erroDe(c, DESFAZER, [id2])).toBe('Você não tem permissão para esta ação.');
    });
  });
});
