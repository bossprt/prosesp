import type pg from 'pg';
import { comoDono, comoUsuario, criarParceiroTeste, criarUsuarioTeste, gerarCpf } from './helpers';

export interface CenarioImp {
  convenio: string;
  efetivo: string;
  admin: string;
  parceiro: string;
}

export type Linha = Record<string, string | number | null>;
export interface Lote {
  posicao: string;
  clientes: Linha[];
  matriculas: Linha[];
  contratos: Linha[];
  quitacoes: Linha[];
  dividas: Linha[];
  parcelas: Linha[];
  mensalidades: Linha[];
}

/** Acre com corte 2 e vencimento 28, parceiro "Parceiro A" e um administrador (como dono). */
export async function cenarioImportacao(c: pg.PoolClient): Promise<CenarioImp> {
  const r = await c.query(
    `update public.convenios set dia_corte = 2, dia_vencimento = 28 where nome = 'Governo do Acre'
     returning id, (select v.id from public.convenio_vinculos v where v.convenio_id = convenios.id and v.nome = 'Efetivo') as efetivo`,
  );
  const parceiro = await criarParceiroTeste(c, 'Parceiro A');
  const admin = await criarUsuarioTeste(c, 'administrador');
  return { convenio: r.rows[0].id, efetivo: r.rows[0].efetivo, admin, parceiro };
}

let seq = 300000000 + (Date.now() % 100000) * 1000;
export function novoCpf(): string {
  seq += 1;
  return gerarCpf(seq);
}
export function novaMatricula(): string {
  seq += 1;
  return String(seq).slice(-8);
}

/** Lote mínimo: um cliente com uma matrícula no Acre/Efetivo. */
export function lote(cpf = novoCpf(), matricula = novaMatricula(), extra: Partial<Lote> = {}): Lote {
  return {
    posicao: '2026-10-01',
    clientes: [{ linha: 2, cpf, nome: 'Maria Importada', celular: '68999990000', whatsapp: null }],
    matriculas: [{ linha: 2, cpf, convenio: 'Governo do Acre', vinculo: 'Efetivo', matricula, orgao: null }],
    contratos: [],
    quitacoes: [],
    dividas: [],
    parcelas: [],
    mensalidades: [],
    ...extra,
  };
}

/** Junta vários lotes em um (linhas renumeradas por aba). */
export function juntar(...lotes: Lote[]): Lote {
  const abas = ['clientes', 'matriculas', 'contratos', 'quitacoes', 'dividas', 'parcelas', 'mensalidades'] as const;
  const r = lote();
  for (const a of abas) {
    r[a] = lotes.flatMap((l) => l[a]).map((x, i) => ({ ...x, linha: i + 2 }));
  }
  return r;
}

export interface Resultado {
  resumo: Record<string, { novas: number; existentes: number; erros: number }>;
  erros: { aba: string; linha: number; mensagem: string }[];
  avisos: { aba: string; linha: number; mensagem: string }[];
}

export async function conferir(c: pg.PoolClient, s: CenarioImp, d: Lote): Promise<Resultado> {
  await comoUsuario(c, s.admin);
  const r = await c.query(`select public.importacao_conferir($1) as r`, [d]);
  await comoDono(c);
  return r.rows[0].r;
}

let seqHash = 0;
/** Inicia, grava um lote e conclui. Volta como dono. */
export async function gravar(c: pg.PoolClient, s: CenarioImp, d: Lote, hash?: string): Promise<{ id: string; r: Resultado }> {
  seqHash += 1;
  await comoUsuario(c, s.admin);
  const i = await c.query(`select public.importacao_iniciar('teste.xlsx', null, $1, $2) as id`, [
    hash ?? `hash-${Date.now()}-${seqHash}`,
    d.posicao,
  ]);
  const id = i.rows[0].id as string;
  const r = (await c.query(`select public.importacao_gravar_lote($1, $2) as r`, [id, d])).rows[0].r as Resultado;
  await c.query(`select public.importacao_concluir($1, $2, $3)`, [id, r.resumo, JSON.stringify(r.erros)]);
  await comoDono(c);
  return { id, r };
}

let seqContrato = 1000 + (Date.now() % 100000) * 10;
/** Linha da aba Contratos: novo, 24x R$ 122,40, bruto R$ 2.000, liberado 10/05/2024, 5 pagas, ativo. */
export function contrato(cpf: string, matricula: string, extra: Linha = {}): Linha {
  seqContrato += 1;
  return {
    linha: 2, numero_antigo: `L${seqContrato}`, cpf, convenio: 'Governo do Acre', matricula, tipo: 'novo', prazo: '24',
    valor_parcela: '122.40', valor_bruto: '2000.00', valor_liquido: null, data_liberacao: '2024-05-10',
    primeira_competencia: '2024-06-01', parcelas_pagas: '5', situacao: 'ativo', ade: null, parceiro: null, ...extra,
  };
}

/** Lote de um cliente com os contratos dados (linhas 2, 3, …). */
export function comContratos(...extras: Linha[]): Lote {
  const cpf = novoCpf();
  const mat = novaMatricula();
  const d = lote(cpf, mat);
  d.contratos = extras.map((e, i) => ({ ...contrato(cpf, mat, e), linha: i + 2 }));
  return d;
}
