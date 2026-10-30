import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { assinado, comoServico, contratoAverbado, enviado, type CenarioAss } from './assinatura_fixture';

const fase = async (c: pg.PoolClient, id: string) =>
  (await c.query(`select fase::text, fase_retorno::text from public.contratos where id = $1`, [id])).rows[0];
const situacao = async (c: pg.PoolClient, id: string) =>
  (await c.query(`select situacao from public.contrato_assinaturas where id = $1`, [id])).rows[0].situacao;

async function como<T>(c: pg.PoolClient, u: string, fn: () => Promise<T>): Promise<T> {
  await comoUsuario(c, u);
  try {
    return await fn();
  } finally {
    await comoDono(c);
  }
}
const aprovar = (c: pg.PoolClient, s: CenarioAss) => como(c, s.gerente, () => c.query(`select public.aprovar_assinatura($1)`, [s.contrato]));
const erroAprovar = (c: pg.PoolClient, s: CenarioAss, u = s.gerente) =>
  como(c, u, () => erroDe(c, `select public.aprovar_assinatura($1)`, [s.contrato]));
const mover = (c: pg.PoolClient, s: CenarioAss, para: string, motivo: string | null = null) =>
  como(c, s.gerente, () => c.query(`select public.mover_contrato($1, $2, $3)`, [s.contrato, para, motivo]));

/** Edita o contrato pela função da tela, mudando a quantia (valores mudam). */
async function editarValor(c: pg.PoolClient, s: CenarioAss, quantia: string) {
  const k = (await c.query(`select cliente_id, matricula_id, tipo::text, prazo from public.contratos where id = $1`, [s.contrato])).rows[0];
  await como(c, s.gerente, () => c.query(`select public.editar_contrato($1, $2, 'ajuste de valor')`, [
    s.contrato, { cliente_id: k.cliente_id, matricula_id: k.matricula_id, tipo: k.tipo, prazo: k.prazo, modo: 'valor', quantia },
  ]));
}

