import { describe, expect, it } from 'vitest';
import { comoDono, comoUsuario, criarClienteTeste, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { montarTabela } from './tabelas_fixture';

describe('0013 correções da revisão', () => {
  it('administrador não apaga usuário (só desativa)', async () => {
    await emTransacao(async (c) => {
      const admin = await criarUsuarioTeste(c, 'administrador');
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, admin);
      expect(await erroDe(c, `delete from public.usuarios where id = $1`, [op])).toMatch(/permission denied/);
    });
  });

  it('registrar_acesso só aceita ações do próprio app', async () => {
    await emTransacao(async (c) => {
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(await erroDe(c, `select public.registrar_acesso('parceiro_buscar_cliente', '{}')`)).toBe(
        'Ação de acesso inválida.',
      );
      await c.query(`select public.registrar_acesso('login', '{}')`);
      await c.query(`select public.registrar_acesso('download_documento', '{"caminho":"x"}')`);
    });
  });

  it('parceiro não grava simulação (não trava linhas)', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const p = await criarParceiroTeste(c);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, u);
      expect(
        await erroDe(c, `select * from public.simular_por_valor($1, $2, 'novo', 24, 1000, null, '2026-10-28', true)`, [
          f.convenio,
          f.efetivo,
        ]),
      ).toBe('Você não tem permissão para esta ação.');
      await comoDono(c);
      expect((await c.query(`select count(*)::int as n from public.simulacoes`)).rows[0].n).toBe(0);
    });
  });

  it('cadastro pelo parceiro não diferencia CPF existente de matrícula em uso, e registra a tentativa', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const outro = await criarClienteTeste(c);
      const p = await criarParceiroTeste(c);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      const v = (
        await c.query(
          `select c.id as convenio_id, v.id as vinculo_id from public.convenios c
           join public.convenio_vinculos v on v.convenio_id = c.id where c.nome = 'Governo do Acre' and v.nome = 'Efetivo'`,
        )
      ).rows[0];
      await comoUsuario(c, u);
      const base = { nome: 'X', celular: '68911112222', whatsapp: '68911112222', ...v };
      // as duas recusas têm a mesma resposta (nulo), para não revelar qual foi o motivo
      const sql = `select public.parceiro_cadastrar_cliente($1) as id`;
      const r1 = await c.query(sql, [{ ...base, cpf: cli.cpf, matricula: '1' }]);
      const r2 = await c.query(sql, [{ ...base, cpf: '52998224725', matricula: outro.matricula }]);
      expect(r1.rows[0].id).toBeNull();
      expect(r2.rows[0].id).toBeNull();
      await comoDono(c);
      expect((await c.query(`select 1 from public.clientes where cpf = '52998224725'`)).rowCount).toBe(0);
      const a = await c.query(
        `select count(*)::int as n from public.auditoria where acao = 'parceiro_cadastrar_recusado' and usuario_id = $1`,
        [u],
      );
      expect(a.rows[0].n).toBe(2);
    });
  });

  it('parceiro deixa de ler propostas de cliente quando perde o vínculo', async () => {
    await emTransacao(async (c) => {
      const cli = await criarClienteTeste(c);
      const p = await criarParceiroTeste(c);
      await c.query(`insert into public.cliente_parceiros (cliente_id, parceiro_id) values ($1, $2)`, [cli.id, p]);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, u);
      await c.query(`select public.parceiro_propor_alteracao($1, 'dados', '{"email":"a@b.c"}')`, [cli.id]);
      expect((await c.query(`select 1 from public.cliente_alteracoes_pendentes`)).rowCount).toBe(1);
      await comoDono(c);
      await c.query(`delete from public.cliente_parceiros where cliente_id = $1`, [cli.id]);
      await comoUsuario(c, u);
      expect((await c.query(`select 1 from public.cliente_alteracoes_pendentes`)).rowCount).toBe(0);
    });
  });

  it('usuário desativado não registra acesso', async () => {
    await emTransacao(async (c) => {
      const u = await criarUsuarioTeste(c, 'operador', { ativo: false });
      await comoUsuario(c, u);
      expect(await erroDe(c, `select public.registrar_acesso('login', '{}')`)).toBe('Você precisa estar logado.');
    });
  });

  it('linhas_usadas devolve só as linhas com simulação gravada', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const ger = await criarUsuarioTeste(c, 'gerente');
      await comoUsuario(c, ger);
      await c.query(`select * from public.simular_por_valor($1, $2, 'novo', 24, 1000, null, '2026-10-28', true)`, [
        f.convenio,
        f.efetivo,
      ]);
      const r = await c.query(`select public.linhas_usadas($1::uuid[]) as id`, [[f.linhas.l1, f.linhas.l3]]);
      expect(r.rows.map((x) => x.id)).toEqual([f.linhas.l3]);
    });
  });
});
