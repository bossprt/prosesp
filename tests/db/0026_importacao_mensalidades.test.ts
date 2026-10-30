import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { emTransacao } from './helpers';
import { cenarioImportacao, comContratos, conferir, gravar, lote, type Linha, type Lote } from './importacao_fixture';

function comMensalidade(...valores: [string, string, string?][]): Lote {
  const d = lote();
  const { cpf, matricula } = d.matriculas[0];
  d.mensalidades = valores.map(([valor, desde, situacao], i): Linha => ({
    linha: i + 2, cpf, convenio: 'Governo do Acre', matricula, valor, vigente_desde: desde, situacao: situacao ?? 'ativa', ade: null,
  }));
  return d;
}
async function mensalidade(c: pg.PoolClient, cpf: string | number | null) {
  const m = await c.query(
    `select m.id, m.situacao, m.requerimento_documento_id, m.importacao_id is not null as marcada,
            public.mensalidade_vigente(m.matricula_id)::text as vigente
     from public.mensalidades m join public.cliente_matriculas cm on cm.id = m.matricula_id
     join public.clientes c on c.id = cm.cliente_id where c.cpf = $1`,
    [cpf],
  );
  return m.rows;
}

describe('0026 mensalidades importadas', () => {
  it('histórico de 3 valores fica nova/reajuste/reajuste e o vigente é o último', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comMensalidade(['40.00', '2025-01-01'], ['30.00', '2023-03-01'], ['35.00', '2024-06-01']);
      const { r } = await gravar(c, s, d);
      expect(r.resumo.Mensalidades).toEqual({ novas: 3, existentes: 0, erros: 0 });
      const [m] = await mensalidade(c, d.clientes[0].cpf);
      expect(m).toMatchObject({ situacao: 'ativa', marcada: true, vigente: '40.00' });
      const v = await c.query(`select valor::text, tipo, vigente_desde::text from public.mensalidade_valores where mensalidade_id = $1 order by vigente_desde`, [m.id]);
      expect(v.rows).toEqual([
        { valor: '30.00', tipo: 'nova', vigente_desde: '2023-03-01' },
        { valor: '35.00', tipo: 'reajuste', vigente_desde: '2024-06-01' },
        { valor: '40.00', tipo: 'reajuste', vigente_desde: '2025-01-01' },
      ]);
    });
  });

  it('mensalidade cancelada não exige requerimento', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comMensalidade(['35.00', '2024-06-01', 'Cancelada']);
      await gravar(c, s, d);
      const [m] = await mensalidade(c, d.clientes[0].cpf);
      expect(m).toMatchObject({ situacao: 'cancelada', requerimento_documento_id: null });
    });
  });

  it('mesmo valor já existente é pulado; valor diferente é erro', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comMensalidade(['35.00', '2024-06-01']);
      await gravar(c, s, d);
      const { r } = await gravar(c, s, d);
      expect(r.resumo.Mensalidades).toEqual({ novas: 0, existentes: 1, erros: 0 });
      d.mensalidades[0].valor = '50.00';
      const r2 = await conferir(c, s, d);
      expect(r2.erros).toContainEqual({ aba: 'Mensalidades', linha: 2, mensagem: 'Esta matrícula já tem mensalidade no sistema.' });
    });
  });

  it('competência repetida é erro', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const r = await conferir(c, s, comMensalidade(['35.00', '2024-06-01'], ['40.00', '2024-06-01']));
      expect(r.erros).toContainEqual({ aba: 'Mensalidades', linha: 3, mensagem: 'Competência repetida na mensalidade desta matrícula.' });
    });
  });

  it('ADE da mensalidade repetido com contrato é recusado; ADE válido fica ativo', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      await gravar(c, s, comContratos({ ade: '555444' }));
      const d = comMensalidade(['35.00', '2024-06-01']);
      d.mensalidades[0].ade = '555444';
      expect((await conferir(c, s, d)).erros).toContainEqual({ aba: 'Mensalidades', linha: 2, mensagem: 'Este ADE já está em uso neste convênio.' });
      d.mensalidades[0].ade = '555333';
      await gravar(c, s, d);
      const a = await c.query(
        `select a.situacao::text, a.valor_averbado::text, a.mensalidade_id is not null as ligada
         from public.mensalidade_averbacoes a where a.ade = '555333'`,
      );
      expect(a.rows).toEqual([{ situacao: 'ativa', valor_averbado: '35.00', ligada: true }]);
    });
  });
});
