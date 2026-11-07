import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, criarClienteTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { contratoLiberado } from './esteira_fixture';
import { cenarioRetorno, comoFin, conferirRet, gravarRet, linha, novoHash, parcela, type CenarioRet } from './retorno_fixture';

const sit = (p: { linhas: { situacao: string; motivo: string | null }[] }) => p.linhas.map((l) => [l.situacao, l.motivo]);
const esperadoParcial = async (c: pg.PoolClient, contrato: string) =>
  (await c.query(`select case when vencimento < current_date then 'atrasada' else 'parcial' end as s
                  from public.parcelas where contrato_id = $1 and competencia = '2026-11-01'`, [contrato])).rows[0].s;

async function reaverbar(c: pg.PoolClient, s: CenarioRet, novoAde: string) {
  const antiga = (await c.query(`select id from public.contrato_averbacoes where contrato_id = $1 and situacao = 'ativa'`, [s.contrato])).rows[0].id;
  await c.query(`update public.contrato_averbacoes set situacao = 'substituida' where id = $1`, [antiga]);
  const nova = (await c.query(
    `insert into public.contrato_averbacoes (contrato_id, convenio_id, matricula_id, ade, situacao, valor_averbado)
     select id, convenio_id, matricula_id, $2, 'ativa', valor_parcela from public.contratos where id = $1 returning id`,
    [s.contrato, novoAde],
  )).rows[0].id;
  await c.query(`select public._apos_nova_averbacao($1, $2, $3)`, [s.contrato, antiga, nova]);
}

