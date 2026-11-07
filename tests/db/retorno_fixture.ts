import type pg from 'pg';
import { comoDono, comoUsuario, criarUsuarioTeste } from './helpers';
import { cenarioEsteira, contratoLiberado, type Cenario } from './esteira_fixture';

export interface CenarioRet extends Cenario {
  contrato: string;
  ade: string;
  cpf: string;
  mat: string;
  valorParcela: string;
  fin: string;
}

/** Convênio com corte 2 e vencimento 28, contrato liberado em 02/11/2026 (1ª competência 2026-11-01). Fica como dono. */
export async function cenarioRetorno(c: pg.PoolClient, proposta: string | null = null): Promise<CenarioRet> {
  const s = await cenarioEsteira(c);
  await c.query(`update public.convenios set dia_corte = 2, dia_vencimento = 28 where id = $1`, [s.f.convenio]);
  const contrato = await contratoLiberado(c, s, '2026-11-02', proposta);
  const r = (
    await c.query(
      `select a.ade, cl.cpf, cm.matricula, k.valor_parcela::text as valor
       from public.contratos k join public.contrato_averbacoes a on a.contrato_id = k.id and a.situacao = 'ativa'
       join public.clientes cl on cl.id = k.cliente_id join public.cliente_matriculas cm on cm.id = k.matricula_id
       where k.id = $1`,
      [contrato],
    )
  ).rows[0];
  const fin = await criarUsuarioTeste(c, 'financeiro');
  return { ...s, contrato, ade: r.ade, cpf: r.cpf, mat: r.matricula, valorParcela: r.valor, fin };
}

export type LinhaEntrada = Record<string, string | number | null | Record<string, string>>;

let seqLinha = 0;
export function linha(s: CenarioRet, extra: LinhaEntrada = {}): LinhaEntrada {
  seqLinha += 1;
  return {
    linha: seqLinha + 1, ade: s.ade, cpf: s.cpf, matricula: s.mat, valor: s.valorParcela, nome: 'Fulano',
    competencia: '2026-11-01', observacao: null, parcela_paga: null, parcela_total: null, dados: {}, ...extra,
  };
}

let seqHash = 0;
export function novoHash(): string {
  seqHash += 1;
  return (Date.now().toString(16) + seqHash.toString(16)).padStart(64, '0').slice(-64);
}

export interface Opcoes {
  produto?: 'parcelas' | 'mensalidades';
  tipo?: 'descontados' | 'nao_descontados';
  competencia?: string;
  hash?: string;
  usuario?: string;
}

export interface Previa {
  resumo: Record<string, { qtd: number; soma: string }>;
  linhas: { linha: number; situacao: string; motivo: string | null; [k: string]: unknown }[];
}

export async function comoFin<T>(c: pg.PoolClient, u: string, fn: () => Promise<T>): Promise<T> {
  await comoUsuario(c, u);
  try {
    return await fn();
  } finally {
    await comoDono(c);
  }
}

export async function conferirRet(c: pg.PoolClient, s: CenarioRet, linhas: LinhaEntrada[], o: Opcoes = {}): Promise<Previa> {
  return comoFin(c, o.usuario ?? s.fin, async () =>
    (
      await c.query(`select public.retorno_conferir($1, $2, $3, $4::date, $5::jsonb, $6) as r`, [
        s.f.convenio, o.produto ?? 'parcelas', o.tipo ?? 'descontados', o.competencia ?? '2026-11-01',
        JSON.stringify(linhas), o.hash ?? novoHash(),
      ])
    ).rows[0].r,
  );
}

export async function gravarRet(
  c: pg.PoolClient, s: CenarioRet, linhas: LinhaEntrada[], o: Opcoes = {},
): Promise<{ retorno_id: string; resumo: Previa['resumo'] }> {
  return comoFin(c, o.usuario ?? s.fin, async () =>
    (
      await c.query(`select public.retorno_gravar($1, $2, $3, $4::date, $5::jsonb, $6, $7) as r`, [
        s.f.convenio, o.produto ?? 'parcelas', o.tipo ?? 'descontados', o.competencia ?? '2026-11-01',
        JSON.stringify(linhas), o.hash ?? novoHash(), 'RETORNO_TESTE.xlsx',
      ])
    ).rows[0].r,
  );
}

export async function parcela(c: pg.PoolClient, contrato: string, competencia = '2026-11-01') {
  return (
    await c.query(
      `select p.id, p.status, s.pago::text, s.saldo::text, s.baixado::text
       from public.parcelas p join public.v_parcelas_saldo s on s.parcela_id = p.id
       where p.contrato_id = $1 and p.competencia = $2`,
      [contrato, competencia],
    )
  ).rows[0];
}
