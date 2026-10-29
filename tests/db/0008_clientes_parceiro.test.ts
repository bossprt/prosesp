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
  gerarCpf,
} from './helpers';

async function cenario(c: pg.PoolClient) {
  const pa = await criarParceiroTeste(c, 'A');
  const pb = await criarParceiroTeste(c, 'B');
  const ua = await criarUsuarioTeste(c, 'parceiro', { parceiroId: pa });
  const ub = await criarUsuarioTeste(c, 'parceiro', { parceiroId: pb });
  const cliB = await criarClienteTeste(c);
  await c.query(`insert into public.cliente_parceiros (cliente_id, parceiro_id) values ($1, $2)`, [cliB.id, pb]);
  const banco = (await c.query(`select id from public.bancos where codigo = '001'`)).rows[0].id;
  await c.query(
    `insert into public.cliente_contas (cliente_id, banco_id, agencia, conta, tipo_conta) values ($1, $2, '1', '1', 'corrente')`,
    [cliB.id, banco],
  );
  await c.query(`insert into public.cliente_beneficiarios (cliente_id, nome) values ($1, 'Benef')`, [cliB.id]);
  const conv = (
    await c.query(
      `select c.id as convenio, v.id as vinculo from public.convenios c join public.convenio_vinculos v on v.convenio_id = c.id
       where c.nome = 'Governo do Acre' and v.nome = 'Efetivo'`,
    )
  ).rows[0];
  return { pa, pb, ua, ub, cliB, banco, ...conv };
}

