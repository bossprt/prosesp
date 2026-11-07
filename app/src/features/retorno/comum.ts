import { formatarReais } from '../../lib/mascaras';

export const SITUACOES: { valor: string; rotulo: string }[] = [
  { valor: 'conciliada', rotulo: 'Conciliada' },
  { valor: 'parcial', rotulo: 'Desconto parcial' },
  { valor: 'ade_antiga', rotulo: 'ADE antigo' },
  { valor: 'divergente', rotulo: 'Divergente' },
  { valor: 'nao_encontrada', rotulo: 'Não encontrada' },
  { valor: 'duplicada', rotulo: 'Duplicada' },
  { valor: 'nao_descontada', rotulo: 'Não descontada' },
  { valor: 'ignorada', rotulo: 'Ignorada' },
];

export const rotuloSituacao = (s: string) => SITUACOES.find((x) => x.valor === s)?.rotulo ?? s;

export const rotuloProduto = (p: string) => (p === 'mensalidades' ? 'Mensalidades' : p === 'parcelas' ? 'Parcelas' : p);
export const rotuloTipo = (t: string) =>
  t === 'descontados' ? 'Descontados' : t === 'nao_descontados' ? 'Não descontados' : t;

/** "2026-11-01" -> "11/2026" */
export function competenciaBr(c: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(c ?? '');
  return m ? `${m[2]}/${m[1]}` : (c ?? '');
}

/** "2026-11" (campo de mês) -> "2026-11-01"; vazio se inválido. */
export function competenciaDeMes(mes: string): string {
  return /^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : '';
}

/** "2026-11-01" -> "2026-11" (para o campo de mês) */
export function mesDeCompetencia(c: string): string {
  return /^\d{4}-\d{2}/.test(c) ? c.slice(0, 7) : '';
}

export const reais = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : formatarReais(v);

export function percentual(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  return `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

export const dataHoraBr = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('pt-BR') : '—');

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function baixarArquivo(buf: ArrayBuffer, nome: string) {
  const url = URL.createObjectURL(new Blob([buf], { type: TIPO_XLSX }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Vincular/ignorar nas pendentes; só "marcar como visto" nas duplicadas e não descontadas. */
export function acoesDaLinha(
  l: { situacao: string; tratamento: string | null }, retornoGravado: boolean, podeTratar: boolean, arquivoDeDescontados = true,
): { vincular: boolean; ignorar: boolean } {
  if (!retornoGravado || !podeTratar || l.tratamento) return { vincular: false, ignorar: false };
  if (arquivoDeDescontados && (l.situacao === 'nao_encontrada' || l.situacao === 'divergente')) return { vincular: true, ignorar: true };
  if (l.situacao === 'duplicada' || l.situacao === 'nao_descontada') return { vincular: false, ignorar: true };
  return { vincular: false, ignorar: false };
}

export function totaisDoResumo(r: ResumoRetorno | null | undefined): { qtd: number; soma: number } {
  let qtd = 0;
  let soma = 0;
  for (const v of Object.values(r ?? {})) {
    qtd += Number(v.qtd) || 0;
    soma += Number(v.soma) || 0;
  }
  return { qtd, soma };
}

export type Produto ='parcelas' | 'mensalidades';
export type TipoArquivo = 'descontados' | 'nao_descontados';

export type ResumoRetorno = Record<string, { qtd: number; soma: string | number }>;

export interface LinhaConferida {
  linha: number;
  situacao: string;
  motivo: string | null;
  ade: string | null;
  cpf: string | null;
  nome: string | null;
  valor: string | number | null;
  saldo: string | number | null;
  contrato_numero: number | null;
  cliente: string | null;
  sugestao_contrato_numero: number | null;
  sugestao_cliente: string | null;
}
