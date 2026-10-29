import { describe, expect, it } from 'vitest';
import { comoDono, comoUsuario, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { inserirContratoBase } from './contratos_fixture';
import { cenarioEsteira, digitar, forcarFase } from './esteira_fixture';

const MOVER = `select public.mover_contrato($1, $2::public.fase_contrato, $3)`;

describe('0017 esteira', () => {
  it('transição fora da matriz é recusada', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await digitar(c, s);
      await comoUsuario(c, s.operador);
      expect(await erroDe(c, MOVER, [id, 'averbado', null])).toBe('Esta mudança de fase não é permitida.');
    });
  });

  it('ninguém move para credito_liberado pela esteira', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await digitar(c, s);
      await forcarFase(c, id, 'aguardando_pagamento', true);
      const admin = await criarUsuarioTeste(c, 'administrador');
      await comoUsuario(c, admin);
      expect(await erroDe(c, MOVER, [id, 'credito_liberado', null])).toBe('Esta mudança de fase não é permitida.');
    });
  });

  it('operador não recusa; gerente recusa com motivo; sem motivo é recusado', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await digitar(c, s);
      await comoUsuario(c, s.operador);
      expect(await erroDe(c, MOVER, [id, 'recusado', 'x'])).toBe('Você não tem permissão para esta ação.');
      await comoDono(c);
      await comoUsuario(c, s.gerente);
      expect(await erroDe(c, MOVER, [id, 'recusado', ' '])).toBe('Informe o motivo.');
      await c.query(MOVER, [id, 'recusado', 'Cliente desistiu']);
      await comoDono(c);
      expect((await c.query(`select fase, situacao from public.contratos where id = $1`, [id])).rows[0]).toEqual({
        fase: 'recusado', situacao: 'cancelado',
      });
    });
  });

  it('pendente guarda e volta para a fase anterior', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await digitar(c, s);
      await comoUsuario(c, s.operador);
      await c.query(MOVER, [id, 'em_validacao', null]);
      await c.query(MOVER, [id, 'pendente', 'Falta comprovante']);
      expect(await erroDe(c, MOVER, [id, 'digitado', null])).toBe('Esta mudança de fase não é permitida.');
      await c.query(MOVER, [id, 'em_validacao', null]);
      await comoDono(c);
      expect((await c.query(`select fase, fase_retorno from public.contratos where id = $1`, [id])).rows[0]).toEqual({
        fase: 'em_validacao', fase_retorno: null,
      });
    });
  });

  it('sair de em_validacao com cadastro incompleto lista o que falta', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      await c.query(`update public.convenios set campos_obrigatorios = '{rg,conta_principal}' where id = $1`, [s.f.convenio]);
      const id = await digitar(c, s);
      await forcarFase(c, id, 'em_validacao');
      await comoUsuario(c, s.operador);
      expect(await erroDe(c, MOVER, [id, 'em_averbacao', null])).toBe(
        'Ainda falta no cadastro: RG, Conta bancária principal.',
      );
    });
  });

  it('entrar em em_averbacao trava os valores e pendente não destrava', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await digitar(c, s);
      await forcarFase(c, id, 'em_validacao');
      await comoUsuario(c, s.operador);
      await c.query(MOVER, [id, 'em_averbacao', null]);
      await c.query(MOVER, [id, 'pendente', 'Conferir margem']);
      await comoDono(c);
      expect((await c.query(`select valores_travados_em is not null as t from public.contratos where id = $1`, [id])).rows[0].t).toBe(true);
    });
  });

  it('recusar libera a reserva do contrato quitado', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const lr = await c.query(
        `insert into public.tabela_linhas (tabela_id, vinculo_id, tipo, prazo, vigencia, fator) values ($1, $2, 'refinanciamento', 24, '[2026-01-01,)', 0.0612) returning id`,
        [s.f.tabela, s.f.efetivo],
      );
      await c.query(`insert into public.tabela_linha_comissoes (linha_id, percentual, base) values ($1, 6, 'liquido')`, [lr.rows[0].id]);
      const antigo = await inserirContratoBase(c, { cliente: { id: s.cliente, matriculaId: s.matricula }, situacao: 'ativo', fase: 'credito_liberado' });
      const id = await digitar(c, s, {
        tipo: 'refinanciamento',
        quitacoes: [{ contrato_quitado_id: antigo.id, saldo_devedor: '300.00', fonte: 'calculo' }],
      });
      await comoUsuario(c, s.gerente);
      await c.query(MOVER, [id, 'recusado', 'Desistência']);
      await comoDono(c);
      expect((await c.query(`select reservado from public.contrato_quitacoes where contrato_id = $1`, [id])).rows[0].reservado).toBe(false);
    });
  });

  it('parceiro cancela a própria pré-digitação; não cancela depois que a equipe mexeu', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const p = await criarParceiroTeste(c);
      await c.query(`insert into public.cliente_parceiros (cliente_id, parceiro_id) values ($1, $2)`, [s.cliente, p]);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      const dados = { cliente_id: s.cliente, matricula_id: s.matricula, tipo: 'novo', prazo: 24, modo: 'valor', quantia: '1000.00' };
      await comoUsuario(c, u);
      const a = (await c.query(`select public.pre_digitar_contrato($1) as id`, [dados])).rows[0].id;
      const b = (await c.query(`select public.pre_digitar_contrato($1) as id`, [dados])).rows[0].id;
      await c.query(`select public.cancelar_pre_digitacao($1, 'Errei o valor')`, [a]);
      await comoDono(c);
      await comoUsuario(c, s.operador);
      await c.query(`select public.devolver_pre_digitacao($1, 'Confira a matrícula')`, [b]);
      await comoDono(c);
      await comoUsuario(c, u);
      expect(await erroDe(c, `select public.cancelar_pre_digitacao($1, 'x')`, [b])).toBe(
        'A equipe já está cuidando desta pré-digitação. Peça o cancelamento à PROSESP.',
      );
      await comoDono(c);
      expect((await c.query(`select fase from public.contratos where id = $1`, [a])).rows[0].fase).toBe('cancelado');
    });
  });

  it('aprovar pré-digitação com tabela alterada devolve a diferença sem mover; confirmar aplica', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const p = await criarParceiroTeste(c);
      await c.query(`insert into public.cliente_parceiros (cliente_id, parceiro_id) values ($1, $2)`, [s.cliente, p]);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, u);
      const id = (
        await c.query(`select public.pre_digitar_contrato($1) as id`, [
          { cliente_id: s.cliente, matricula_id: s.matricula, tipo: 'novo', prazo: 24, modo: 'valor', quantia: '1000.00' },
        ])
      ).rows[0].id;
      await comoDono(c);
      await c.query(`update public.tabela_linhas set fator = 0.07 where id = $1`, [s.f.linhas.l3]);
      await comoUsuario(c, s.operador);
      const r = (await c.query(`select public.aprovar_pre_digitacao($1) as r`, [id])).rows[0].r;
      expect(r.mudou).toBe(true);
      expect(r.antes.valor_parcela).toBe(61.2);
      expect(r.depois.valor_parcela).toBe(70);
      await comoDono(c);
      expect((await c.query(`select fase from public.contratos where id = $1`, [id])).rows[0].fase).toBe('pre_digitacao');
      await comoUsuario(c, s.operador);
      await c.query(`select public.confirmar_aprovacao($1)`, [id]);
      await comoDono(c);
      expect((await c.query(`select fase, valor_parcela from public.contratos where id = $1`, [id])).rows[0]).toEqual({
        fase: 'digitado', valor_parcela: '70.00',
      });
    });
  });

  it('pré-digitação sem mudança é aprovada direto', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const p = await criarParceiroTeste(c);
      await c.query(`insert into public.cliente_parceiros (cliente_id, parceiro_id) values ($1, $2)`, [s.cliente, p]);
      const u = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await comoUsuario(c, u);
      const id = (
        await c.query(`select public.pre_digitar_contrato($1) as id`, [
          { cliente_id: s.cliente, matricula_id: s.matricula, tipo: 'novo', prazo: 24, modo: 'valor', quantia: '1000.00' },
        ])
      ).rows[0].id;
      await comoDono(c);
      await comoUsuario(c, s.operador);
      expect((await c.query(`select public.aprovar_pre_digitacao($1) as r`, [id])).rows[0].r).toEqual({ mudou: false });
      await comoDono(c);
      expect((await c.query(`select fase from public.contratos where id = $1`, [id])).rows[0].fase).toBe('digitado');
    });
  });

  it('toda mudança gera evento com quem e motivo', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await digitar(c, s);
      await comoUsuario(c, s.operador);
      await c.query(MOVER, [id, 'pendente', 'Falta RG']);
      await comoDono(c);
      const e = await c.query(
        `select de, para, motivo, usuario_id from public.contrato_eventos where contrato_id = $1 order by id desc limit 1`,
        [id],
      );
      expect(e.rows[0]).toEqual({ de: 'digitado', para: 'pendente', motivo: 'Falta RG', usuario_id: s.operador });
    });
  });
});
