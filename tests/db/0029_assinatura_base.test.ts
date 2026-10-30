import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, criarParceiroTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { cenarioEsteira, digitar } from './esteira_fixture';

async function acre(c: pg.PoolClient): Promise<string> {
  return (await c.query(`select id from public.convenios where nome = 'Governo do Acre'`)).rows[0].id;
}

async function salvar(c: pg.PoolClient, usuario: string, convenio: string, texto: string, teste = false) {
  await comoUsuario(c, usuario);
  const r = await c.query(`select public.salvar_modelo_contrato($1, $2, $3) as v`, [convenio, texto, teste]);
  await comoDono(c);
  return r.rows[0].v as number;
}

async function erroSalvar(c: pg.PoolClient, usuario: string, convenio: string, texto: string) {
  await comoUsuario(c, usuario);
  const e = await erroDe(c, `select public.salvar_modelo_contrato($1, $2, false)`, [convenio, texto]);
  await comoDono(c);
  return e;
}

describe('0029 base da assinatura', () => {
  it('salvar cria versões; só a última fica ativa e a anterior não muda', async () => {
    await emTransacao(async (c) => {
      const adm = await criarUsuarioTeste(c, 'administrador');
      const conv = await acre(c);
      expect(await salvar(c, adm, conv, 'Contrato de {cliente.nome}')).toBe(1);
      expect(await salvar(c, adm, conv, 'Contrato v2 de {cliente.nome}', true)).toBe(2);
      const r = await c.query(`select versao, texto, ativo, teste from public.contrato_modelos where convenio_id = $1 order by versao`, [conv]);
      expect(r.rows).toEqual([
        { versao: 1, texto: 'Contrato de {cliente.nome}', ativo: false, teste: false },
        { versao: 2, texto: 'Contrato v2 de {cliente.nome}', ativo: true, teste: true },
      ]);
    });
  });

  it('marcadores inválidos dão erro em português', async () => {
    await emTransacao(async (c) => {
      const adm = await criarUsuarioTeste(c, 'administrador');
      const conv = await acre(c);
      expect(await erroSalvar(c, adm, conv, 'Olá {cliente.nomee}')).toBe('Campo desconhecido: {cliente.nomee}.');
      expect(await erroSalvar(c, adm, conv, '{se mensalidade} termo')).toBe('Bloco "{se mensalidade}" sem {fim}.');
      expect(await erroSalvar(c, adm, conv, 'texto {fim}')).toBe('{fim} sem bloco aberto.');
      expect(await erroSalvar(c, adm, conv, '{se outra} x {fim}')).toBe('Condição desconhecida: {se outra}.');
      expect(await erroSalvar(c, adm, conv, '   ')).toBe('Escreva o texto do contrato.');
    });
  });

  it('operador não salva modelo; ninguém altera versão gravada', async () => {
    await emTransacao(async (c) => {
      const adm = await criarUsuarioTeste(c, 'administrador');
      const op = await criarUsuarioTeste(c, 'operador');
      const conv = await acre(c);
      expect(await erroSalvar(c, op, conv, 'x')).toBe('Você não tem permissão para esta ação.');
      await salvar(c, adm, conv, 'x');
      await comoUsuario(c, adm);
      expect(await erroDe(c, `update public.contrato_modelos set texto = 'y'`)).toMatch(/permission denied/);
      expect(await erroDe(c, `delete from public.contrato_modelos`)).toMatch(/permission denied/);
    });
  });

  it('lista de campos tem os principais', async () => {
    await emTransacao(async (c) => {
      const r = await c.query(`select chave from public.modelo_campos()`);
      const chaves = r.rows.map((x) => x.chave);
      for (const k of ['cliente.nome', 'cliente.cpf', 'contrato.valor_parcela', 'contrato.prazo', 'contrato.ade',
        'mensalidade.valor', 'documento.data_extenso', 'parcelas.tabela', 'se mensalidade', 'se quitacoes', 'se dividas']) {
        expect(chaves).toContain(k);
      }
    });
  });

  it('um envio aberto por contrato; parceiro vê o envio do seu contrato, sem evidências', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioEsteira(c);
      const id = await digitar(c, s);
      const outro = await digitar(c, s);
      const p = await criarParceiroTeste(c);
      const parc = await criarUsuarioTeste(c, 'parceiro', { parceiroId: p });
      await c.query(`update public.contratos set parceiro_id = $2 where id = $1`, [id, p]);
      const a = await c.query(
        `insert into public.contrato_assinaturas (contrato_id, situacao, valores) values ($1, 'enviado', '{}') returning id`, [id]);
      await c.query(`insert into public.contrato_assinaturas (contrato_id, situacao, valores) values ($1, 'enviado', '{}')`, [outro]);
      await c.query(`insert into public.contrato_assinatura_evidencias (assinatura_id, dados) values ($1, '{"ip":"1"}')`, [a.rows[0].id]);
      expect(await erroDe(c, `insert into public.contrato_assinaturas (contrato_id, situacao, valores) values ($1, 'assinado', '{}')`, [id]))
        .toMatch(/duplicate key/);
      await comoUsuario(c, parc);
      expect((await c.query(`select contrato_id from public.contrato_assinaturas`)).rows).toEqual([{ contrato_id: id }]);
      expect((await c.query(`select 1 from public.contrato_assinatura_evidencias`)).rowCount).toBe(0);
      await comoDono(c);
      await comoUsuario(c, s.operador);
      expect((await c.query(`select 1 from public.contrato_assinatura_evidencias`)).rowCount).toBe(1);
      expect(await erroDe(c, `insert into public.contrato_assinaturas (contrato_id, situacao, valores) values ($1, 'enviado', '{}')`, [outro]))
        .toMatch(/permission denied/);
    });
  });

  it('convênio: modelo_contrato saiu, prazo padrão 7, produção desligada', async () => {
    await emTransacao(async (c) => {
      const col = await c.query(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'convenios'
         and column_name in ('modelo_contrato', 'assinatura_prazo_dias')`);
      expect(col.rows).toEqual([{ column_name: 'assinatura_prazo_dias' }]);
      const r = await c.query(`select assinatura_prazo_dias, assinatura_selfie, assinatura_email, public.config_bool('ambiente_producao') as prod
                               from public.convenios where nome = 'Governo do Acre'`);
      expect(r.rows[0]).toEqual({ assinatura_prazo_dias: 7, assinatura_selfie: true, assinatura_email: true, prod: false });
      const b = await c.query(`select public from storage.buckets where id = 'contratos-assinatura'`);
      expect(b.rows).toEqual([{ public: false }]);
    });
  });
});
