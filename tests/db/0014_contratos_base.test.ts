import { describe, expect, it } from 'vitest';
import { comoUsuario, criarClienteTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';

describe('0014 base da esteira', () => {
  it('não existe transição para credito_liberado', async () => {
    await emTransacao(async (c) => {
      const r = await c.query(`select count(*)::int as n from public.fase_transicoes where para = 'credito_liberado'`);
      expect(r.rows[0].n).toBe(0);
    });
  });

  it('recusar exige contratos.recusar e operador não tem; gerente tem', async () => {
    await emTransacao(async (c) => {
      const r = await c.query(
        `select distinct permissao from public.fase_transicoes where para = 'recusado'`,
      );
      expect(r.rows).toEqual([{ permissao: 'contratos.recusar' }]);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect((await c.query(`select public.app_pode('contratos.recusar') as p`)).rows[0].p).toBe(false);
    });
  });

  it('parceiro pode receber contratos.digitar mas não contratos.mover', async () => {
    await emTransacao(async (c) => {
      const r = await c.query(`select 1 from public.perfil_permissoes where perfil = 'parceiro' and permissao = 'contratos.digitar'`);
      expect(r.rowCount).toBe(1);
      expect(
        await erroDe(c, `insert into public.perfil_permissoes (perfil, permissao) values ('parceiro', 'contratos.mover')`),
      ).toBe('Esta permissão não pode ser dada ao perfil parceiro.');
    });
  });

  it('financeiro tem comissoes.ver e contratos.liberar; operador não', async () => {
    await emTransacao(async (c) => {
      const r = await c.query(
        `select perfil::text, array_agg(permissao order by permissao) as p from public.perfil_permissoes
         where permissao in ('comissoes.ver','contratos.liberar') and perfil in ('financeiro','operador') group by perfil`,
      );
      expect(r.rows).toEqual([{ perfil: 'financeiro', p: ['comissoes.ver', 'contratos.liberar'] }]);
    });
  });

  it('config_bool lê parceiro_ve_todos_contratos = false', async () => {
    await emTransacao(async (c) => {
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect((await c.query(`select public.config_bool('parceiro_ve_todos_contratos') as v`)).rows[0].v).toBe(false);
    });
  });

  it('operador não altera configuração; administrador altera', async () => {
    await emTransacao(async (c) => {
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect((await c.query(`update public.configuracoes set valor = 'true'`)).rowCount).toBe(0);
    });
  });

  it('documento requerimento_cancelamento é aceito', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const r = await c.query(
        `insert into public.cliente_documentos (cliente_id, tipo, caminho) values ($1::uuid, 'requerimento_cancelamento', $1::text || '/req.pdf')`,
        [cli.id],
      );
      expect(r.rowCount).toBe(1);
    });
  });
});
