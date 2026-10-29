import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  comoDono,
  comoUsuario,
  criarClienteTeste,
  criarParceiroTeste,
  criarUsuarioTeste,
  emTransacao,
  erroDe,
} from './helpers';

async function falta(c: pg.PoolClient, cliente: string, convenio: string) {
  const r = await c.query(`select chave, rotulo from public.o_que_falta($1, $2)`, [cliente, convenio]);
  return r.rows;
}

async function convenioId(c: pg.PoolClient, nome: string) {
  return (await c.query(`select id from public.convenios where nome = $1`, [nome])).rows[0].id as string;
}

describe('0009 o que falta', () => {
  it('cliente só com cadastro rápido e convênio exigindo rg e conta_principal lista os dois', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const acre = await convenioId(c, 'Governo do Acre');
      await c.query(`update public.convenios set campos_obrigatorios = '{rg,conta_principal}' where id = $1`, [acre]);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(await falta(c, cli.id, acre)).toEqual([
        { chave: 'rg', rotulo: 'RG' },
        { chave: 'conta_principal', rotulo: 'Conta bancária principal' },
      ]);
    });
  });

  it('depois de preencher, lista vazia', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const acre = await convenioId(c, 'Governo do Acre');
      await c.query(`update public.convenios set campos_obrigatorios = '{rg,conta_principal,endereco}' where id = $1`, [acre]);
      const banco = (await c.query(`select id from public.bancos where codigo = '001'`)).rows[0].id;
      await c.query(
        `update public.clientes set rg = '123', cep = '69900000', logradouro = 'Rua A', numero = '1',
         bairro = 'Centro', cidade = 'Rio Branco', uf = 'AC' where id = $1`,
        [cli.id],
      );
      await c.query(
        `insert into public.cliente_contas (cliente_id, banco_id, agencia, conta, tipo_conta, principal)
         values ($1, $2, '1', '1', 'corrente', true)`,
        [cli.id, banco],
      );
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(await falta(c, cli.id, acre)).toEqual([]);
    });
  });

  it('sem matrícula no convênio aparece matrícula', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const rb = await convenioId(c, 'Prefeitura de Rio Branco');
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(await falta(c, cli.id, rb)).toEqual([{ chave: 'matricula', rotulo: 'Matrícula neste convênio' }]);
    });
  });

  it('doc_rg só some quando há documento tipo rg', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const acre = await convenioId(c, 'Governo do Acre');
      await c.query(`update public.convenios set campos_obrigatorios = '{doc_rg}' where id = $1`, [acre]);
      await c.query(
        `insert into public.cliente_documentos (cliente_id, tipo, caminho) values ($1::uuid, 'outro', $1::text || '/a.pdf')`,
        [cli.id],
      );
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect((await falta(c, cli.id, acre)).map((r) => r.chave)).toEqual(['doc_rg']);
      await comoDono(c);
      await c.query(
        `insert into public.cliente_documentos (cliente_id, tipo, caminho) values ($1::uuid, 'rg', $1::text || '/rg.pdf')`,
        [cli.id],
      );
      await comoUsuario(c, op);
      expect(await falta(c, cli.id, acre)).toEqual([]);
    });
  });

  it('cônjuge só é exigido de casado ou união estável', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const acre = await convenioId(c, 'Governo do Acre');
      await c.query(`update public.convenios set campos_obrigatorios = '{estado_civil,conjuge}' where id = $1`, [acre]);
      await c.query(`update public.clientes set estado_civil = 'solteiro' where id = $1`, [cli.id]);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(await falta(c, cli.id, acre)).toEqual([]);
      await comoDono(c);
      await c.query(`update public.clientes set estado_civil = 'casado' where id = $1`, [cli.id]);
      await comoUsuario(c, op);
      expect((await falta(c, cli.id, acre)).map((r) => r.chave)).toEqual(['conjuge']);
    });
  });

  it('parceiro não consulta o que falta de cliente que não é dele', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const acre = await convenioId(c, 'Governo do Acre');
      const p = await criarParceiroTeste(c);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, u);
      expect(await erroDe(c, `select * from public.o_que_falta($1, $2)`, [cli.id, acre])).toBe('Cliente não encontrado.');
    });
  });

  it('parceiro não vê documento de cliente que não é dele', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      await c.query(`insert into public.cliente_documentos (cliente_id, tipo, caminho) values ($1::uuid, 'rg', $1::text || '/rg.pdf')`, [
        cli.id,
      ]);
      const p = await criarParceiroTeste(c);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, u);
      expect((await c.query(`select 1 from public.cliente_documentos where cliente_id = $1`, [cli.id])).rowCount).toBe(0);
    });
  });
});
