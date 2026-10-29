import { describe, expect, it } from 'vitest';
import { comoDono, comoUsuario, criarParceiroTeste, criarUsuarioTeste, emTransacao } from './helpers';

describe('0003 cadastros de apoio', () => {
  it('documento de parceiro é normalizado e único', async () => {
    await emTransacao(async (c) => {
      const ins = `insert into public.parceiros (tipo_pessoa, documento, nome, celular, whatsapp)
                   values ('PF', $1, 'X', '68999990000', '68999990000') returning documento`;
      const r = await c.query(ins, ['529.982.247-25']);
      expect(r.rows[0].documento).toBe('52998224725');
      await expect(c.query(ins, ['52998224725'])).rejects.toThrow(/parceiros_documento_key/);
    });
  });

  it('documento com tamanho errado é recusado em português', async () => {
    await emTransacao(async (c) => {
      await expect(
        c.query(`insert into public.parceiros (tipo_pessoa, documento, nome, celular, whatsapp)
                 values ('PJ', '123', 'X', '68999990000', '68999990000')`),
      ).rejects.toThrow('Documento do parceiro inválido: informe CPF (11 dígitos) ou CNPJ (14 dígitos).');
    });
  });

  it('parceiro só vê a si mesmo, suas contas e seus agentes', async () => {
    await emTransacao(async (c) => {
      const a = await criarParceiroTeste(c, 'A');
      const b = await criarParceiroTeste(c, 'B');
      await c.query(`insert into public.agentes (parceiro_id, nome) values ($1, 'Agente A'), ($2, 'Agente B')`, [a, b]);
      const banco = (await c.query(`select id from public.bancos where codigo = '001'`)).rows[0].id;
      await c.query(
        `insert into public.parceiro_contas (parceiro_id, banco_id, agencia, conta, tipo_conta, principal)
         values ($1, $3, '1', '1', 'corrente', true), ($2, $3, '2', '2', 'corrente', true)`,
        [a, b, banco],
      );
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: a });
      await comoUsuario(c, u);
      expect((await c.query(`select nome from public.parceiros`)).rows).toEqual([{ nome: 'A' }]);
      expect((await c.query(`select nome from public.agentes`)).rows).toEqual([{ nome: 'Agente A' }]);
      expect((await c.query(`select agencia from public.parceiro_contas`)).rows).toEqual([{ agencia: '1' }]);
    });
  });

  it('definir_conta_principal troca a principal', async () => {
    await emTransacao(async (c) => {
      const p = await criarParceiroTeste(c);
      const banco = (await c.query(`select id from public.bancos where codigo = '341'`)).rows[0].id;
      const ids = await c.query(
        `insert into public.parceiro_contas (parceiro_id, banco_id, agencia, conta, tipo_conta, principal)
         values ($1, $2, '1', '1', 'corrente', true), ($1, $2, '2', '2', 'corrente', false) returning id`,
        [p, banco],
      );
      const admin = await criarUsuarioTeste(c, 'administrador');
      await comoUsuario(c, admin);
      await c.query(`select public.definir_conta_principal($1)`, [ids.rows[1].id]);
      const r = await c.query(`select agencia from public.parceiro_contas where principal`);
      expect(r.rows).toEqual([{ agencia: '2' }]);
    });
  });

  it('insert direto de segunda conta principal é recusado', async () => {
    await emTransacao(async (c) => {
      const p = await criarParceiroTeste(c);
      const banco = (await c.query(`select id from public.bancos where codigo = '341'`)).rows[0].id;
      const ins = `insert into public.parceiro_contas (parceiro_id, banco_id, agencia, conta, tipo_conta, principal)
                   values ($1, $2, '1', '1', 'corrente', true)`;
      await c.query(ins, [p, banco]);
      await expect(c.query(ins, [p, banco])).rejects.toThrow(/parceiro_contas_uma_principal/);
    });
  });

  it('consulta não insere parceiro', async () => {
    await emTransacao(async (c) => {
      const u = await criarUsuarioTeste(c, 'consulta');
      await comoUsuario(c, u);
      await expect(
        c.query(`insert into public.parceiros (tipo_pessoa, documento, nome, celular, whatsapp)
                 values ('PF', '52998224725', 'X', '68999990000', '68999990000')`),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('operador não edita banco; gerente edita', async () => {
    await emTransacao(async (c) => {
      const op = await criarUsuarioTeste(c, 'operador');
      const ger = await criarUsuarioTeste(c, 'gerente');
      await comoUsuario(c, op);
      expect((await c.query(`update public.bancos set nome = 'X' where codigo = '001'`)).rowCount).toBe(0);
      await comoDono(c);
      await comoUsuario(c, ger);
      expect((await c.query(`update public.bancos set nome = 'X' where codigo = '001'`)).rowCount).toBe(1);
    });
  });

  it('toda alteração em parceiros é auditada', async () => {
    await emTransacao(async (c) => {
      const p = await criarParceiroTeste(c);
      const r = await c.query(`select acao from public.auditoria where tabela = 'parceiros' and registro_id = $1`, [p]);
      expect(r.rows).toEqual([{ acao: 'INSERT' }]);
    });
  });
});