describe('0036 importar retorno — classificação', () => {
  it('conciliada, parcial e maior que o saldo; conferir não grava nada', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const p = await conferirRet(c, s, [linha(s)]);
      expect(sit(p)).toEqual([['conciliada', null]]);
      expect(p.resumo.conciliada).toEqual({ qtd: 1, soma: s.valorParcela });
      expect((await parcela(c, s.contrato)).status).toBe('aberta');
      expect((await c.query(`select count(*)::int as n from public.retornos`)).rows[0].n).toBe(0);

      const menor = (Number(s.valorParcela) - 5).toFixed(2);
      expect(sit(await conferirRet(c, s, [linha(s, { valor: menor })]))).toEqual([['parcial', null]]);
      const maior = (Number(s.valorParcela) + 5).toFixed(2);
      expect(sit(await conferirRet(c, s, [linha(s, { valor: maior })]))).toEqual([['divergente', 'Desconto maior que o saldo da parcela.']]);
    });
  });

  it('ignoradas, competência diferente e ADE repetido no arquivo', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const p = await conferirRet(c, s, [
        linha(s, { ade: null, cpf: null }),
        linha(s, { valor: null }),
        linha(s, { valor: '-3.00' }),
        linha(s, { valor: '1.234' }),
        linha(s, { competencia: '2026-10-01' }),
        linha(s),
        linha(s),
      ]);
      expect(sit(p)).toEqual([
        ['ignorada', 'Linha sem dados suficientes.'],
        ['ignorada', 'Linha sem dados suficientes.'],
        ['ignorada', 'Valor inválido.'],
        ['ignorada', 'Valor inválido.'],
        ['divergente', 'Competência do arquivo diferente da escolhida.'],
        ['conciliada', null],
        ['duplicada', 'ADE repetido no arquivo.'],
      ]);
    });
  });

  it('não encontrada: com sugestão por CPF + matrícula e sem sugestão', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const p = await conferirRet(c, s, [linha(s, { ade: '999999999' }), linha(s, { ade: '888888888', cpf: '11144477735' })]);
      expect(sit(p)).toEqual([
        ['nao_encontrada', 'ADE não encontrado no sistema.'],
        ['nao_encontrada', 'ADE não encontrado no sistema.'],
      ]);
      const numero = (await c.query(`select numero from public.contratos where id = $1`, [s.contrato])).rows[0].numero;
      expect(p.linhas[0].sugestao_contrato_numero).toBe(Number(numero));
      expect(p.linhas[1].sugestao_contrato_numero).toBeNull();
    });
  });

  it('ADE com zeros à esquerda casa; CPF e matrícula diferentes são divergentes', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const p = await conferirRet(c, s, [
        linha(s, { ade: `000${s.ade}`, matricula: `00${s.mat}` }),
      ]);
      expect(sit(p)).toEqual([['conciliada', null]]);
      expect(sit(await conferirRet(c, s, [linha(s, { cpf: '11144477735' })]))).toEqual([['divergente', 'CPF diferente do cadastro.']]);
      expect(sit(await conferirRet(c, s, [linha(s, { matricula: 'X-1' })]))).toEqual([['divergente', 'Matrícula diferente do cadastro.']]);
    });
  });

  it('ADE cancelado, com cancelamento pendente e ADE ambíguo', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      await c.query(`update public.contrato_averbacoes set situacao = 'cancelamento_pendente' where contrato_id = $1`, [s.contrato]);
      expect(sit(await conferirRet(c, s, [linha(s)]))).toEqual([['divergente', 'ADE com cancelamento pendente na averbadora.']]);
      await c.query(`update public.contrato_averbacoes set situacao = 'cancelada' where contrato_id = $1`, [s.contrato]);
      expect(sit(await conferirRet(c, s, [linha(s)]))).toEqual([['divergente', 'ADE cancelado no sistema.']]);

      // mesmo número em dois contratos: um "0123" e outro "123" (iguais sem zeros à esquerda)
      await c.query(`update public.contrato_averbacoes set situacao = 'ativa', ade = '0123' where contrato_id = $1`, [s.contrato]);
      const outro = await contratoLiberado(c, s, '2026-11-02');
      await c.query(`update public.contrato_averbacoes set ade = '00123' where contrato_id = $1`, [outro]);
      expect(sit(await conferirRet(c, s, [linha(s, { ade: '123', cpf: null, matricula: null })]))).toEqual([
        ['divergente', 'Mais de um cadastro com este ADE.'],
      ]);
      // texto exato tem prioridade
      expect(sit(await conferirRet(c, s, [linha(s, { ade: '0123' })]))).toEqual([['conciliada', null]]);
    });
  });

  it('ADE antigo depois de reaverbação paga a parcela do mesmo contrato', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      await reaverbar(c, s, '55500011');
      const p = await conferirRet(c, s, [linha(s)]);
      expect(p.linhas[0].situacao).toBe('ade_antiga');
      // ADE antigo e novo no mesmo arquivo: o segundo encontra a parcela já paga
      const p2 = await conferirRet(c, s, [linha(s, { ade: '55500011' }), linha(s)]);
      expect(sit(p2)).toEqual([['conciliada', null], ['duplicada', 'Parcela já paga por outra linha deste arquivo.']]);
    });
  });

  it('sem parcela na competência, parcela cancelada, parcela já paga e contrato encerrado', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      expect(sit(await conferirRet(c, s, [linha(s, { competencia: null })], { competencia: '2026-10-01' }))).toEqual([
        ['divergente', 'Não há parcela nesta competência.'],
      ]);
      const p = await parcela(c, s.contrato);
      await c.query(`update public.parcelas set status = 'cancelada' where id = $1`, [p.id]);
      expect(sit(await conferirRet(c, s, [linha(s)]))).toEqual([['divergente', 'Parcela cancelada ou em prejuízo.']]);
      await c.query(`update public.parcelas set status = 'aberta' where id = $1`, [p.id]);
      await c.query(`insert into public.parcela_pagamentos (parcela_id, valor, competencia_desconto) values ($1, $2, '2026-11-01')`, [p.id, s.valorParcela]);
      expect(sit(await conferirRet(c, s, [linha(s)]))).toEqual([['duplicada', 'Parcela já paga.']]);
      await c.query(`update public.contratos set situacao = 'quitado' where id = $1`, [s.contrato]);
      expect(sit(await conferirRet(c, s, [linha(s)]))).toEqual([['divergente', 'Contrato não está ativo (situação: quitado).']]);
    });
  });

  it('arquivo de não descontados não paga nada e usa a observação como motivo', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const p = await conferirRet(c, s, [linha(s, { valor: null, observacao: 'Margem insuficiente' }), linha(s, { ade: '1', valor: null })],
        { tipo: 'nao_descontados' });
      expect(sit(p)).toEqual([['nao_descontada', 'Margem insuficiente'], ['nao_encontrada', 'ADE não encontrado no sistema.']]);
    });
  });

  it('mensalidade: conciliada pelo ADE e pelo ADE migrado; proposta ainda não liberada', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c, '30.00');
      const ma = (await c.query(`select a.ade, a.mensalidade_id from public.mensalidade_averbacoes a
                                 join public.contratos k on k.id = a.contrato_origem_id where k.id = $1`, [s.contrato])).rows[0];
      const o = { produto: 'mensalidades' as const };
      expect(sit(await conferirRet(c, s, [linha(s, { ade: ma.ade, valor: '30.00' })], o))).toEqual([['conciliada', null]]);

      // reajuste: a antiga fica migrada e continua levando à mesma mensalidade
      await c.query(`update public.mensalidade_averbacoes set situacao = 'migrada' where ade = $1`, [ma.ade]);
      await c.query(`insert into public.mensalidade_averbacoes (matricula_id, convenio_id, ade, situacao, valor_averbado, mensalidade_id)
                     values ($1, $2, 'MNOVO1', 'ativa', 30, $3)`, [s.matricula, s.f.convenio, ma.mensalidade_id]);
      const p = await conferirRet(c, s, [linha(s, { ade: ma.ade, valor: '30.00' }), linha(s, { ade: 'MNOVO1', valor: '30.00' })], o);
      expect(sit(p)).toEqual([['ade_antiga', null], ['duplicada', 'Parcela já paga por outra linha deste arquivo.']]);

      await c.query(`insert into public.mensalidade_averbacoes (matricula_id, convenio_id, ade, situacao, valor_averbado)
                     values ($1, $2, 'MPROP1', 'proposta', 30)`, [s.matricula, s.f.convenio]);
      expect(sit(await conferirRet(c, s, [linha(s, { ade: 'MPROP1', valor: '30.00' })], o))).toEqual([
        ['divergente', 'ADE de mensalidade ainda não liberado.'],
      ]);
    });
  });

  it('valida entrada e permissão', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect(await erroDe(c, `select public.retorno_conferir($1, 'parcelas', 'descontados', '2026-11-01', '[]', $2)`, [s.f.convenio, novoHash()]))
        .toBe('Você não tem permissão para esta ação.');
      await comoDono(c);
      await comoUsuario(c, s.fin);
      expect(await erroDe(c, `select public.retorno_conferir($1, 'parcelas', 'descontados', '2026-11-05', '[{}]', $2)`, [s.f.convenio, novoHash()]))
        .toBe('A competência deve ser o primeiro dia do mês.');
      expect(await erroDe(c, `select public.retorno_conferir($1, 'parcelas', 'descontados', '2026-11-01', '[]', $2)`, [s.f.convenio, novoHash()]))
        .toBe('O arquivo não tem linhas.');
      expect(await erroDe(c, `select public.retorno_conferir($1, 'banana', 'descontados', '2026-11-01', '[{}]', $2)`, [s.f.convenio, novoHash()]))
        .toBe('Produto inválido.');
      await comoDono(c);
      await comoUsuario(c, (await criarUsuarioTeste(c, 'consulta')));
      expect(await erroDe(c, `select public.retorno_gravar($1, 'parcelas', 'descontados', '2026-11-01', '[{}]', $2, 'a.xlsx')`, [s.f.convenio, novoHash()]))
        .toBe('Você não tem permissão para esta ação.');
      await comoDono(c);
    });
  });
});

