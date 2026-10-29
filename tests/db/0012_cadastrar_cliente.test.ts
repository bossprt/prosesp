import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoUsuario, criarClienteTeste, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe, gerarCpf } from './helpers';

async function dados(c: pg.PoolClient, extra: Record<string, string> = {}) {
  const v = (
    await c.query(
      `select c.id as convenio_id, v.id as vinculo_id from public.convenios c
       join public.convenio_vinculos v on v.convenio_id = c.id where c.nome = 'Governo do Acre' and v.nome = 'Efetivo'`,
    )
  ).rows[0];
  return { nome: 'Fulana', cpf: gerarCpf(123456789), celular: '68999990000', whatsapp: '68999990000', matricula: '777', ...v, ...extra };
}

describe('0012 cadastrar_cliente (equipe)', () => {
  it('cria cliente e matrícula juntos', async () => {
    await emTransacao(async (c) => {
      const d = await dados(c);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      const id = (await c.query(`select public.cadastrar_cliente($1) as id`, [d])).rows[0].id;
      expect((await c.query(`select matricula from public.cliente_matriculas where cliente_id = $1`, [id])).rows).toEqual([
        { matricula: '777' },
      ]);
    });
  });

  it('matrícula repetida não deixa cliente sem matrícula', async () => {
    await emTransacao(async (c) => {
      await criarClienteTeste(c, { matricula: '777' });
      const d = await dados(c);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(await erroDe(c, `select public.cadastrar_cliente($1)`, [d])).toBe(
        'Esta matrícula já está cadastrada neste convênio.',
      );
      expect((await c.query(`select 1 from public.clientes where cpf = $1`, [d.cpf])).rowCount).toBe(0);
    });
  });

  it('parceiro não usa o cadastro da equipe', async () => {
    await emTransacao(async (c) => {
      const d = await dados(c);
      const p = await criarParceiroTeste(c);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, u);
      expect(await erroDe(c, `select public.cadastrar_cliente($1)`, [d])).toBe('Você não tem permissão para esta ação.');
    });
  });
});
