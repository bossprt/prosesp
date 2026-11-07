import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { cenarioImportacao, comContratos, gravar as gravarImp } from './importacao_fixture';
import { cenarioRetorno, comoFin, gravarRet, linha, novoHash, parcela, type CenarioRet } from './retorno_fixture';

const VINCULAR = `select public.retorno_vincular_linha($1, $2, $3, $4) as r`;
const IGNORAR = `select public.retorno_ignorar_linha($1, $2)`;
const BAIXAR = `select public.diferenca_baixar($1, $2, $3)`;
const DESFAZER = `select public.retorno_desfazer($1, $2)`;

const linhaDe = async (c: pg.PoolClient, retorno: string, situacao: string) =>
  (await c.query(`select id from public.retorno_linhas where retorno_id = $1 and situacao = $2 order by linha limit 1`, [retorno, situacao])).rows[0].id;
const situacaoContrato = async (c: pg.PoolClient, id: string) =>
  (await c.query(`select situacao from public.contratos where id = $1`, [id])).rows[0].situacao;

async function parcialGravado(c: pg.PoolClient, s: CenarioRet) {
  const menor = (Number(s.valorParcela) - 5).toFixed(2);
  return gravarRet(c, s, [linha(s, { valor: menor })]);
}

describe('0037 tratar linhas', () => {
  it('vincular linha não encontrada aplica o pagamento; linha tratada não muda mais', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const r = await gravarRet(c, s, [linha(s, { ade: '424242' })]);
      const l = await linhaDe(c, r.retorno_id, 'nao_encontrada');
      await comoUsuario(c, s.fin);
      expect(await erroDe(c, VINCULAR, [l, s.contrato, null, ' '])).toBe('Informe o motivo.');
      const res = (await c.query(VINCULAR, [l, s.contrato, null, 'ADE digitado errado na averbadora'])).rows[0].r;
      expect(res.status).toBe('paga');
      expect(await erroDe(c, VINCULAR, [l, s.contrato, null, 'de novo'])).toBe('Esta linha já foi tratada.');
      expect(await erroDe(c, IGNORAR, [l, 'x'])).toBe('Esta linha já foi tratada.');
      await comoDono(c);
      expect(await parcela(c, s.contrato)).toMatchObject({ status: 'paga', saldo: '0.00' });
      const t = (await c.query(`select tratamento, tratamento_motivo, contrato_id, valor_aplicado::text from public.retorno_linhas where id = $1`, [l])).rows[0];
      expect(t).toEqual({ tratamento: 'vinculada', tratamento_motivo: 'ADE digitado errado na averbadora', contrato_id: s.contrato, valor_aplicado: s.valorParcela });
    });
  });

  it('vincular a outra parcela (regularização) e recusas de valor, convênio e situação', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const r = await gravarRet(c, s, [linha(s, { ade: '1' }), linha(s, { ade: '2', valor: '999999.00' }), linha(s)]);
      const linhas = (await c.query(`select id from public.retorno_linhas where retorno_id = $1 order by linha`, [r.retorno_id])).rows.map((x) => x.id);
      const dez = (await c.query(`select id from public.parcelas where contrato_id = $1 and competencia = '2026-12-01'`, [s.contrato])).rows[0].id;
      await comoUsuario(c, s.fin);
      expect(await erroDe(c, VINCULAR, [linhas[1], s.contrato, dez, 'm'])).toBe('O desconto é maior que o saldo da parcela.');
      expect(await erroDe(c, VINCULAR, [linhas[2], s.contrato, null, 'm'])).toBe('Só linhas não encontradas ou divergentes podem ser vinculadas.');
      // novembro já pago pela 3ª linha; a 1ª vai para dezembro
      expect(await erroDe(c, VINCULAR, [linhas[0], s.contrato, null, 'm'])).toBe('Esta parcela já está paga.');
      await c.query(VINCULAR, [linhas[0], s.contrato, dez, 'regularização de dezembro']);
      await comoDono(c);
      expect((await parcela(c, s.contrato, '2026-12-01')).status).toBe('paga');
      await c.query(`update public.contratos set situacao = 'quitado' where id = $1`, [s.contrato]);
      await comoUsuario(c, s.fin);
      expect(await erroDe(c, VINCULAR, [linhas[1], s.contrato, null, 'm'])).toBe('O contrato precisa ser do mesmo convênio e estar ativo.');
      await comoDono(c);
    });
  });

  it('ignorar exige motivo; não descontada pode ser marcada como vista; sem permissão recusa', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const r = await gravarRet(c, s, [linha(s, { valor: null })], { tipo: 'nao_descontados' });
      const l = await linhaDe(c, r.retorno_id, 'nao_descontada');
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(await erroDe(c, IGNORAR, [l, 'visto'])).toBe('Você não tem permissão para esta ação.');
      await comoDono(c);
      await comoUsuario(c, s.fin);
      expect(await erroDe(c, IGNORAR, [l, ''])).toBe('Informe o motivo.');
      expect(await erroDe(c, VINCULAR, [l, s.contrato, null, 'm'])).toBe('Linhas de não descontados não podem ser vinculadas.');
      await c.query(IGNORAR, [l, 'Cliente avisado']);
      await comoDono(c);
      expect((await c.query(`select tratamento from public.retorno_linhas where id = $1`, [l])).rows[0].tratamento).toBe('ignorada');
    });
  });
});

