import { describe, expect, it } from 'vitest';
import { comoDono, comoUsuario, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { inserirContratoBase } from './contratos_fixture';

describe('0015 contratos', () => {
  it('valor_liquido = bruto - descontos - quitado - dívidas', async () => {
    await emTransacao(async (c) => {
      const k = await inserirContratoBase(c);
      await c.query(
        `update public.contratos set total_descontos = 50, total_quitado = 300, total_dividas_externas = 100 where id = $1`,
        [k.id],
      );
      expect((await c.query(`select valor_liquido from public.contratos where id = $1`, [k.id])).rows[0].valor_liquido).toBe(
        '550.00',
      );
    });
  });

  it('líquido negativo é recusado com a mensagem', async () => {
    await emTransacao(async (c) => {
      const k = await inserirContratoBase(c);
      expect(await erroDe(c, `update public.contratos set total_quitado = 1200 where id = $1`, [k.id])).toBe(
        'O valor líquido ficou negativo: os descontos e quitações passam do valor do contrato.',
      );
    });
  });

  it('convênio e vínculo vêm da matrícula', async () => {
    await emTransacao(async (c) => {
      const k = await inserirContratoBase(c);
      const r = await c.query(
        `select c.convenio_id = m.convenio_id and c.vinculo_id = m.vinculo_id as ok
         from public.contratos c join public.cliente_matriculas m on m.id = c.matricula_id where c.id = $1`,
        [k.id],
      );
      expect(r.rows[0].ok).toBe(true);
    });
  });

  it('parceiro vê só os próprios contratos; com a configuração ligada vê os do cliente vinculado', async () => {
    await emTransacao(async (c) => {
      const pa = await criarParceiroTeste(c, 'A');
      const pb = await criarParceiroTeste(c, 'B');
      const ka = await inserirContratoBase(c, { parceiroId: pa });
      const kb = await inserirContratoBase(c, { parceiroId: pb, cliente: { id: ka.clienteId, matriculaId: ka.matriculaId } });
      await c.query(`insert into public.cliente_parceiros (cliente_id, parceiro_id) values ($1, $2)`, [ka.clienteId, pa]);
      const ua = await criarUsuarioTeste(c, 'parceiro', { parceiroId: pa });
      await comoUsuario(c, ua);
      expect((await c.query(`select id from public.contratos`)).rows.map((r) => r.id)).toEqual([ka.id]);
      await comoDono(c);
      await c.query(`update public.configuracoes set valor = 'true' where chave = 'parceiro_ve_todos_contratos'`);
      await comoUsuario(c, ua);
      expect((await c.query(`select id from public.contratos order by numero`)).rows.map((r) => r.id)).toEqual([ka.id, kb.id]);
    });
  });

  it('parceiro e operador não leem comissão; financeiro lê', async () => {
    await emTransacao(async (c) => {
      const p = await criarParceiroTeste(c);
      const k = await inserirContratoBase(c, { parceiroId: p });
      await c.query(`insert into public.contrato_comissao_regra (contrato_id, percentual, base) values ($1, 8, 'liquido')`, [k.id]);
      const up = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      const op = await criarUsuarioTeste(c, 'operador');
      const fin = await criarUsuarioTeste(c, 'financeiro');
      for (const [u, n] of [[up, 0], [op, 0], [fin, 1]] as const) {
        await comoDono(c);
        await comoUsuario(c, u);
        expect((await c.query(`select 1 from public.contrato_comissao_regra`)).rowCount).toBe(n);
      }
    });
  });

  it('parceiro não lê versões; operador lê', async () => {
    await emTransacao(async (c) => {
      const p = await criarParceiroTeste(c);
      const k = await inserirContratoBase(c, { parceiroId: p });
      await c.query(`insert into public.contrato_versoes (contrato_id, versao, dados) values ($1, 1, '{}')`, [k.id]);
      const up = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, up);
      expect((await c.query(`select 1 from public.contrato_versoes`)).rowCount).toBe(0);
      await comoDono(c);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect((await c.query(`select 1 from public.contrato_versoes`)).rowCount).toBe(1);
    });
  });

  it('ninguém insere direto em contratos nem em eventos', async () => {
    await emTransacao(async (c) => {
      const k = await inserirContratoBase(c);
      const admin = await criarUsuarioTeste(c, 'administrador');
      await comoUsuario(c, admin);
      expect(await erroDe(c, `update public.contratos set valor_bruto = 1 where id = $1`, [k.id])).toMatch(/permission denied/);
      expect(
        await erroDe(c, `insert into public.contrato_eventos (contrato_id, para) values ($1, 'digitado')`, [k.id]),
      ).toMatch(/permission denied/);
    });
  });

  it('eventos não podem ser alterados', async () => {
    await emTransacao(async (c) => {
      const k = await inserirContratoBase(c);
      await c.query(`insert into public.contrato_eventos (contrato_id, para) values ($1, 'digitado')`, [k.id]);
      expect(await erroDe(c, `delete from public.contrato_eventos`)).toBe('O histórico do contrato não pode ser alterado.');
    });
  });

  it('agente de outro parceiro é recusado', async () => {
    await emTransacao(async (c) => {
      const pa = await criarParceiroTeste(c, 'A');
      const pb = await criarParceiroTeste(c, 'B');
      const ag = (await c.query(`insert into public.agentes (parceiro_id, nome) values ($1, 'Ag B') returning id`, [pb])).rows[0].id;
      const k = await inserirContratoBase(c, { parceiroId: pa });
      expect(await erroDe(c, `update public.contratos set agente_id = $2 where id = $1`, [k.id, ag])).toBe(
        'O agente não pertence ao parceiro do contrato.',
      );
    });
  });

  it('mesmo contrato não fica reservado por dois refins', async () => {
    await emTransacao(async (c) => {
      const antigo = await inserirContratoBase(c, { situacao: 'ativo', fase: 'credito_liberado' });
      const cli = { id: antigo.clienteId, matriculaId: antigo.matriculaId };
      const r1 = await inserirContratoBase(c, { cliente: cli, tipo: 'refinanciamento' });
      const r2 = await inserirContratoBase(c, { cliente: cli, tipo: 'refinanciamento' });
      const ins = `insert into public.contrato_quitacoes (contrato_id, contrato_quitado_id, saldo_devedor, fonte) values ($1, $2, 400, 'calculo')`;
      await c.query(ins, [r1.id, antigo.id]);
      expect(await erroDe(c, ins, [r2.id, antigo.id])).toMatch(/contrato_quitacoes_reserva_unica/);
    });
  });
});
