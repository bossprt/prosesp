import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { assinado, comoServico, contratoAverbado, enviado, preparar, type CenarioAss } from './assinatura_fixture';
import { forcarFase } from './esteira_fixture';

async function erroPreparar(c: pg.PoolClient, s: CenarioAss, usuario = s.operador) {
  await comoUsuario(c, usuario);
  const e = await erroDe(c, `select public.assinatura_preparar($1)`, [s.contrato]);
  await comoDono(c);
  return e;
}
const fase = async (c: pg.PoolClient, id: string) =>
  (await c.query(`select fase::text from public.contratos where id = $1`, [id])).rows[0].fase;
const situacao = async (c: pg.PoolClient, id: string) =>
  (await c.query(`select situacao from public.contrato_assinaturas where id = $1`, [id])).rows[0].situacao;

describe('0031 envio para assinatura', () => {
  it('preparar recusa com mensagem clara em cada caso', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const p = await criarParceiroTeste(c);
      expect(await erroPreparar(c, s, await criarUsuarioTeste(c, 'parceiro', { parceiroId: p }))).toBe('Você não tem permissão para esta ação.');
      await forcarFase(c, s.contrato, 'em_averbacao');
      expect(await erroPreparar(c, s)).toBe('O contrato precisa estar averbado para enviar.');
      await forcarFase(c, s.contrato, 'averbado');
      await c.query(`update public.contratos set legado = true where id = $1`, [s.contrato]);
      expect(await erroPreparar(c, s)).toBe('Contrato importado do sistema anterior não é enviado para assinatura.');
      await c.query(`update public.contratos set legado = false where id = $1`, [s.contrato]);
      await c.query(`update public.contrato_modelos set ativo = false where convenio_id = $1`, [s.convenio]);
      expect(await erroPreparar(c, s)).toBe('Este convênio ainda não tem modelo de contrato.');
      await c.query(`update public.contrato_modelos set ativo = true, teste = true where convenio_id = $1 and versao = 1`, [s.convenio]);
      await c.query(`update public.configuracoes set valor = 'true' where chave = 'ambiente_producao'`);
      expect(await erroPreparar(c, s)).toBe('O modelo deste convênio é de teste e não pode ser usado em produção.');
      await c.query(`update public.configuracoes set valor = 'false' where chave = 'ambiente_producao'`);
      await c.query(`update public.clientes set email = null where id = $1`, [s.cliente]);
      expect(await erroPreparar(c, s)).toBe('O cliente não tem e-mail cadastrado.');
      await c.query(`update public.convenios set assinatura_email = false where id = $1`, [s.convenio]);
      await preparar(c, s);
      expect(await erroPreparar(c, s)).toBe('Este contrato já tem uma assinatura em andamento.');
    });
  });

  it('preparar devolve modelo, dados, configuração e assinantes (cliente primeiro)', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      await c.query(`update public.convenios set assinatura_prazo_dias = 7, assinatura_selfie = false where id = $1`, [s.convenio]);
      await c.query(`insert into public.convenio_assinantes (convenio_id, nome, email, papel, ordem) values ($1, 'Testemunha B', 'b@x.test', 'testemunha', 2), ($1, 'Rep A', 'a@x.test', 'representante', 1)`, [s.convenio]);
      const r = (await preparar(c, s)) as Record<string, any>;
      expect(r.modelo).toMatchObject({ texto: 'Contrato de {cliente.nome}', teste: false, versao: 1 });
      expect(r.config).toMatchObject({ selfie: false, documento: true, codigo: true, email: true, whatsapp: true, prazo: 7 });
      expect(r.assinantes.map((a: { papel: string }) => a.papel)).toEqual(['cliente', 'representante', 'testemunha']);
      expect(r.dados.campos['cliente.nome']).toBe('Cliente Teste');
      const a = await c.query(`select situacao, prazo = current_date + 7 as prazo_ok, valores ? 'valor_parcela' as v from public.contrato_assinaturas where id = $1`, [r.assinatura_id]);
      expect(a.rows[0]).toEqual({ situacao: 'preparando', prazo_ok: true, v: true });
    });
  });

  it('registrar o envio leva o contrato a aguardando assinatura com evento', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await enviado(c, s);
      expect(await situacao(c, e.id)).toBe('enviado');
      expect(await fase(c, s.contrato)).toBe('aguardando_assinatura');
      const ev = await c.query(`select motivo from public.contrato_eventos where contrato_id = $1 and para = 'aguardando_assinatura'`, [s.contrato]);
      expect(ev.rows).toEqual([{ motivo: 'Enviado para assinatura' }]);
    });
  });

  it('falha no envio deixa o contrato averbado e permite novo preparo', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const p = await preparar(c, s);
      await comoServico(c);
      await c.query(`select public._assinatura_falhou($1, 'ZapSign 500')`, [p.assinatura_id]);
      await comoDono(c);
      expect(await situacao(c, p.assinatura_id)).toBe('falhou');
      expect(await fase(c, s.contrato)).toBe('averbado');
      await preparar(c, s);
    });
  });

  it('aviso repetido não muda nada de novo; envio cancelado ignora aviso', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await assinado(c, s);
      const antes = (await c.query(`select assinado_em from public.contrato_assinaturas where id = $1`, [e.id])).rows[0].assinado_em;
      await comoServico(c);
      const r = await c.query(`select public._assinatura_atualizar($1, 'assinado', 'x.pdf', '{}') as r`, [e.token]);
      await comoDono(c);
      expect(r.rows[0].r).toBe('assinado');
      const depois = await c.query(`select assinado_em, pdf_assinado_caminho from public.contrato_assinaturas where id = $1`, [e.id]);
      expect(depois.rows[0].assinado_em).toEqual(antes);
      expect(depois.rows[0].pdf_assinado_caminho).toBe(`${s.contrato}/${e.id}/assinado.pdf`);
      expect((await c.query(`select dados from public.contrato_assinatura_evidencias where assinatura_id = $1`, [e.id])).rows[0].dados)
        .toEqual({ ip: '1.2.3.4' });
      expect(await fase(c, s.contrato)).toBe('aguardando_assinatura');

      const s2 = await contratoAverbado(c, s);
      const e2 = await enviado(c, s2);
      await c.query(`update public.contrato_assinaturas set situacao = 'cancelado' where id = $1`, [e2.id]);
      await comoServico(c);
      const r2 = await c.query(`select public._assinatura_atualizar($1, 'recusado_cliente', null, '{}') as r`, [e2.token]);
      await comoDono(c);
      expect(r2.rows[0].r).toBe('cancelado');
    });
  });

  it('funções internas fechadas ao usuário; mover direto não é mais permitido', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const p = await preparar(c, s);
      await comoUsuario(c, s.gerente);
      expect(await erroDe(c, `select public._assinatura_registrar_envio($1, 'a', 'b', '[]')`, [p.assinatura_id])).toMatch(/permission denied/);
      expect(await erroDe(c, `select public._assinatura_atualizar('b', 'assinado', null, '{}')`)).toMatch(/permission denied/);
      await comoDono(c);
      await c.query(`update public.contrato_assinaturas set situacao = 'falhou' where id = $1`, [p.assinatura_id]);
      await comoUsuario(c, s.gerente);
      expect(await erroDe(c, `select public.mover_contrato($1, 'aguardando_assinatura')`, [s.contrato])).toBe('Esta mudança de fase não é permitida.');
      await comoDono(c);
      await forcarFase(c, s.contrato, 'aguardando_assinatura');
      await comoUsuario(c, s.gerente);
      expect(await erroDe(c, `select public.mover_contrato($1, 'aguardando_pagamento')`, [s.contrato])).toBe('Esta mudança de fase não é permitida.');
    });
  });

  it('vencer marca envio vencido depois do prazo e o contrato fica onde está', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const e = await enviado(c, s);
      const n0 = await c.query(`select public.assinaturas_vencer(current_date + 7) as n`);
      expect(n0.rows[0].n).toBe(0);
      const n = await c.query(`select public.assinaturas_vencer(current_date + 8) as n`);
      expect(n.rows[0].n).toBe(1);
      expect(await situacao(c, e.id)).toBe('vencido');
      expect(await fase(c, s.contrato)).toBe('aguardando_assinatura');
      expect((await c.query(`select 1 from cron.job where jobname = 'assinaturas-vencer'`)).rowCount).toBe(1);
    });
  });
});
