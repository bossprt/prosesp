export function soDigitos(s: string): string {
  return (s ?? '').replace(/\D/g, '');
}

const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata para exibição. Aceita número ou texto decimal vindo do banco ("61.20"). */
export function formatarReais(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  return reais.format(Number(v));
}

/**
 * Converte o que a pessoa digitou ("1.234,56", "R$ 0,5") em texto decimal com ponto e 2 casas,
 * sem passar por número de ponto flutuante. Lança "Valor inválido." se não reconhecer.
 */
export function lerReais(s: string): string {
  const t = (s ?? '').replace(/R\$/g, '').replace(/\s/g, '');
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(t)) throw new Error('Valor inválido.');
  const [inteiro, centavos = ''] = t.split(',');
  return `${inteiro.replace(/\./g, '').replace(/^0+(?=\d)/, '')}.${centavos.padEnd(2, '0')}`;
}

/** Texto decimal ("1000.5", "-15.50") → centavos inteiros, sem ponto flutuante. */
function centavos(s: string): bigint {
  const t = (s ?? '').trim() || '0';
  const negativo = t.startsWith('-');
  const [inteiro, frac = ''] = t.replace(/^[-+]/, '').split('.');
  const c = BigInt(inteiro || '0') * 100n + BigInt((frac + '00').slice(0, 2));
  return negativo ? -c : c;
}

function deCentavos(c: bigint): string {
  const negativo = c < 0n;
  const a = negativo ? -c : c;
  return `${negativo ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
}

export function somarReais(...valores: string[]): string {
  return deCentavos(valores.reduce((t, v) => t + centavos(v), 0n));
}

export function subtrairReais(a: string, ...b: string[]): string {
  return deCentavos(b.reduce((t, v) => t - centavos(v), centavos(a)));
}

export function cpfValido(s: string): boolean {
  const bruto = soDigitos(s);
  if (bruto.length < 1 || bruto.length > 11) return false;
  const d = bruto.padStart(11, '0');
  if (/^(\d)\1{10}$/.test(d)) return false;
  for (const k of [1, 2]) {
    let soma = 0;
    for (let i = 0; i < 8 + k; i++) soma += Number(d[i]) * (9 + k - i);
    const dv = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (dv !== Number(d[8 + k])) return false;
  }
  return true;
}

export function formatarCpf(s: string): string {
  const d = soDigitos(s).padStart(11, '0').slice(-11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatarCelular(s: string): string {
  const d = soDigitos(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s;
}
