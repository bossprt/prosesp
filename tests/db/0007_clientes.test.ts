import { describe, expect, it } from 'vitest';
import { comoDono, comoUsuario, criarClienteTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';

const INS = `insert into public.clientes (cpf, nome, celular, whatsapp) values ($1, 'Fulano', '(68) 99999-0000', '68 99999 0000') returning cpf, celular`;

describe('0007 clientes', () => {
  it('CPF com máscara e sem zero à esquerda vira o mesmo CPF e bate na unicidade', async () => {
    await emTransacao(async (c) => {
      const r = await c.query(INS, ['012.345.678-90']);
      expect(r.rows[0]).toEqual({ cpf: '01234567890', celular: '68999990000' });
      expect(await erroDe(c, INS, ['1234567890'])).toMatch(/clientes_cpf_key/);
    });
  });

  it('CPF com dígito errado é recusado em português', async () => {
    await emTransacao(async (c) => {
      expect(await erroDe(c, INS, ['012.345.678-91'])).toBe('CPF inválido.');
    });
  });

  it('CPF com todos os dígitos iguais é recusado', async () => {
    await emTransacao(async (c) => {
      expect(await erroDe(c, INS, ['111.111.111-11'])).toBe('CPF inválido.');
    });
  });

  it('celular é obrigatório', async () => {
    await emTransacao(async (c) => {
      const msg = await erroDe(
        c,
        `insert into public.clientes (cpf, nome, whatsapp) values ('52998224725', 'X', '68999990000')`,
      );
      expect(msg).toBe('Celular e WhatsApp são obrigatórios, com DDD (10 ou 11 dígitos).');
    });
  });

  it('segunda conta principal troca a anterior pela RPC', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const banco = (await c.query(`select id from public.bancos where codigo = '104'`)).rows[0].id;
      const ids = await c.query(
        `insert into public.cliente_contas (cliente_id, banco_id, agencia, conta, tipo_conta, principal)
         values ($1, $2, '1', '1', 'corrente', true), ($1, $2, '2', '2', 'poupanca', false) returning id`,
        [cli.id, banco],
      );
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      await c.query(`select public.definir_conta_principal_cliente($1)`, [ids.rows[1].id]);
      expect((await c.query(`select agencia from public.cliente_contas where principal`)).rows).toEqual([{ agencia: '2' }]);
    });
  });

  it('insert direto de segunda principal é recusado', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const banco = (await c.query(`select id from public.bancos where codigo = '104'`)).rows[0].id;
      const ins = `insert into public.cliente_contas (cliente_id, banco_id, agencia, conta, tipo_conta, principal)
                   values ($1, $2, '1', '1', 'corrente', true)`;
      await c.query(ins, [cli.id, banco]);
      expect(await erroDe(c, ins, [cli.id, banco])).toMatch(/cliente_contas_uma_principal/);
    });
  });

  it('troca de celular gera histórico', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      await c.query(`update public.clientes set celular = '68988887777' where id = $1`, [cli.id]);
      await comoDono(c);
      const h = await c.query(
        `select campo, antes->>'celular' as antes, depois->>'celular' as depois, usuario_id
         from public.cliente_historico where cliente_id = $1 and campo = 'telefone'`,
        [cli.id],
      );
      expect(h.rows).toEqual([{ campo: 'telefone', antes: '68999990000', depois: '68988887777', usuario_id: op }]);
    });
  });

  it('troca de conta e de matrícula gera histórico', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const banco = (await c.query(`select id from public.bancos where codigo = '104'`)).rows[0].id;
      await c.query(
        `insert into public.cliente_contas (cliente_id, banco_id, agencia, conta, tipo_conta) values ($1, $2, '1', '1', 'corrente')`,
        [cli.id, banco],
      );
      await c.query(`update public.cliente_matriculas set matricula = '999' where cliente_id = $1`, [cli.id]);
      const h = await c.query(`select campo from public.cliente_historico where cliente_id = $1 order by id`, [cli.id]);
      expect(h.rows.map((r) => r.campo)).toEqual(['matricula', 'conta', 'matricula']);
    });
  });

  it('matrícula "000123" e "123" no mesmo convênio colidem', async () => {
    await emTransacao(async (c) => {
      await criarClienteTeste(c, { matricula: '000123' });
      await expect(criarClienteTeste(c, { matricula: '123' })).rejects.toThrow(/cliente_matriculas_unica/);
    });
  });

  it('consulta lê e não edita cliente', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const u = await criarUsuarioTeste(c, 'consulta');
      await comoUsuario(c, u);
      expect((await c.query(`select 1 from public.clientes where id = $1`, [cli.id])).rowCount).toBe(1);
      expect((await c.query(`update public.clientes set nome = 'x' where id = $1`, [cli.id])).rowCount).toBe(0);
    });
  });

  it('financeiro lê matrículas (tem clientes.ver)', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const u = await criarUsuarioTeste(c, 'financeiro');
      await comoUsuario(c, u);
      expect((await c.query(`select 1 from public.cliente_matriculas where cliente_id = $1`, [cli.id])).rowCount).toBe(1);
    });
  });
});
