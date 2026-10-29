import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, criarClienteTeste, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { inserirContratoBase } from './contratos_fixture';
import { montarTabela } from './tabelas_fixture';

/** Tabela do Acre (novo 24x) + linha de refinanciamento 24x sem faixa; cliente completo. */
async function cenario(c: pg.PoolClient) {
  const f = await montarTabela(c);
  const lr = await c.query(
    `insert into public.tabela_linhas (tabela_id, vinculo_id, tipo, prazo, vigencia, fator, valor_mensalidade)
     values ($1, $2, 'refinanciamento', 24, '[2026-01-01,)', 0.0612, 50) returning id`,
    [f.tabela, f.efetivo],
  );
  await c.query(`insert into public.tabela_linha_comissoes (linha_id, percentual, base) values ($1, 6, 'liquido')`, [lr.rows[0].id]);
  const cli = await criarClienteTeste(c);
  await c.query(`update public.clientes set data_nascimento = '1980-05-10', email = 'cli@prosesp.test' where id = $1`, [cli.id]);
  const mat = (await c.query(`select id from public.cliente_matriculas where cliente_id = $1`, [cli.id])).rows[0].id;
  return { f, cli, mat };
}

const dadosNovo = (cliente: string, matricula: string, extra: Record<string, unknown> = {}) => ({
  cliente_id: cliente,
  matricula_id: matricula,
  tipo: 'novo',
  prazo: 24,
  modo: 'valor',
  quantia: '1000.00',
  ...extra,
});

async function comoOperador(c: pg.PoolClient) {
  const u = await criarUsuarioTeste(c, 'operador');
  await comoUsuario(c, u);
  return u;
}

const DIGITAR = `select public.digitar_contrato($1) as id`;