describe('0032 conferência da assinatura', () => {
  it('aprovar exige envio assinado e leva a aguardando pagamento', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await enviado(c, s);
      expect(await erroAprovar(c, s)).toBe('Não há assinatura para conferir.');
      await comoServico(c);
      await c.query(`select public._assinatura_atualizar($1, 'assinado', 'x.pdf', '{}')`, [e.token]);
      await comoDono(c);
      await aprovar(c, s);
      expect((await fase(c, s.contrato)).fase).toBe('aguardando_pagamento');
      const a = (await c.query(`select situacao, conferido_por, conferido_em is not null as em from public.contrato_assinaturas where id = $1`, [e.id])).rows[0];
      expect(a).toEqual({ situacao: 'aprovado', conferido_por: s.gerente, em: true });
      const ev = await c.query(`select motivo from public.contrato_eventos where contrato_id = $1 and para = 'aguardando_pagamento'`, [s.contrato]);
      expect(ev.rows).toEqual([{ motivo: 'Assinatura conferida' }]);
    });
  });

  it('valores diferentes do PDF: aprovar é recusado e nada muda', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await assinado(c, s);
      await c.query(`alter table public.contratos disable trigger user`);
      await c.query(`update public.contratos set valor_parcela = valor_parcela + 1 where id = $1`, [s.contrato]);
      await c.query(`alter table public.contratos enable trigger user`);
      expect(await erroAprovar(c, s)).toBe('Os valores do contrato mudaram depois do envio. Envie de novo.');
      expect(await situacao(c, e.id)).toBe('assinado');
      expect((await fase(c, s.contrato)).fase).toBe('aguardando_assinatura');
    });
  });

  it('perfil consulta não aprova', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      await assinado(c, s);
      expect(await erroAprovar(c, s, await criarUsuarioTeste(c, 'consulta'))).toBe('Você não tem permissão para esta ação.');
    });
  });

  it('editar valor com link no ar: pede cancelamento na ZapSign e volta a averbado', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await enviado(c, s);
      await editarValor(c, s, '1200.00');
      expect(await situacao(c, e.id)).toBe('cancelamento_pendente');
      expect((await fase(c, s.contrato)).fase).toBe('averbado');
      const ev = await c.query(`select motivo from public.contrato_eventos where contrato_id = $1 and de = 'aguardando_assinatura' and para = 'averbado'`, [s.contrato]);
      expect(ev.rows).toEqual([{ motivo: 'Valores alterados: nova assinatura necessária' }]);
    });
  });

  it('editar valor depois de assinado ou aprovado: assinatura cancelada e volta a averbado', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await assinado(c, s);
      await editarValor(c, s, '1200.00');
      expect(await situacao(c, e.id)).toBe('cancelado');
      expect((await fase(c, s.contrato)).fase).toBe('averbado');

      const s2 = await contratoAverbado(c, s);
      const e2 = await assinado(c, s2);
      await aprovar(c, s2);
      await editarValor(c, s2, '1300.00');
      expect(await situacao(c, e2.id)).toBe('cancelado');
      expect((await fase(c, s2.contrato)).fase).toBe('averbado');
    });
  });

  it('editar sem mudar valor não cancela', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await enviado(c, s);
      await editarValor(c, s, '1000.00');
      expect(await situacao(c, e.id)).toBe('enviado');
      expect((await fase(c, s.contrato)).fase).toBe('aguardando_assinatura');
    });
  });

  it('pendente na assinatura cancela o envio e, corrigido, volta para averbado', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await enviado(c, s);
      await mover(c, s, 'pendente', 'Celular errado');
      expect(await situacao(c, e.id)).toBe('cancelamento_pendente');
      expect(await fase(c, s.contrato)).toEqual({ fase: 'pendente', fase_retorno: 'averbado' });
      await mover(c, s, 'averbado');
      expect((await fase(c, s.contrato)).fase).toBe('averbado');
    });
  });

  it('recusar cancela o envio aberto; pendente em aguardando pagamento mantém a assinatura aprovada', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await assinado(c, s);
      await mover(c, s, 'recusado', 'Desistiu');
      expect(await situacao(c, e.id)).toBe('cancelado');

      const s2 = await contratoAverbado(c, s);
      const e2 = await assinado(c, s2);
      await aprovar(c, s2);
      await mover(c, s2, 'pendente', 'Conta bancária errada');
      expect(await situacao(c, e2.id)).toBe('aprovado');
      expect(await fase(c, s2.contrato)).toEqual({ fase: 'pendente', fase_retorno: 'aguardando_pagamento' });
    });
  });

  it('cancelamento na ZapSign: falha fica na lista, sucesso sai; listas trazem os casos certos', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await enviado(c, s);
      await mover(c, s, 'pendente', 'x');
      await comoServico(c);
      await c.query(`select public._assinatura_cancelamento_feito($1, false, 'ZapSign fora do ar')`, [e.id]);
      await comoDono(c);
      const lista = (t: string) => como(c, s.operador, async () =>
        (await c.query(`select public.assinaturas_lista($1) as l`, [t])).rows.map((r) => r.l));
      const l = await lista('cancelar');
      expect(l).toHaveLength(1);
      expect(l[0]).toMatchObject({ contrato_id: s.contrato, situacao: 'cancelamento_pendente', erro: 'ZapSign fora do ar' });
      await comoServico(c);
      await c.query(`select public._assinatura_cancelamento_feito($1, true, null)`, [e.id]);
      await comoDono(c);
      expect(await situacao(c, e.id)).toBe('cancelado');
      expect(await lista('cancelar')).toHaveLength(0);

      const s2 = await contratoAverbado(c, s);
      await assinado(c, s2);
      expect((await lista('conferir')).map((x) => x.contrato_id)).toEqual([s2.contrato]);
      const s3 = await contratoAverbado(c, s);
      await enviado(c, s3);
      await c.query(`select public.assinaturas_vencer(current_date + 30)`);
      expect((await lista('vencidas')).map((x) => x.contrato_id)).toEqual([s3.contrato]);
      expect(await como(c, s.operador, () => erroDe(c, `select public.assinaturas_lista('outra')`))).toBe('Lista inválida.');
    });
  });
});