describe('0036 importar retorno — gravar', () => {
  it('grava linhas e pagamentos, recalcula parcelas e devolve o contrato atrasado para ativo', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      // parcela de novembro vencida no passado: contrato em atraso
      await c.query(`update public.parcelas set vencimento = '2026-11-01', status = 'atrasada' where contrato_id = $1 and competencia = '2026-11-01'`, [s.contrato]);
      await c.query(`update public.contratos set situacao = 'em_atraso' where id = $1`, [s.contrato]);
      const r = await gravarRet(c, s, [linha(s), linha(s, { ade: '999' })]);
      expect(r.resumo.conciliada.qtd).toBe(1);
      expect(r.resumo.nao_encontrada.qtd).toBe(1);
      expect(await parcela(c, s.contrato)).toMatchObject({ status: 'paga', saldo: '0.00', pago: s.valorParcela });
      expect((await c.query(`select situacao from public.contratos where id = $1`, [s.contrato])).rows[0].situacao).toBe('ativo');
      const pg = (await c.query(`select g.origem, g.averbacao_id is not null as tem_ade, l.situacao from public.parcela_pagamentos g
                                 join public.retorno_linhas l on l.id = g.retorno_linha_id`)).rows;
      expect(pg).toEqual([{ origem: 'retorno', tem_ade: true, situacao: 'conciliada' }]);
      expect((await c.query(`select count(*)::int as n from public.retorno_linhas where retorno_id = $1`, [r.retorno_id])).rows[0].n).toBe(2);
    });
  });

  it('parcial deixa diferença em aberto; mensalidade gravada no pagamento de mensalidade', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c, '30.00');
      const menor = (Number(s.valorParcela) - 5).toFixed(2);
      await gravarRet(c, s, [linha(s, { valor: menor })]);
      expect(await parcela(c, s.contrato)).toMatchObject({ status: await esperadoParcial(c, s.contrato), saldo: '5.00' });

      const ade = (await c.query(`select ade from public.mensalidade_averbacoes where contrato_origem_id = $1`, [s.contrato])).rows[0].ade;
      await gravarRet(c, s, [linha(s, { ade, valor: '20.00' })], { produto: 'mensalidades' });
      const m = (await c.query(`select s.pago::text, s.saldo::text from public.v_mensalidade_parcelas_saldo s
                                join public.mensalidade_parcelas mp on mp.id = s.mensalidade_parcela_id where mp.competencia = '2026-11-01'`)).rows[0];
      expect(m).toEqual({ pago: '20.00', saldo: '10.00' });
    });
  });

  it('mesmo arquivo não entra duas vezes', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const hash = novoHash();
      await gravarRet(c, s, [linha(s)], { hash });
      const hoje = (await c.query(`select to_char(current_date, 'DD/MM/YYYY') as d`)).rows[0].d;
      const msg = await comoFin(c, s.fin, () =>
        erroDe(c, `select public.retorno_conferir($1, 'parcelas', 'descontados', '2026-11-01', $2::jsonb, $3)`, [
          s.f.convenio, JSON.stringify([linha(s)]), hash,
        ]));
      expect(msg).toBe(`Este arquivo já foi importado em ${hoje}.`);
    });
  });

  it('tudo ou nada: erro no meio não deixa nada gravado', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      await c.query(`savepoint antes`);
      const msg = await comoFin(c, s.fin, () =>
        erroDe(c, `select public.retorno_gravar($1, 'parcelas', 'descontados', '2026-11-01', $2::jsonb, 'naohex', 'a.xlsx')`, [
          s.f.convenio, JSON.stringify([linha(s)]),
        ]));
      expect(msg).toBe('Identificação do arquivo inválida.');
      expect((await c.query(`select count(*)::int as n from public.parcela_pagamentos`)).rows[0].n).toBe(0);
      expect((await c.query(`select count(*)::int as n from public.retorno_linhas`)).rows[0].n).toBe(0);
    });
  });

  it('cliente de outro convênio com o mesmo ADE não é casado', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioRetorno(c);
      const cv2 = (await c.query(`insert into public.convenios (nome) values ('Outro convênio teste') returning id`)).rows[0].id;
      await criarClienteTeste(c);
      const p = await comoFin(c, s.fin, async () => (await c.query(
        `select public.retorno_conferir($1, 'parcelas', 'descontados', '2026-11-01', $2::jsonb, $3) as r`,
        [cv2, JSON.stringify([linha(s)]), novoHash()],
      )).rows[0].r);
      expect(p.linhas[0].situacao).toBe('nao_encontrada');
    });
  });
});