describe('0016 digitação', () => {
  it('digitar copia fator, parcela e comissão da tabela e grava simulação', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoOperador(c);
      const id = (await c.query(DIGITAR, [dadosNovo(s.cli.id, s.mat)])).rows[0].id;
      await comoDono(c);
      const k = await c.query(
        `select fase, fator, valor_parcela, valor_bruto, valor_liquido, linha_tabela_id, mensalidade_proposta, versao
         from public.contratos where id = $1`,
        [id],
      );
      expect(k.rows[0]).toEqual({
        fase: 'digitado', fator: '0.06120000', valor_parcela: '61.20', valor_bruto: '1000.00', valor_liquido: '1000.00',
        linha_tabela_id: s.f.linhas.l3, mensalidade_proposta: '35.00', versao: 1,
      });
      expect((await c.query(`select percentual, base from public.contrato_comissao_regra where contrato_id = $1`, [id])).rows[0]).toEqual({
        percentual: '8.0000', base: 'liquido',
      });
      expect((await c.query(`select 1 from public.simulacoes where linha_id = $1`, [s.f.linhas.l3])).rowCount).toBe(1);
      expect((await c.query(`select 1 from public.contrato_versoes where contrato_id = $1 and versao = 1`, [id])).rowCount).toBe(1);
      expect((await c.query(`select para from public.contrato_eventos where contrato_id = $1`, [id])).rows).toEqual([{ para: 'digitado' }]);
    });
  });

  it('cliente sem e-mail e nascimento recebe a mensagem listando os dois', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await c.query(`update public.clientes set data_nascimento = null, email = null where id = $1`, [s.cli.id]);
      await comoOperador(c);
      expect(await erroDe(c, DIGITAR, [dadosNovo(s.cli.id, s.mat)])).toBe(
        'Para digitar o contrato, complete no cadastro: data de nascimento, e-mail.',
      );
    });
  });

  it('refin quita contrato do mesmo cliente e calcula o líquido', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      const antigo = await inserirContratoBase(c, { cliente: { id: s.cli.id, matriculaId: s.mat }, situacao: 'ativo', fase: 'credito_liberado' });
      await comoOperador(c);
      const id = (
        await c.query(DIGITAR, [
          dadosNovo(s.cli.id, s.mat, {
            tipo: 'refinanciamento',
            quitacoes: [{ contrato_quitado_id: antigo.id, saldo_devedor: '400.00', fonte: 'calculo' }],
          }),
        ])
      ).rows[0].id;
      await comoDono(c);
      expect((await c.query(`select total_quitado, valor_liquido from public.contratos where id = $1`, [id])).rows[0]).toEqual({
        total_quitado: '400.00', valor_liquido: '600.00',
      });
    });
  });

  it('refin de contrato de outro cliente é recusado', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      const deOutro = await inserirContratoBase(c, { situacao: 'ativo', fase: 'credito_liberado' });
      await comoOperador(c);
      const d = dadosNovo(s.cli.id, s.mat, {
        tipo: 'refinanciamento',
        quitacoes: [{ contrato_quitado_id: deOutro.id, saldo_devedor: '400.00', fonte: 'calculo' }],
      });
      expect(await erroDe(c, DIGITAR, [d])).toBe('Só é possível quitar contratos ativos do mesmo cliente e matrícula.');
    });
  });

  it('contrato já reservado é recusado', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      const antigo = await inserirContratoBase(c, { cliente: { id: s.cli.id, matriculaId: s.mat }, situacao: 'ativo', fase: 'credito_liberado' });
      await comoOperador(c);
      const d = dadosNovo(s.cli.id, s.mat, {
        tipo: 'refinanciamento',
        quitacoes: [{ contrato_quitado_id: antigo.id, saldo_devedor: '400.00', fonte: 'calculo' }],
      });
      await c.query(DIGITAR, [d]);
      expect(await erroDe(c, DIGITAR, [d])).toBe('Este contrato já está sendo quitado por outro refinanciamento.');
    });
  });

  it('novo com quitação é recusado; refin sem quitação também', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      const antigo = await inserirContratoBase(c, { cliente: { id: s.cli.id, matriculaId: s.mat }, situacao: 'ativo', fase: 'credito_liberado' });
      await comoOperador(c);
      expect(
        await erroDe(c, DIGITAR, [
          dadosNovo(s.cli.id, s.mat, { quitacoes: [{ contrato_quitado_id: antigo.id, saldo_devedor: '1', fonte: 'outro' }] }),
        ]),
      ).toBe('Contrato novo não quita outros contratos. Use refinanciamento.');
      expect(await erroDe(c, DIGITAR, [dadosNovo(s.cli.id, s.mat, { tipo: 'refinanciamento' })])).toBe(
        'Refinanciamento precisa de ao menos um contrato a quitar.',
      );
    });
  });

  it('parceiro pré-digita, contrato fica dele e não grava simulação', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      const p = await criarParceiroTeste(c);
      await c.query(`insert into public.cliente_parceiros (cliente_id, parceiro_id) values ($1, $2)`, [s.cli.id, p]);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, u);
      const id = (await c.query(`select public.pre_digitar_contrato($1) as id`, [{ ...dadosNovo(s.cli.id, s.mat), parceiro_id: null }])).rows[0].id;
      await comoDono(c);
      expect((await c.query(`select fase, parceiro_id from public.contratos where id = $1`, [id])).rows[0]).toEqual({
        fase: 'pre_digitacao', parceiro_id: p,
      });
      expect((await c.query(`select count(*)::int as n from public.simulacoes`)).rows[0].n).toBe(0);
    });
  });

  it('parceiro não pré-digita para cliente sem vínculo', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      const p = await criarParceiroTeste(c);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, u);
      expect(await erroDe(c, `select public.pre_digitar_contrato($1)`, [dadosNovo(s.cli.id, s.mat)])).toBe(
        'Busque o cliente por CPF e matrícula antes de pré-digitar.',
      );
    });
  });

  it('editar antes de averbar recalcula e cria versão 2', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoOperador(c);
      const id = (await c.query(DIGITAR, [dadosNovo(s.cli.id, s.mat)])).rows[0].id;
      await c.query(`select public.editar_contrato($1, $2, null)`, [id, dadosNovo(s.cli.id, s.mat, { quantia: '600.00' })]);
      await comoDono(c);
      expect((await c.query(`select versao, valor_bruto, linha_tabela_id from public.contratos where id = $1`, [id])).rows[0]).toEqual({
        versao: 2, valor_bruto: '600.00', linha_tabela_id: s.f.linhas.l2,
      });
      expect((await c.query(`select count(*)::int as n from public.contrato_versoes where contrato_id = $1`, [id])).rows[0].n).toBe(2);
    });
  });

  it('contrato que volta de pendente depois de averbado exige contratos.editar_averbado', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoOperador(c);
      const id = (await c.query(DIGITAR, [dadosNovo(s.cli.id, s.mat)])).rows[0].id;
      await comoDono(c);
      await c.query(`update public.contratos set fase = 'pendente', fase_retorno = 'averbado', valores_travados_em = now() where id = $1`, [id]);
      await comoOperador(c);
      expect(
        await erroDe(c, `select public.editar_contrato($1, $2, 'ajuste')`, [id, dadosNovo(s.cli.id, s.mat, { quantia: '600.00' })]),
      ).toBe('Você não tem permissão para esta ação.');
    });
  });

  it('gerente edita averbado com motivo; sem motivo é recusado', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoOperador(c);
      const id = (await c.query(DIGITAR, [dadosNovo(s.cli.id, s.mat)])).rows[0].id;
      await comoDono(c);
      await c.query(`update public.contratos set fase = 'averbado', valores_travados_em = now() where id = $1`, [id]);
      const ger = await criarUsuarioTeste(c, 'gerente');
      await comoUsuario(c, ger);
      expect(
        await erroDe(c, `select public.editar_contrato($1, $2, '  ')`, [id, dadosNovo(s.cli.id, s.mat, { quantia: '600.00' })]),
      ).toBe('Informe o motivo da edição de um contrato já averbado.');
      await c.query(`select public.editar_contrato($1, $2, 'cliente pediu valor menor')`, [id, dadosNovo(s.cli.id, s.mat, { quantia: '600.00' })]);
      await comoDono(c);
      expect((await c.query(`select valor_bruto from public.contratos where id = $1`, [id])).rows[0].valor_bruto).toBe('600.00');
    });
  });
});
