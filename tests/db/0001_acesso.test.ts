import { describe, expect, it } from 'vitest';
import { comoAnon, comoDono, comoUsuario, criarUsuarioTeste, emTransacao } from './helpers';

describe('0001 acesso', () => {
  it('app_pode devolve true para administrador e false para consulta em convenios.editar', async () => {
    await emTransacao(async (c) => {
      const admin = await criarUsuarioTeste(c, 'administrador');
      const consulta = await criarUsuarioTeste(c, 'consulta');
      await comoUsuario(c, admin);
      expect((await c.query(`select public.app_pode('convenios.editar') as p`)).rows[0].p).toBe(true);
      await comoDono(c);
      await comoUsuario(c, consulta);
      expect((await c.query(`select public.app_pode('convenios.editar') as p`)).rows[0].p).toBe(false);
    });
  });

  it('usuário inativo não tem perfil', async () => {
    await emTransacao(async (c) => {
      const u = await criarUsuarioTeste(c, 'operador', { ativo: false });
      await comoUsuario(c, u);
      expect((await c.query(`select public.app_perfil() as p`)).rows[0].p).toBeNull();
      expect((await c.query(`select public.app_pode('clientes.ver') as p`)).rows[0].p).toBe(false);
    });
  });

  it('anon não tem nenhuma permissão', async () => {
    await emTransacao(async (c) => {
      await comoAnon(c);
      expect((await c.query(`select public.app_pode('clientes.ver') as p`)).rows[0].p).toBe(false);
    });
  });

  it('app_exigir recusa em português', async () => {
    await emTransacao(async (c) => {
      const u = await criarUsuarioTeste(c, 'consulta');
      await comoUsuario(c, u);
      await expect(c.query(`select public.app_exigir('convenios.editar')`)).rejects.toThrow(
        'Você não tem permissão para esta ação.',
      );
    });
  });

  it('não é possível dar apoio.editar ao perfil parceiro', async () => {
    await emTransacao(async (c) => {
      await expect(
        c.query(`insert into public.perfil_permissoes (perfil, permissao) values ('parceiro', 'apoio.editar')`),
      ).rejects.toThrow('Esta permissão não pode ser dada ao perfil parceiro.');
    });
  });

  it('administrador não altera o próprio perfil', async () => {
    await emTransacao(async (c) => {
      const admin = await criarUsuarioTeste(c, 'administrador');
      await comoUsuario(c, admin);
      await expect(
        c.query(`update public.usuarios set perfil = 'consulta' where id = $1`, [admin]),
      ).rejects.toThrow('Você não pode alterar o seu próprio perfil ou acesso.');
    });
  });

  it('gerente não altera usuários (sem usuarios.gerenciar)', async () => {
    await emTransacao(async (c) => {
      const gerente = await criarUsuarioTeste(c, 'gerente');
      const outro = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, gerente);
      const r = await c.query(`update public.usuarios set nome = 'x' where id = $1`, [outro]);
      expect(r.rowCount).toBe(0);
    });
  });

  it('operador não lê a linha de outro usuário', async () => {
    await emTransacao(async (c) => {
      const op = await criarUsuarioTeste(c, 'operador');
      const outro = await criarUsuarioTeste(c, 'consulta');
      await comoUsuario(c, op);
      expect((await c.query(`select id from public.usuarios where id = $1`, [outro])).rowCount).toBe(0);
      expect((await c.query(`select id from public.usuarios where id = $1`, [op])).rowCount).toBe(1);
    });
  });

  it('matriz padrão: parceiro tem só as do teto (Etapa 2 acrescentou contratos.ver e contratos.digitar)', async () => {
    await emTransacao(async (c) => {
      const r = await c.query(
        `select array_agg(permissao order by permissao) as p from public.perfil_permissoes where perfil = 'parceiro'`,
      );
      expect(r.rows[0].p).toEqual([
        'clientes.editar', 'clientes.ver', 'contratos.digitar', 'contratos.ver', 'convenios.ver', 'simulador.usar',
      ]);
    });
  });
});
