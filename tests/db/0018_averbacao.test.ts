import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, criarClienteTeste, emTransacao, erroDe } from './helpers';
import { cenarioEsteira, digitar, forcarFase, type Cenario } from './esteira_fixture';

const ADE = `select public.registrar_ade($1, $2, $3)`;
const MOVER = `select public.mover_contrato($1, $2::public.fase_contrato, $3)`;

async function emAverbacao(c: pg.PoolClient, s: Cenario, modo = 'seguro') {
  await c.query(`update public.convenios set ade_modo = $2, ade_regex = '^\\d{6,10}$', ade_descricao = '6 a 10 números' where id = $1`, [
    s.f.convenio,
    modo,
  ]);
  const id = await digitar(c, s);
  await forcarFase(c, id, 'em_averbacao', true);
  // por padrão o contrato não mexe na mensalidade (o teste da mensalidade liga de volta)
  await c.query(`update public.contratos set mensalidade_proposta = null where id = $1`, [id]);
  return id;
}

describe('0018 averbação', () => {
  it('modo seguro recusa confirmação diferente', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await emAverbacao(c, s);
      await comoUsuario(c, s.operador);
      expect(await erroDe(c, ADE, [id, '1234567', '1234568'])).toBe('As duas digitações do ADE não são iguais.');
      expect(await erroDe(c, ADE, [id, '1234567', null])).toBe('As duas digitações do ADE não são iguais.');
    });
  });

  it('ADE com espaços é gravado aparado e bate na unicidade', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const a = await emAverbacao(c, s, 'rapido');
      const b = await digitar(c, s);
      await forcarFase(c, b, 'em_averbacao', true);
      await comoUsuario(c, s.operador);
      await c.query(ADE, [a, ' 1234567 ', null]);
      expect(await erroDe(c, ADE, [b, '1234567', null])).toBe('Este ADE já está em uso neste convênio.');
      await comoDono(c);
      expect((await c.query(`select ade from public.contrato_averbacoes where contrato_id = $1`, [a])).rows[0].ade).toBe('1234567');
    });
  });

  it('ADE fora do formato mostra a descrição do convênio', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await emAverbacao(c, s, 'rapido');
      await comoUsuario(c, s.operador);
      expect(await erroDe(c, ADE, [id, 'AB12', null])).toBe('ADE fora do formato do convênio: 6 a 10 números.');
    });
  });

  it('não entra em averbado sem ADE ativo', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await emAverbacao(c, s);
      await comoUsuario(c, s.operador);
      expect(await erroDe(c, MOVER, [id, 'averbado', null])).toBe('Registre o ADE do contrato antes de marcar como averbado.');
      await c.query(ADE, [id, '1234567', '1234567']);
      await c.query(MOVER, [id, 'averbado', null]);
    });
  });

  it('contrato que aumenta mensalidade exige ADE da mensalidade para averbado', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await emAverbacao(c, s);
      await c.query(`update public.contratos set mensalidade_proposta = 35 where id = $1`, [id]);
      await comoUsuario(c, s.operador);
      await c.query(ADE, [id, '1234567', '1234567']);
      expect(await erroDe(c, MOVER, [id, 'averbado', null])).toBe('Registre também o ADE da mensalidade antes de marcar como averbado.');
      await c.query(`select public.registrar_ade_mensalidade($1, '7654321', '7654321')`, [id]);
      await c.query(MOVER, [id, 'averbado', null]);
      await comoDono(c);
      expect((await c.query(`select situacao, valor_averbado from public.mensalidade_averbacoes where contrato_origem_id = $1`, [id])).rows[0]).toEqual({
        situacao: 'proposta', valor_averbado: '35.00',
      });
    });
  });

  it('recusar contrato averbado cria pendência cancelar e marca cancelamento_pendente; resolver cancela', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await emAverbacao(c, s);
      await comoUsuario(c, s.operador);
      await c.query(ADE, [id, '1234567', '1234567']);
      await c.query(MOVER, [id, 'averbado', null]);
      await comoDono(c);
      await comoUsuario(c, s.gerente);
      await c.query(MOVER, [id, 'recusado', 'Cliente desistiu']);
      await comoDono(c);
      expect((await c.query(`select situacao from public.contrato_averbacoes where contrato_id = $1`, [id])).rows[0].situacao).toBe(
        'cancelamento_pendente',
      );
      const p = (await c.query(`select id, tipo from public.pendencias_averbadora where contrato_id = $1`, [id])).rows[0];
      expect(p.tipo).toBe('cancelar');
      await comoUsuario(c, s.operador);
      await c.query(`select public.resolver_pendencia($1)`, [p.id]);
      await comoDono(c);
      expect((await c.query(`select situacao from public.contrato_averbacoes where contrato_id = $1`, [id])).rows[0].situacao).toBe('cancelada');
    });
  });

  it('editar averbado cria pendência ajustar', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await emAverbacao(c, s);
      await comoUsuario(c, s.gerente);
      await c.query(`select public.editar_contrato($1, $2, 'valor menor')`, [
        id,
        { cliente_id: s.cliente, matricula_id: s.matricula, tipo: 'novo', prazo: 24, modo: 'valor', quantia: '600.00' },
      ]);
      await comoDono(c);
      expect((await c.query(`select tipo from public.pendencias_averbadora where contrato_id = $1`, [id])).rows).toEqual([{ tipo: 'ajustar' }]);
    });
  });

  it('reaverbar substitui o ADE', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await emAverbacao(c, s);
      await comoUsuario(c, s.operador);
      await c.query(ADE, [id, '1234567', '1234567']);
      await c.query(`select public.reaverbar($1, '2222222', '2222222')`, [id]);
      await comoDono(c);
      const r = await c.query(`select ade, situacao from public.contrato_averbacoes where contrato_id = $1 order by criado_em, ade`, [id]);
      expect(r.rows).toEqual([
        { ade: '1234567', situacao: 'substituida' },
        { ade: '2222222', situacao: 'ativa' },
      ]);
    });
  });

  it('migrar matrícula com valor menor guarda valor_averbado e marca a antiga como migrada', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await emAverbacao(c, s);
      const nova = (
        await c.query(
          `insert into public.cliente_matriculas (cliente_id, convenio_id, vinculo_id, matricula) values ($1, $2, $3, '888777') returning id`,
          [s.cliente, s.f.convenio, s.f.efetivo],
        )
      ).rows[0].id;
      await comoUsuario(c, s.operador);
      await c.query(ADE, [id, '1234567', '1234567']);
      await c.query(`select public.migrar_matricula($1, $2, '3333333', '3333333', 50.00)`, [id, nova]);
      await comoDono(c);
      expect((await c.query(`select matricula_id from public.contratos where id = $1`, [id])).rows[0].matricula_id).toBe(nova);
      const r = await c.query(
        `select ade, situacao, valor_averbado, migrada_para is not null as ligada from public.contrato_averbacoes where contrato_id = $1 order by criado_em, ade`,
        [id],
      );
      expect(r.rows).toEqual([
        { ade: '1234567', situacao: 'migrada', valor_averbado: '61.20', ligada: true },
        { ade: '3333333', situacao: 'ativa', valor_averbado: '50.00', ligada: false },
      ]);
    });
  });

  it('migrar para matrícula de outro cliente é recusado', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await emAverbacao(c, s);
      const outro = await criarClienteTeste(c);
      const mOutro = (await c.query(`select id from public.cliente_matriculas where cliente_id = $1`, [outro.id])).rows[0].id;
      await comoUsuario(c, s.operador);
      await c.query(ADE, [id, '1234567', '1234567']);
      expect(await erroDe(c, `select public.migrar_matricula($1, $2, '3333333', '3333333', 50)`, [id, mOutro])).toBe(
        'A nova matrícula precisa ser do mesmo cliente e do mesmo convênio.',
      );
    });
  });
});