describe('0037 baixa de diferença', () => {
  it('só gerente/admin, com motivo, e só com diferença de desconto parcial', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const outra = (await c.query(`select id from public.parcelas where contrato_id = $1 and competencia = '2026-12-01'`, [s.contrato])).rows[0].id;
      await parcialGravado(c, s);
      const p = await parcela(c, s.contrato);
      await comoUsuario(c, s.fin);
      expect(await erroDe(c, BAIXAR, [p.id, null, 'acordo'])).toBe('Você não tem permissão para esta ação.');
      await comoDono(c);
      await comoUsuario(c, s.gerente);
      expect(await erroDe(c, BAIXAR, [p.id, null, ''])).toBe('Informe o motivo.');
      expect(await erroDe(c, BAIXAR, [outra, null, 'x'])).toBe('Só parcelas com desconto parcial têm diferença para dar baixa.');
      expect(await erroDe(c, BAIXAR, [null, null, 'x'])).toBe('Informe a parcela.');
      await c.query(BAIXAR, [p.id, null, 'Diferença de arredondamento da folha']);
      await comoDono(c);
      expect(await parcela(c, s.contrato)).toMatchObject({ status: 'paga', saldo: '0.00', baixado: '5.00' });
    });
  });
});

describe('0037 desfazer retorno', () => {
  it('apaga os pagamentos (inclusive vinculados), recalcula e libera o mesmo arquivo', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const hash = novoHash();
      await c.query(`update public.parcelas set vencimento = '2026-11-01', status = 'atrasada' where contrato_id = $1 and competencia = '2026-11-01'`, [s.contrato]);
      await c.query(`update public.contratos set situacao = 'em_atraso' where id = $1`, [s.contrato]);
      const r = await gravarRet(c, s, [linha(s), linha(s, { ade: '7', competencia: '2026-11-01' })], { hash });
      const dez = (await c.query(`select id from public.parcelas where contrato_id = $1 and competencia = '2026-12-01'`, [s.contrato])).rows[0].id;
      const l = await linhaDe(c, r.retorno_id, 'nao_encontrada');
      await comoFin(c, s.fin, () => c.query(VINCULAR, [l, s.contrato, dez, 'regularização']));
      expect(await situacaoContrato(c, s.contrato)).toBe('ativo');

      await comoUsuario(c, s.fin);
      expect(await erroDe(c, DESFAZER, [r.retorno_id, 'arquivo errado'])).toBe('Você não tem permissão para esta ação.');
      await comoDono(c);
      await comoUsuario(c, s.gerente);
      expect(await erroDe(c, DESFAZER, [r.retorno_id, ''])).toBe('Informe o motivo.');
      await c.query(DESFAZER, [r.retorno_id, 'Competência errada']);
      expect(await erroDe(c, DESFAZER, [r.retorno_id, 'de novo'])).toBe('Este retorno já foi desfeito.');
      await comoDono(c);
      expect(await parcela(c, s.contrato)).toMatchObject({ status: 'atrasada', pago: '0.00' });
      expect((await parcela(c, s.contrato, '2026-12-01')).pago).toBe('0.00');
      expect(await situacaoContrato(c, s.contrato)).toBe('em_atraso');
      expect((await c.query(`select count(*)::int as n from public.retorno_linhas where retorno_id = $1`, [r.retorno_id])).rows[0].n).toBe(2);
      // mesmo arquivo pode entrar de novo
      await gravarRet(c, s, [linha(s)], { hash });
      await comoUsuario(c, s.fin);
      const l2 = await linhaDe(c, r.retorno_id, 'nao_encontrada');
      expect(await erroDe(c, VINCULAR, [l2, s.contrato, null, 'm'])).toBe('Este retorno foi desfeito.');
      await comoDono(c);
    });
  });

  it('recusa se houve baixa de diferença depois do retorno', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const r1 = await parcialGravado(c, s);
      const p = await parcela(c, s.contrato);
      await comoUsuario(c, s.gerente);
      await c.query(BAIXAR, [p.id, null, 'acordo']);
      expect(await erroDe(c, DESFAZER, [r1.retorno_id, 'm'])).toBe('Não dá para desfazer: houve baixa de diferença depois deste retorno.');
      await comoDono(c);
    });
  });

  it('recusa se não é o mais recente ou se o contrato foi encerrado', async () => {
    await emTransacao(async (c) => {
      const s2 = await cenarioRetorno(c);
      const a = await gravarRet(c, s2, [linha(s2)]);
      const b = await gravarRet(c, s2, [linha(s2, { ade: '9' })]);
      await comoUsuario(c, s2.gerente);
      expect(await erroDe(c, DESFAZER, [a.retorno_id, 'm'])).toBe('Só o retorno mais recente deste convênio e produto pode ser desfeito.');
      await c.query(DESFAZER, [b.retorno_id, 'm']);
      await comoDono(c);
      await c.query(`update public.contratos set situacao = 'quitado' where id = $1`, [s2.contrato]);
      await comoUsuario(c, s2.gerente);
      const numero = (await c.query(`select numero from public.contratos where id = $1`, [s2.contrato])).rows[0].numero;
      expect(await erroDe(c, DESFAZER, [a.retorno_id, 'm'])).toBe(`Não dá para desfazer: o contrato nº ${numero} foi encerrado depois do retorno.`);
      await comoDono(c);
    });
  });
});