describe('0008 acesso do parceiro', () => {
  it('parceiro A não vê cliente do parceiro B nem por id direto', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoUsuario(c, s.ua);
      for (const [tabela, col] of [
        ['clientes', 'id'],
        ['cliente_matriculas', 'cliente_id'],
        ['cliente_contas', 'cliente_id'],
        ['cliente_beneficiarios', 'cliente_id'],
        ['cliente_historico', 'cliente_id'],
      ]) {
        const r = await c.query(`select 1 from public.${tabela} where ${col} = $1`, [s.cliB.id]);
        expect(r.rowCount, tabela).toBe(0);
      }
      await comoDono(c);
      await comoUsuario(c, s.ub);
      expect((await c.query(`select 1 from public.clientes where id = $1`, [s.cliB.id])).rowCount).toBe(1);
      expect((await c.query(`select 1 from public.cliente_contas where cliente_id = $1`, [s.cliB.id])).rowCount).toBe(1);
    });
  });

  it('busca com CPF certo e matrícula errada não devolve nada e é auditada', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoUsuario(c, s.ua);
      const r = await c.query(`select * from public.parceiro_buscar_cliente($1, '999999')`, [s.cliB.cpf]);
      expect(r.rowCount).toBe(0);
      await comoDono(c);
      const a = await c.query(
        `select detalhe->>'encontrado' as e from public.auditoria where acao = 'parceiro_buscar_cliente' and usuario_id = $1`,
        [s.ua],
      );
      expect(a.rows).toEqual([{ e: 'false' }]);
    });
  });

  it('busca com CPF e matrícula certos devolve os dados e não cria vínculo', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoUsuario(c, s.ua);
      const cpfComMascara = s.cliB.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      const r = await c.query(`select cliente_id, nome, celular from public.parceiro_buscar_cliente($1, $2)`, [
        cpfComMascara,
        '00' + s.cliB.matricula,
      ]);
      expect(r.rows).toEqual([{ cliente_id: s.cliB.id, nome: 'Cliente Teste', celular: '68999990000' }]);
      expect((await c.query(`select 1 from public.clientes where id = $1`, [s.cliB.id])).rowCount).toBe(0);
    });
  });

  it('operador não usa a busca do parceiro', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(await erroDe(c, `select * from public.parceiro_buscar_cliente($1, $2)`, [s.cliB.cpf, s.cliB.matricula])).toBe(
        'Você não tem permissão para esta ação.',
      );
    });
  });

  it('adotar cria vínculo e passa a ver o cliente', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoUsuario(c, s.ua);
      const r = await c.query(`select public.parceiro_adotar_cliente($1, $2) as id`, [s.cliB.cpf, s.cliB.matricula]);
      expect(r.rows[0].id).toBe(s.cliB.id);
      expect((await c.query(`select 1 from public.clientes where id = $1`, [s.cliB.id])).rowCount).toBe(1);
    });
  });

  it('adotar com matrícula errada é recusado sem revelar nada', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoUsuario(c, s.ua);
      expect(await erroDe(c, `select public.parceiro_adotar_cliente($1, '1')`, [s.cliB.cpf])).toBe(
        'Cliente não encontrado com este CPF e matrícula.',
      );
    });
  });

  it('parceiro não faz update direto em clientes', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoUsuario(c, s.ub);
      expect((await c.query(`update public.clientes set nome = 'x' where id = $1`, [s.cliB.id])).rowCount).toBe(0);
      expect(
        await erroDe(c, `insert into public.cliente_beneficiarios (cliente_id, nome) values ($1, 'x')`, [s.cliB.id]),
      ).toMatch(/row-level security/);
    });
  });

  it('parceiro cadastra cliente novo e passa a vê-lo', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoUsuario(c, s.ua);
      const dados = {
        nome: 'Novo Cliente',
        cpf: gerarCpf(987654321),
        celular: '68911112222',
        whatsapp: '68911112222',
        convenio_id: s.convenio,
        vinculo_id: s.vinculo,
        matricula: '555444',
      };
      const id = (await c.query(`select public.parceiro_cadastrar_cliente($1) as id`, [dados])).rows[0].id;
      expect((await c.query(`select nome from public.clientes where id = $1`, [id])).rows).toEqual([{ nome: 'Novo Cliente' }]);
      expect((await c.query(`select matricula from public.cliente_matriculas where cliente_id = $1`, [id])).rows).toEqual([
        { matricula: '555444' },
      ]);
    });
  });

  it('parceiro cadastrando CPF existente recebe a mensagem de usar a busca', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoUsuario(c, s.ua);
      const dados = {
        nome: 'X',
        cpf: s.cliB.cpf,
        celular: '68911112222',
        whatsapp: '68911112222',
        convenio_id: s.convenio,
        vinculo_id: s.vinculo,
        matricula: '1',
      };
      expect(await erroDe(c, `select public.parceiro_cadastrar_cliente($1)`, [dados])).toBe(
        'Este CPF já está cadastrado. Use a busca por CPF e matrícula.',
      );
    });
  });

  it('alteração proposta não muda o cadastro até ser aprovada; operador aprova', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoUsuario(c, s.ub);
      const alt = (
        await c.query(`select public.parceiro_propor_alteracao($1, 'dados', '{"celular":"68977776666"}') as id`, [s.cliB.id])
      ).rows[0].id;
      expect((await c.query(`select celular from public.clientes where id = $1`, [s.cliB.id])).rows[0].celular).toBe(
        '68999990000',
      );
      await comoDono(c);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      await c.query(`select public.aprovar_alteracao($1)`, [alt]);
      expect((await c.query(`select celular from public.clientes where id = $1`, [s.cliB.id])).rows[0].celular).toBe(
        '68977776666',
      );
      const h = await c.query(
        `select usuario_id from public.cliente_historico where cliente_id = $1 and campo = 'telefone'`,
        [s.cliB.id],
      );
      expect(h.rows).toEqual([{ usuario_id: op }]);
      expect((await c.query(`select status from public.cliente_alteracoes_pendentes where id = $1`, [alt])).rows[0].status).toBe(
        'aprovada',
      );
    });
  });

  it('alteração de conta aprovada cria a conta', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoUsuario(c, s.ub);
      const proposta = { banco_id: s.banco, agencia: '9', conta: '9', tipo_conta: 'corrente' };
      const alt = (
        await c.query(`select public.parceiro_propor_alteracao($1, 'conta', $2) as id`, [s.cliB.id, proposta])
      ).rows[0].id;
      await comoDono(c);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      await c.query(`select public.aprovar_alteracao($1)`, [alt]);
      expect((await c.query(`select 1 from public.cliente_contas where cliente_id = $1 and agencia = '9'`, [s.cliB.id])).rowCount).toBe(1);
    });
  });

  it('proposta com campo não permitido é recusada', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoUsuario(c, s.ub);
      expect(
        await erroDe(c, `select public.parceiro_propor_alteracao($1, 'dados', '{"cpf":"52998224725"}')`, [s.cliB.id]),
      ).toBe('Campo não pode ser alterado por esta proposta: cpf');
    });
  });

  it('parceiro A não propõe alteração em cliente de B', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoUsuario(c, s.ua);
      expect(
        await erroDe(c, `select public.parceiro_propor_alteracao($1, 'dados', '{"celular":"68977776666"}')`, [s.cliB.id]),
      ).toBe('Você não tem permissão para esta ação.');
    });
  });

  it('recusar sem motivo é recusado', async () => {
    await emTransacao(async (c) => {
      const s = await cenario(c);
      await comoUsuario(c, s.ub);
      const alt = (
        await c.query(`select public.parceiro_propor_alteracao($1, 'dados', '{"email":"a@b.c"}') as id`, [s.cliB.id])
      ).rows[0].id;
      await comoDono(c);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(await erroDe(c, `select public.recusar_alteracao($1, '  ')`, [alt])).toBe('Informe o motivo da recusa.');
      await c.query(`select public.recusar_alteracao($1, 'Telefone não confere')`, [alt]);
      expect((await c.query(`select status from public.cliente_alteracoes_pendentes where id = $1`, [alt])).rows[0].status).toBe(
        'recusada',
      );
    });
  });
});
