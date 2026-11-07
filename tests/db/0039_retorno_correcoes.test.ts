import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, emTransacao, erroDe } from './helpers';
import { cenarioRetorno, comoFin, conferirRet, gravarRet, linha, novoHash, parcela, type CenarioRet } from './retorno_fixture';

const sit = (p: { linhas: { situacao: string; motivo: string | null }[] }) => p.linhas.map((l) => [l.situacao, l.motivo]);

/** Cria n contratos iguais ao do cenário (ADE 'V1'..'Vn'), cada um com a parcela de novembro. */
async function clonar(c: pg.PoolClient, s: CenarioRet, n: number) {
  const cols = (await c.query(
    `select string_agg(quote_ident(column_name), ', ' order by ordinal_position) as l from information_schema.columns
     where table_schema = 'public' and table_name = 'contratos' and is_generated = 'NEVER' and column_name not in ('id', 'numero', 'numero_legado')`,
  )).rows[0].l;
  await c.query(`set local session_replication_role = replica`);
  await c.query(`create temp table _clones on commit drop as select gen_random_uuid() as id, g as i from generate_series(1, ${n}) g`);
  await c.query(`insert into public.contratos (id, ${cols}) select x.id, ${cols.split(', ').map((k: string) => `k.${k}`).join(', ')}
                 from public.contratos k, _clones x where k.id = $1`, [s.contrato]);
  await c.query(`set local session_replication_role = origin`);
  await c.query(`insert into public.contrato_averbacoes (contrato_id, convenio_id, matricula_id, ade, situacao, valor_averbado)
                 select x.id, k.convenio_id, k.matricula_id, 'V' || x.i, 'ativa', k.valor_parcela
                 from public.contratos k, _clones x where k.id = $1`, [s.contrato]);
  await c.query(`insert into public.parcelas (contrato_id, numero, competencia, vencimento, valor, averbacao_id)
                 select x.id, 1, '2026-11-01', '2026-11-28', k.valor_parcela, a.id
                 from public.contratos k, _clones x join public.contrato_averbacoes a on a.contrato_id = x.id where k.id = $1`, [s.contrato]);
}