describe('0037 desfazer importação da Etapa 3 com retorno', () => {
  it('recusa desfazer a importação se um contrato importado recebeu linha de retorno', async () => {
    await emTransacao(async (c) => {
      const si = await cenarioImportacao(c);
      const imp = await gravarImp(c, si, comContratos({}));
      const k = (await c.query(`select id from public.contratos where importacao_id = $1`, [imp.id])).rows[0].id;
      const cv = (await c.query(`select convenio_id from public.contratos where id = $1`, [k])).rows[0].convenio_id;
      const ret = (await c.query(`insert into public.retornos (convenio_id, produto, tipo, competencia, arquivo_nome, hash)
                                  values ($1, 'parcelas', 'descontados', '2026-11-01', 'a.xlsx', repeat('b', 64)) returning id`, [cv])).rows[0].id;
      await c.query(`insert into public.retorno_linhas (retorno_id, linha, situacao, sugestao_contrato_id) values ($1, 2, 'nao_encontrada', $2)`, [ret, k]);
      const adm = await criarUsuarioTeste(c, 'administrador');
      await comoUsuario(c, adm);
      expect(await erroDe(c, `select public.desfazer_importacao($1)`, [imp.id])).toBe(
        'Não dá para desfazer: há retorno ou baixa de diferença ligada aos dados desta importação.',
      );
      await comoDono(c);
    });
  });
});
