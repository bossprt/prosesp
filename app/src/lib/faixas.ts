import { formatarReais } from './mascaras';

/** Lê o texto de um range do Postgres ("[30000,50000)") em limites inclusivos inteiros. */
function lerRange(r: string): { min: number | null; max: number | null } {
  const m = /^([[(])([^,]*),([^\])]*)([\])])$/.exec(r?.trim() ?? '');
  if (!m) return { min: null, max: null };
  const [, abre, a, b, fecha] = m;
  const min = a === '' ? null : Number(a) + (abre === '(' ? 1 : 0);
  const max = b === '' ? null : Number(b) - (fecha === ')' ? 1 : 0);
  return { min, max };
}

export function faixaReais(r: string): string {
  const { min, max } = lerRange(r);
  const reais = (c: number) => formatarReais(c / 100);
  if (min === null && max === null) return 'qualquer valor';
  if (max === null) return `a partir de ${reais(min!)}`;
  if (min === null) return `até ${reais(max)}`;
  return `${reais(min)} a ${reais(max)}`;
}

export function faixaAnos(r: string): string {
  const { min, max } = lerRange(r);
  if (min === null && max === null) return 'qualquer idade';
  if (max === null) return `a partir de ${min} anos`;
  if (min === null) return `até ${max} anos`;
  return `${min} a ${max} anos`;
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export function vigenciaTexto(r: string): string {
  const m = /^\[([^,]*),([^)\]]*)[)\]]$/.exec(r?.trim() ?? '');
  if (!m) return r;
  const [, inicio, fimExclusivo] = m;
  if (!fimExclusivo) return `desde ${dataBr(inicio)}`;
  const fim = new Date(`${fimExclusivo}T12:00:00Z`);
  fim.setUTCDate(fim.getUTCDate() - 1);
  return `${dataBr(inicio)} a ${dataBr(fim.toISOString().slice(0, 10))}`;
}
