import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  comoAnon,
  comoDono,
  comoUsuario,
  criarClienteTeste,
  criarParceiroTeste,
  criarUsuarioTeste,
  emTransacao,
  erroDe,
} from './helpers';

const BUCKET = 'documentos-clientes';

async function objeto(c: pg.PoolClient, clienteId: string) {
  const nome = `${clienteId}/rg.pdf`;
  await c.query(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, nome]);
  return nome;
}

describe('0010 storage e usuários', () => {
  it('bucket é privado', async () => {
    await emTransacao(async (c) => {
      const r = await c.query(`select public from storage.buckets where id = $1`, [BUCKET]);
      expect(r.rows).toEqual([{ public: false }]);
    });
  });

  it('parceiro não lê objeto de cliente sem vínculo; com vínculo lê', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const nome = await objeto(c, cli.id);
      const p = await criarParceiroTeste(c);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, u);
      expect((await c.query(`select 1 from storage.objects where name = $1`, [nome])).rowCount).toBe(0);
      await comoDono(c);
      await c.query(`insert into public.cliente_parceiros (cliente_id, parceiro_id) values ($1, $2)`, [cli.id, p]);
      await comoUsuario(c, u);
      expect((await c.query(`select 1 from storage.objects where name = $1`, [nome])).rowCount).toBe(1);
    });
  });

  it('parceiro não apaga nem envia', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const nome = await objeto(c, cli.id);
      const p = await criarParceiroTeste(c);
      await c.query(`insert into public.cliente_parceiros (cliente_id, parceiro_id) values ($1, $2)`, [cli.id, p]);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, u);
      // a API do Storage liga esta chave para apagar; aqui testamos só a RLS
      await c.query(`set local storage.allow_delete_query = 'true'`);
      expect((await c.query(`delete from storage.objects where name = $1`, [nome])).rowCount).toBe(0);
      expect(
        await erroDe(c, `insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, `${cli.id}/novo.pdf`]),
      ).toMatch(/row-level security/);
    });
  });

  it('anon não lê nenhum objeto', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      await objeto(c, cli.id);
      await comoAnon(c);
      expect((await c.query(`select 1 from storage.objects where bucket_id = $1`, [BUCKET])).rowCount).toBe(0);
    });
  });

  it('operador lê e envia', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const nome = await objeto(c, cli.id);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect((await c.query(`select 1 from storage.objects where name = $1`, [nome])).rowCount).toBe(1);
      await c.query(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, `${cli.id}/comp.pdf`]);
    });
  });

  it('caminho fora do padrão <cliente_id>/arquivo é recusado', async () => {
    await emTransacao(async (c) => {
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(
        await erroDe(c, `insert into storage.objects (bucket_id, name) values ($1, 'qualquer/coisa.pdf')`, [BUCKET]),
      ).toMatch(/row-level security/);
    });
  });

  it('desativar a si mesmo é recusado; desativar outro funciona', async () => {
    await emTransacao(async (c) => {
      const admin = await criarUsuarioTeste(c, 'administrador');
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, admin);
      expect(await erroDe(c, `select public.desativar_usuario($1)`, [admin])).toBe(
        'Você não pode desativar o seu próprio acesso.',
      );
      await c.query(`select public.desativar_usuario($1)`, [op]);
      expect((await c.query(`select ativo from public.usuarios where id = $1`, [op])).rows[0].ativo).toBe(false);
    });
  });

  it('gerente não desativa usuário', async () => {
    await emTransacao(async (c) => {
      const ger = await criarUsuarioTeste(c, 'gerente');
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, ger);
      expect(await erroDe(c, `select public.desativar_usuario($1)`, [op])).toBe('Você não tem permissão para esta ação.');
    });
  });
});
