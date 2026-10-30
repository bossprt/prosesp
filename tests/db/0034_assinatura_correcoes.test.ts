import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { assinado, comoServico, contratoAverbado, enviado, preparar, type CenarioAss } from './assinatura_fixture';

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
const mover = (c: pg.PoolClient, s: CenarioAss, para: string, motivo: string | null = null) =>
  como(c, s.gerente, () => c.query(`select public.mover_contrato($1, $2, $3)`, [s.contrato, para, motivo]));

async function editar(c: pg.PoolClient, s: CenarioAss, quantia: string) {
  const k = (await c.query(`select cliente_id, matricula_id, tipo::text, prazo from public.contratos where id = $1`, [s.contrato])).rows[0];
  await como(c, s.gerente, () => c.query(`select public.editar_contrato($1, $2, 'ajuste de valor')`, [
    s.contrato, { cliente_id: k.cliente_id, matricula_id: k.matricula_id, tipo: k.tipo, prazo: k.prazo, modo: 'valor', quantia },
  ]));
}
const quantiaNova = async (c: pg.PoolClient, s: CenarioAss) =>
  String(Number((await c.query(`select valor_liquido from public.contratos where id = $1`, [s.contrato])).rows[0].valor_liquido) + 100);

async function registrar(c: pg.PoolClient, s: CenarioAss, id: string, token: string) {
  await comoServico(c);
  try {
    await c.query(`select public._assinatura_registrar_envio($1, 'x.pdf', $2, '[]')`, [id, token]);
  } finally {
    await comoDono(c);
  }
}

describe('0034 correções da assinatura', () => {
  it('enviar de novo depois de vencido ou recusado funciona e mantém aguardando assinatura', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await enviado(c, s);
      await c.query(`select public.assinaturas_vencer(current_date + 365)`);
      expect(await situacao(c, e.id)).toBe('vencido');
      const p = await preparar(c, s);
      await registrar(c, s, p.assinatura_id, 'doc-novo-1');
      expect(await situacao(c, p.assinatura_id)).toBe('enviado');
      expect((await fase(c, s.contrato)).fase).toBe('aguardando_assinatura');

      await comoServico(c);
      await c.query(`select public._assinatura_atualizar('doc-novo-1', 'recusado_cliente', null, '{}')`);
      await comoDono(c);
      const p2 = await preparar(c, s);
      expect(await situacao(c, p2.assinatura_id)).toBe('preparando');
    });
  });

  it('pendente vindo de aguardando pagamento: editar valores cancela a assinatura aprovada e volta para averbado', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await assinado(c, s);
      await como(c, s.gerente, () => c.query(`select public.aprovar_assinatura($1)`, [s.contrato]));
      await mover(c, s, 'pendente', 'conferir documento');
      expect(await fase(c, s.contrato)).toEqual({ fase: 'pendente', fase_retorno: 'aguardando_pagamento' });
      await editar(c, s, await quantiaNova(c, s));
      expect(await situacao(c, e.id)).toBe('cancelado');
      expect(await fase(c, s.contrato)).toEqual({ fase: 'pendente', fase_retorno: 'averbado' });
    });
  });

  it('editar valores durante a preparação cancela o envio e o registro é recusado', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const p = await preparar(c, s);
      await editar(c, s, await quantiaNova(c, s));
      expect(await situacao(c, p.assinatura_id)).toBe('cancelado');
      await comoServico(c);
      expect(await erroDe(c, `select public._assinatura_registrar_envio($1, 'x.pdf', 'doc-velho', '[]')`, [p.assinatura_id]))
        .toBe('Este envio não está sendo preparado.');
      await comoDono(c);
    });
  });

  it('trocar dívida por desconto (mesmo líquido) também invalida a assinatura', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      await c.query(`alter table public.contratos disable trigger user`);
      await c.query(`update public.contratos set total_dividas_externas = 20 where id = $1`, [s.contrato]);
      await c.query(`alter table public.contratos enable trigger user`);
      await assinado(c, s);
      await c.query(`alter table public.contratos disable trigger user`);
      await c.query(`update public.contratos set total_descontos = total_descontos + 10, total_dividas_externas = 10 where id = $1`, [s.contrato]);
      await c.query(`alter table public.contratos enable trigger user`);
      expect(await como(c, s.gerente, () => erroDe(c, `select public.aprovar_assinatura($1)`, [s.contrato])))
        .toBe('Os valores do contrato mudaram depois do envio. Envie de novo.');
    });
  });

  it('envio parado em "preparando" há mais de 15 minutos não bloqueia um envio novo', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const p = await preparar(c, s);
      await c.query(`update public.contrato_assinaturas set criado_em = now() - interval '16 minutes' where id = $1`, [p.assinatura_id]);
      const p2 = await preparar(c, s);
      expect(await situacao(c, p.assinatura_id)).toBe('falhou');
      expect(await situacao(c, p2.assinatura_id)).toBe('preparando');
    });
  });

  it('falha ao registrar com documento já criado: guarda o token e pede cancelamento', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const p = await preparar(c, s);
      await comoServico(c);
      await c.query(`select public._assinatura_falhou($1, 'erro', 'doc-orfao')`, [p.assinatura_id]);
      await comoDono(c);
      const a = (await c.query(`select situacao, zapsign_token from public.contrato_assinaturas where id = $1`, [p.assinatura_id])).rows[0];
      expect(a).toEqual({ situacao: 'cancelamento_pendente', zapsign_token: 'doc-orfao' });
    });
  });

  it('aviso de assinatura que chega depois do vencimento ainda é aceito', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await enviado(c, s);
      await c.query(`select public.assinaturas_vencer(current_date + 365)`);
      await comoServico(c);
      const r = await c.query(`select public._assinatura_atualizar($1, 'assinado', 'a.pdf', '{}') as r`, [e.token]);
      await comoDono(c);
      expect(r.rows[0].r).toBe('assinado');
      expect(await situacao(c, e.id)).toBe('assinado');
    });
  });

  it('parceiro não lê os links de assinatura (assinantes) nem o token da ZapSign', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      await enviado(c, s);
      const p = await criarParceiroTeste(c);
      const parc = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await c.query(`update public.contratos set parceiro_id = $2 where id = $1`, [s.contrato, p]);
      await comoUsuario(c, parc);
      expect((await c.query(`select situacao from public.contrato_assinaturas`)).rows).toEqual([{ situacao: 'enviado' }]);
      expect(await erroDe(c, `select assinantes from public.contrato_assinaturas`)).toMatch(/permission denied/);
      expect(await erroDe(c, `select zapsign_token from public.contrato_assinaturas`)).toMatch(/permission denied/);
      await comoDono(c);
    });
  });
});
