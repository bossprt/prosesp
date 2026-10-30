import { describe, expect, it } from 'vitest';
import { comoDono, comoUsuario, criarClienteTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';

describe('0022 base da importação', () => {
  it('administrador tem importacao.executar e operador não', async () => {
    await emTransacao(async (c) => {
      const r = await c.query(`select perfil::text from public.perfil_permissoes where permissao = 'importacao.executar'`);
      expect(r.rows).toEqual([{ perfil: 'administrador' }]);
    });
  });

  it('teto do parceiro recusa importacao.executar', async () => {
    await emTransacao(async (c) => {
      expect(
        await erroDe(c, `insert into public.perfil_permissoes (perfil, permissao) values ('parceiro', 'importacao.executar')`),
      ).toBe('Esta permissão não pode ser dada ao perfil parceiro.');
    });
  });

  it('operador não lê importacoes; administrador lê', async () => {
    await emTransacao(async (c) => {
      await c.query(`insert into public.importacoes (arquivo_nome, hash, data_posicao) values ('a.xlsx', 'h1', '2026-10-01')`);
      const op = await criarUsuarioTeste(c, 'operador');
      const adm = await criarUsuarioTeste(c, 'administrador');
      await comoUsuario(c, op);
      expect((await c.query(`select 1 from public.importacoes where hash = 'h1'`)).rowCount).toBe(0);
      expect(await erroDe(c, `insert into public.importacoes (arquivo_nome, hash, data_posicao) values ('b', 'h2', '2026-10-01')`)).toMatch(
        /permission denied/,
      );
      await comoDono(c);
      await comoUsuario(c, adm);
      expect((await c.query(`select 1 from public.importacoes where hash = 'h1'`)).rowCount).toBe(1);
    });
  });

  it('conversores', async () => {
    await emTransacao(async (c) => {
      const r = await c.query(
        `select public._imp_chave('  Governo  do ÁCRE ') as k,
                public._imp_data('2024-05-10', 'Data da liberação')::text as d,
                public._imp_competencia('2024-05', 'Primeira competência')::text as m,
                public._imp_competencia('2024-05-17', 'Primeira competência')::text as m2,
                public._imp_inteiro('24', 'Prazo') as i,
                public._imp_data(null, 'X') as n`,
      );
      expect(r.rows[0]).toEqual({ k: 'governo do acre', d: '2024-05-10', m: '2024-05-01', m2: '2024-05-01', i: 24, n: null });
      expect(await erroDe(c, `select public._imp_data('10/05/2024', 'Data da liberação')`)).toBe(
        'Data da liberação inválida: 10/05/2024.',
      );
      expect(await erroDe(c, `select public._imp_inteiro('2,5', 'Prazo')`)).toBe('Prazo inválido: 2,5.');
    });
  });

  it('eventos continuam imutáveis, exceto no desfazer da importação', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const k = await c.query(
        `insert into public.contratos (cliente_id, matricula_id, convenio_id, vinculo_id, tipo, fase, fator, prazo, valor_parcela, valor_bruto)
         select m.cliente_id, m.id, m.convenio_id, m.vinculo_id, 'novo', 'credito_liberado', 0.0612, 24, 122.40, 2000
         from public.cliente_matriculas m where m.cliente_id = $1 returning id`,
        [cli.id],
      );
      await c.query(`insert into public.contrato_eventos (contrato_id, para, motivo) values ($1, 'credito_liberado', 'x')`, [k.rows[0].id]);
      expect(await erroDe(c, `delete from public.contrato_eventos where contrato_id = $1`, [k.rows[0].id])).toBe(
        'O histórico do contrato não pode ser alterado.',
      );
      await c.query(`set local app.desfazendo_importacao = 'on'`);
      await c.query(`delete from public.contrato_eventos where contrato_id = $1`, [k.rows[0].id]);
      await c.query(`insert into public.contrato_eventos (contrato_id, para, motivo) values ($1, 'credito_liberado', 'x')`, [k.rows[0].id]);
      expect(await erroDe(c, `update public.contrato_eventos set motivo = 'y' where contrato_id = $1`, [k.rows[0].id])).toBe('O histórico do contrato não pode ser alterado.');
    });
  });

  it('contratos têm numero_legado único', async () => {
    await emTransacao(async (c) => {
      const r = await c.query(
        `select count(*)::int as n from information_schema.columns where table_schema = 'public'
         and ((table_name = 'contratos' and column_name in ('numero_legado', 'quitados_legado', 'importacao_id'))
           or (table_name in ('clientes', 'cliente_matriculas', 'mensalidades', 'mensalidade_averbacoes', 'contrato_averbacoes')
               and column_name = 'importacao_id'))`,
      );
      expect(r.rows[0].n).toBe(8);
    });
  });
});
