import { describe, expect, it } from 'vitest';
import { comoDono, comoUsuario, criarUsuarioTeste, emTransacao } from './helpers';

describe('0002 auditoria', () => {
  it('alteração numa tabela auditada grava antes e depois com o usuário', async () => {
    await emTransacao(async (c) => {
      const admin = await criarUsuarioTeste(c, 'administrador');
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, admin);
      await c.query(`update public.usuarios set nome = 'Novo Nome' where id = $1`, [op]);
      await comoDono(c);
      const r = await c.query(
        `select usuario_id, acao, antes->>'nome' as antes, depois->>'nome' as depois
         from public.auditoria where tabela = 'usuarios' and registro_id = $1 and acao = 'UPDATE'`,
        [op],
      );
      expect(r.rows).toEqual([{ usuario_id: admin, acao: 'UPDATE', antes: 'Teste operador', depois: 'Novo Nome' }]);
    });
  });

  it('operador não lê auditoria', async () => {
    await emTransacao(async (c) => {
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect((await c.query(`select 1 from public.auditoria`)).rowCount).toBe(0);
    });
  });

  it('gerente lê auditoria', async () => {
    await emTransacao(async (c) => {
      const gerente = await criarUsuarioTeste(c, 'gerente');
      await comoUsuario(c, gerente);
      expect((await c.query(`select 1 from public.auditoria`)).rowCount).toBeGreaterThan(0);
    });
  });

  it('ninguém apaga registro de auditoria, nem o dono do banco', async () => {
    await emTransacao(async (c) => {
      await criarUsuarioTeste(c, 'consulta');
      await expect(c.query(`delete from public.auditoria`)).rejects.toThrow(
        'Registros de auditoria não podem ser alterados.',
      );
    });
  });

  it('ninguém altera registro de auditoria', async () => {
    await emTransacao(async (c) => {
      await criarUsuarioTeste(c, 'consulta');
      await expect(c.query(`update public.auditoria set acao = 'x'`)).rejects.toThrow(
        'Registros de auditoria não podem ser alterados.',
      );
    });
  });

  it('usuário logado não insere direto na auditoria', async () => {
    await emTransacao(async (c) => {
      const admin = await criarUsuarioTeste(c, 'administrador');
      await comoUsuario(c, admin);
      await expect(c.query(`insert into public.auditoria (acao) values ('falso')`)).rejects.toThrow();
    });
  });

  it('registrar_acesso grava acao e detalhe', async () => {
    await emTransacao(async (c) => {
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      await c.query(`select public.registrar_acesso('login', '{"ip":"x"}'::jsonb)`);
      await comoDono(c);
      const r = await c.query(`select usuario_id, detalhe->>'ip' as ip from public.auditoria where acao = 'login'`);
      expect(r.rows).toEqual([{ usuario_id: op, ip: 'x' }]);
    });
  });
});
