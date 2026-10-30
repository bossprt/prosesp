import { describe, expect, it } from 'vitest';
import { comoDono, comoUsuario, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { comoServico, contratoAverbado, enviado, preparar } from './assinatura_fixture';

describe('0033 reenvio e validação do modelo', () => {
  it('reenvio só com link no ar e traz o contato atual do cliente', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      await comoUsuario(c, s.operador);
      expect(await erroDe(c, `select public.assinatura_para_reenviar($1)`, [s.contrato])).toBe('Não há envio aguardando assinatura para reenviar.');
      await comoDono(c);
      const e = await enviado(c, s);
      await c.query(`update public.clientes set celular = '68988887777', email = 'novo@prosesp.test' where id = $1`, [s.cliente]);
      await comoUsuario(c, s.operador);
      const r = (await c.query(`select public.assinatura_para_reenviar($1) as r`, [s.contrato])).rows[0].r;
      await comoDono(c);
      expect(r).toMatchObject({ assinatura_id: e.id, zapsign_token: e.token, cliente: { celular: '68988887777', email: 'novo@prosesp.test' },
        canais: { email: true, whatsapp: true } });
      await comoServico(c);
      await c.query(`select public._assinatura_reenviada($1, '[{"papel":"cliente","celular":"68988887777"}]')`, [e.id]);
      await comoDono(c);
      const a = (await c.query(`select assinantes, reenvios, ultimo_reenvio_em is not null as em from public.contrato_assinaturas where id = $1`, [e.id])).rows[0];
      expect(a).toEqual({ assinantes: [{ papel: 'cliente', celular: '68988887777' }], reenvios: 1, em: true });
    });
  });

  it('parceiro não reenvia; usuário não chama a função interna', async () => {
    await emTransacao(async (c) => {
      const s = await contratoAverbado(c);
      const p = await preparar(c, s);
      const parc = await criarUsuarioTeste(c, 'parceiro', { parceiroId: await criarParceiroTeste(c) });
      await comoUsuario(c, parc);
      expect(await erroDe(c, `select public.assinatura_para_reenviar($1)`, [s.contrato])).toBe('Você não tem permissão para esta ação.');
      await comoDono(c);
      await comoUsuario(c, s.gerente);
      expect(await erroDe(c, `select public._assinatura_reenviada($1, '[]')`, [p.assinatura_id])).toMatch(/permission denied/);
    });
  });

  it('validar o modelo sem salvar', async () => {
    await emTransacao(async (c) => {
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      await c.query(`select public.validar_modelo_contrato('Olá {cliente.nome}')`);
      expect(await erroDe(c, `select public.validar_modelo_contrato('{x}')`)).toBe('Campo desconhecido: {x}.');
    });
  });
});