describe('0039 correções do retorno', () => {
  it('retorno de 20.000 linhas grava dentro do limite de 8 segundos do app', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      await clonar(c, s, 20000);
      const linhas = Array.from({ length: 20000 }, (_, i) => linha(s, { ade: `V${i + 1}` }));
      await comoUsuario(c, s.fin);
      await c.query(`set local statement_timeout = '8s'`);
      const r = (await c.query(`select public.retorno_gravar($1, 'parcelas', 'descontados', '2026-11-01', $2::jsonb, $3, 'GRANDE.xlsx') as r`, [
        s.f.convenio, JSON.stringify(linhas), novoHash(),
      ])).rows[0].r;
      await c.query(`set local statement_timeout = 0`);
      await comoDono(c);
      expect(r.resumo.conciliada.qtd).toBe(20000);
    });
  }, 60000);

  it('o mesmo desconto em outro arquivo (hash diferente) não é recebido duas vezes; a prévia avisa', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const menor = (Number(s.valorParcela) - 40).toFixed(2);
      await gravarRet(c, s, [linha(s, { valor: '20.00' })]);
      const p = await conferirRet(c, s, [linha(s, { valor: '20.00' }), linha(s, { ade: `0${s.ade}`, valor: menor })]);
      expect(sit(p)[0]).toEqual(['duplicada', 'Já recebido em outro retorno desta competência.']);
      expect((p as unknown as { avisos: string[] }).avisos[0]).toMatch(/^Já existe retorno gravado deste convênio, produto e tipo nesta competência: RETORNO_TESTE.xlsx/);
    });
  });

  it('competência preenchida e inválida não paga; ADE alfanumérico com zero não é repetido', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      expect(sit(await conferirRet(c, s, [linha(s, { competencia: '2026-11-15' })]))).toEqual([
        ['divergente', 'Competência inválida no arquivo.'],
      ]);
      const p = await conferirRet(c, s, [linha(s, { ade: '01A', cpf: null, matricula: null }), linha(s, { ade: '1A', cpf: null, matricula: null })]);
      expect(p.linhas.map((l) => l.situacao)).toEqual(['nao_encontrada', 'nao_encontrada']);
    });
  });

  it('ADE antigo com matrícula migrada: confere a matrícula da averbação e o pagamento guarda a averbação antiga', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const antiga = (await c.query(`select id from public.contrato_averbacoes where contrato_id = $1`, [s.contrato])).rows[0].id;
      const novaMat = (await c.query(`insert into public.cliente_matriculas (cliente_id, convenio_id, vinculo_id, matricula)
                                      select cliente_id, convenio_id, vinculo_id, 'NOVA9' from public.cliente_matriculas where id = $1 returning id`,
                                     [s.matricula])).rows[0].id;
      await c.query(`update public.contrato_averbacoes set situacao = 'migrada' where id = $1`, [antiga]);
      await c.query(`set local session_replication_role = replica`);
      await c.query(`update public.contratos set matricula_id = $2 where id = $1`, [s.contrato, novaMat]);
      await c.query(`set local session_replication_role = origin`);
      await c.query(`insert into public.contrato_averbacoes (contrato_id, convenio_id, matricula_id, ade, situacao, valor_averbado)
                     select id, convenio_id, $2, 'NOVOADE9', 'ativa', valor_parcela from public.contratos where id = $1`, [s.contrato, novaMat]);
      await gravarRet(c, s, [linha(s)]);
      const g = (await c.query(`select g.averbacao_id, l.situacao from public.parcela_pagamentos g join public.retorno_linhas l on l.id = g.retorno_linha_id`)).rows;
      expect(g).toEqual([{ averbacao_id: antiga, situacao: 'ade_antiga' }]);
    });
  });

  it('tudo ou nada: erro depois de inserir as linhas desfaz tudo', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      await c.query(`create function pg_temp.falhar() returns trigger language plpgsql as $$ begin raise exception 'falha simulada'; end $$`);
      await c.query(`create trigger falhar before insert on public.parcela_pagamentos for each row execute function pg_temp.falhar()`);
      const msg = await comoFin(c, s.fin, () =>
        erroDe(c, `select public.retorno_gravar($1, 'parcelas', 'descontados', '2026-11-01', $2::jsonb, $3, 'a.xlsx')`, [
          s.f.convenio, JSON.stringify([linha(s)]), novoHash(),
        ]));
      expect(msg).toBe('falha simulada');
      await c.query(`drop trigger falhar on public.parcela_pagamentos`);
      expect((await c.query(`select (select count(*) from public.retornos)::int as r, (select count(*) from public.retorno_linhas)::int as l`)).rows[0])
        .toEqual({ r: 0, l: 0 });
    });
  });

  it('vincular grava a averbação encontrada pela linha; tratamento fica na auditoria', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const antiga = (await c.query(`select id from public.contrato_averbacoes where contrato_id = $1`, [s.contrato])).rows[0].id;
      await c.query(`update public.contrato_averbacoes set situacao = 'substituida' where id = $1`, [antiga]);
      await c.query(`insert into public.contrato_averbacoes (contrato_id, convenio_id, matricula_id, ade, situacao, valor_averbado)
                     select id, convenio_id, matricula_id, 'NOVO77', 'ativa', valor_parcela from public.contratos where id = $1`, [s.contrato]);
      const r = await gravarRet(c, s, [linha(s, { cpf: '11144477735' })]);
      const l = (await c.query(`select id from public.retorno_linhas where retorno_id = $1`, [r.retorno_id])).rows[0].id;
      await comoFin(c, s.fin, () => c.query(`select public.retorno_vincular_linha($1, $2, null, 'CPF errado na folha')`, [l, s.contrato]));
      expect((await c.query(`select averbacao_id from public.parcela_pagamentos`)).rows[0].averbacao_id).toBe(antiga);
      const aud = (await c.query(`select count(*)::int as n from public.auditoria where tabela = 'retorno_linhas' and registro_id = $1`, [l])).rows[0].n;
      expect(aud).toBe(1);
    });
  });

  it('baixa recusada em contrato encerrado; situação do contrato aparece por extenso', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      await gravarRet(c, s, [linha(s, { valor: (Number(s.valorParcela) - 5).toFixed(2) })]);
      const p = await parcela(c, s.contrato);
      await c.query(`update public.contratos set situacao = 'prejuizo' where id = $1`, [s.contrato]);
      await comoUsuario(c, s.gerente);
      expect(await erroDe(c, `select public.diferenca_baixar($1, null, 'x')`, [p.id])).toBe('O contrato ou a mensalidade não está mais ativo.');
      await comoDono(c);
      expect(sit(await conferirRet(c, s, [linha(s, { valor: '1.00', competencia: null })], { competencia: '2026-12-01' }))[0][1].toString())
        .toBe('Contrato não está ativo (situação: prejuízo).');
    });
  });

  it('ausentes por parcela: regularização de outra parcela não esconde a da competência; remessa de mensalidade limitada', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c, '30.00');
      const r = await gravarRet(c, s, [linha(s, { ade: 'XX1' })], { competencia: '2026-12-01' });
      const l = (await c.query(`select id from public.retorno_linhas where retorno_id = $1`, [r.retorno_id])).rows[0].id;
      const nov = (await parcela(c, s.contrato)).id;
      await comoFin(c, s.fin, () => c.query(`select public.retorno_vincular_linha($1, $2, $3, 'regulariza novembro')`, [l, s.contrato, nov]));
      const aus = await comoFin(c, s.fin, async () =>
        (await c.query(`select public.retorno_ausentes($1, 'parcelas', '2026-12-01') as r`, [s.f.convenio])).rows[0].r);
      expect(aus.map((x: { contrato_id: string }) => x.contrato_id)).toEqual([s.contrato]);

      await c.query(`update public.mensalidade_averbacoes set valor_averbado = 25 where contrato_origem_id = $1`, [s.contrato]);
      const rem = await comoFin(c, s.fin, async () =>
        (await c.query(`select public.remessa_dados($1, 'mensalidades', '2026-11-01') as r`, [s.f.convenio])).rows[0].r);
      expect(rem[0].valor).toBe('25.00');
    });
  });
});
