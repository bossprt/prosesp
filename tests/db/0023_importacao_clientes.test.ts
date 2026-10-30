import { describe, expect, it } from 'vitest';
import { comoDono, comoUsuario, criarClienteTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { cenarioImportacao, conferir, gravar, juntar, lote, novaMatricula, novoCpf } from './importacao_fixture';

const NAO_IMPORTADO = 'Não importado: há erro em outra linha deste CPF.';

describe('0023 importação de clientes e matrículas', () => {
  it('conferir não grava nada', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = lote();
      const r = await conferir(c, s, d);
      expect(r.resumo.Clientes).toEqual({ novas: 1, existentes: 0, erros: 0 });
      expect(r.resumo['Matrículas']).toEqual({ novas: 1, existentes: 0, erros: 0 });
      expect(r.erros).toEqual([]);
      expect((await c.query(`select 1 from public.clientes where cpf = $1`, [d.clientes[0].cpf])).rowCount).toBe(0);
    });
  });

  it('gravar cria cliente e matrícula com importacao_id; WhatsApp vazio fica igual ao celular', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = lote();
      const { id } = await gravar(c, s, d);
      const cli = await c.query(`select id, whatsapp, importacao_id from public.clientes where cpf = $1`, [d.clientes[0].cpf]);
      expect(cli.rows[0]).toMatchObject({ whatsapp: '68999990000', importacao_id: id });
      const m = await c.query(`select importacao_id from public.cliente_matriculas where cliente_id = $1`, [cli.rows[0].id]);
      expect(m.rows).toEqual([{ importacao_id: id }]);
      expect((await c.query(`select situacao from public.importacoes where id = $1`, [id])).rows[0].situacao).toBe('gravada');
    });
  });

  it('reenviar o mesmo lote marca tudo como existente', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = lote();
      await gravar(c, s, d);
      const { r } = await gravar(c, s, d);
      expect(r.resumo.Clientes).toEqual({ novas: 0, existentes: 1, erros: 0 });
      expect(r.resumo['Matrículas']).toEqual({ novas: 0, existentes: 1, erros: 0 });
    });
  });

  it('cliente existente com outro nome gera aviso e não é alterado', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const cli = await criarClienteTeste(c, { nome: 'Maria S.' });
      const d = lote(cli.cpf, cli.matricula);
      const { r } = await gravar(c, s, d);
      expect(r.avisos).toEqual([
        { aba: 'Clientes', linha: 2, mensagem: 'Cliente já cadastrado com outro nome (Maria S.). Os dados dele não foram alterados.' },
      ]);
      expect((await c.query(`select nome from public.clientes where id = $1`, [cli.id])).rows[0].nome).toBe('Maria S.');
    });
  });

  it('convênio com maiúsculas e acento diferentes é encontrado', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = lote();
      d.matriculas[0].convenio = 'GOVÊRNO  DO ACRE';
      d.matriculas[0].vinculo = 'efetivo';
      const r = await conferir(c, s, d);
      expect(r.erros).toEqual([]);
    });
  });

  it('CPF inválido afasta o CPF inteiro e não atrapalha os outros', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const ruim = lote('12345678900');
      const bom = lote();
      const { r } = await gravar(c, s, juntar(ruim, bom));
      expect(r.erros).toEqual([
        { aba: 'Clientes', linha: 2, mensagem: 'CPF inválido.' },
        { aba: 'Matrículas', linha: 2, mensagem: NAO_IMPORTADO },
      ]);
      expect(r.resumo.Clientes).toEqual({ novas: 1, existentes: 0, erros: 1 });
      expect((await c.query(`select 1 from public.clientes where cpf = $1`, [bom.clientes[0].cpf])).rowCount).toBe(1);
    });
  });

  it('matrícula de outro cliente é recusada e convênio inexistente também', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const outro = await criarClienteTeste(c);
      const d = lote(novoCpf(), outro.matricula);
      const r = await conferir(c, s, d);
      expect(r.erros).toEqual([
        { aba: 'Clientes', linha: 2, mensagem: NAO_IMPORTADO },
        { aba: 'Matrículas', linha: 2, mensagem: 'Esta matrícula pertence a outro cliente.' },
      ]);
      const d2 = lote();
      d2.matriculas[0].convenio = 'Prefeitura de Lugar Nenhum';
      expect((await conferir(c, s, d2)).erros[1]).toEqual({
        aba: 'Matrículas', linha: 2, mensagem: 'Convênio não encontrado: Prefeitura de Lugar Nenhum.',
      });
    });
  });

  it('CPF fora da aba Clientes e do banco é erro', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = lote();
      d.clientes = [];
      const r = await conferir(c, s, d);
      expect(r.erros).toEqual([{ aba: 'Matrículas', linha: 2, mensagem: 'Cliente não encontrado: inclua o CPF na aba Clientes.' }]);
    });
  });

  it('operador não consegue conferir', async () => {
    await emTransacao(async (c) => {
      await cenarioImportacao(c);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(await erroDe(c, `select public.importacao_conferir($1)`, [lote()])).toBe('Você não tem permissão para esta ação.');
    });
  });

  it('iniciar recusa arquivo já importado sem erros', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      await gravar(c, s, lote(), 'mesmo-hash');
      await comoUsuario(c, s.admin);
      const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      expect(await erroDe(c, `select public.importacao_iniciar('a.xlsx', null, 'mesmo-hash', '2026-10-01')`)).toBe(
        `Este arquivo já foi importado em ${hoje}.`,
      );
      await comoDono(c);
    });
  });

  it('lote de 300 CPFs grava em menos de 8 segundos', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = juntar(...Array.from({ length: 300 }, () => lote(novoCpf(), novaMatricula())));
      const t = Date.now();
      const { r } = await gravar(c, s, d);
      expect(Date.now() - t).toBeLessThan(8000);
      expect(r.resumo.Clientes.novas).toBe(300);
    });
  });
});
