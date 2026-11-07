import ExcelJS from 'exceljs';
import { chaveTexto, paraCompetencia, paraDinheiro } from '../importacao/planilha';

export type CampoRetorno =
  | 'ade' | 'cpf' | 'matricula' | 'valor' | 'nome' | 'competencia' | 'observacao' | 'parcela_paga' | 'parcela_total';
export interface LayoutRetorno {
  versao: 1;
  colunas: Partial<Record<CampoRetorno, string>>;
  linha_cabecalho?: number;
}
export type CampoRemessa =
  | 'ade' | 'cpf' | 'matricula' | 'nome' | 'valor' | 'competencia' | 'parcela_numero' | 'parcela_total'
  | 'contrato_numero' | 'servico';
export interface LayoutRemessa {
  versao: 1;
  colunas: { titulo: string; campo: CampoRemessa }[];
}

export interface LinhaRetorno {
  linha: number;
  ade: string | null;
  cpf: string | null;
  matricula: string | null;
  valor: string | null;
  nome: string | null;
  competencia: string | null;
  observacao: string | null;
  parcela_paga: string | null;
  parcela_total: string | null;
  dados: Record<string, string>;
}

export interface LinhaRemessa {
  ade: string;
  cpf: string;
  matricula: string;
  nome: string;
  valor: string;
  competencia: string;
  parcela_numero: number | null;
  parcela_total: number | null;
  contrato_numero: number | null;
  servico: string;
}

export const CAMPOS_RETORNO: { campo: CampoRetorno; rotulo: string; obrigatorio: boolean }[] = [
  { campo: 'ade', rotulo: 'ADE (nº da consignação)', obrigatorio: true },
  { campo: 'valor', rotulo: 'Valor descontado', obrigatorio: true },
  { campo: 'cpf', rotulo: 'CPF', obrigatorio: false },
  { campo: 'matricula', rotulo: 'Matrícula', obrigatorio: false },
  { campo: 'nome', rotulo: 'Nome', obrigatorio: false },
  { campo: 'competencia', rotulo: 'Competência (folha)', obrigatorio: false },
  { campo: 'observacao', rotulo: 'Observação / motivo', obrigatorio: false },
  { campo: 'parcela_paga', rotulo: 'Parcela paga', obrigatorio: false },
  { campo: 'parcela_total', rotulo: 'Total de parcelas', obrigatorio: false },
];

export const CAMPOS_REMESSA: { campo: CampoRemessa; rotulo: string }[] = [
  { campo: 'ade', rotulo: 'ADE (nº da consignação)' },
  { campo: 'cpf', rotulo: 'CPF' },
  { campo: 'matricula', rotulo: 'Matrícula' },
  { campo: 'nome', rotulo: 'Nome' },
  { campo: 'valor', rotulo: 'Valor' },
  { campo: 'competencia', rotulo: 'Competência' },
  { campo: 'parcela_numero', rotulo: 'Número da parcela' },
  { campo: 'parcela_total', rotulo: 'Total de parcelas' },
  { campo: 'contrato_numero', rotulo: 'Número do contrato' },
  { campo: 'servico', rotulo: 'Serviço' },
];

export const LAYOUT_ACRE_RETORNO: LayoutRetorno = {
  versao: 1,
  colunas: {
    ade: 'ID_Consignacao', cpf: 'CPF', matricula: 'Matricula', valor: 'Valor_Desconto', nome: 'Nome',
    competencia: 'Folha', observacao: 'Observacao', parcela_paga: 'Parc_Paga', parcela_total: 'Parc_Total',
  },
  linha_cabecalho: 1,
};

export const LAYOUT_ACRE_REMESSA: LayoutRemessa = {
  versao: 1,
  colunas: [
    { titulo: 'Folha', campo: 'competencia' },
    { titulo: 'Matricula', campo: 'matricula' },
    { titulo: 'Valor_Desconto', campo: 'valor' },
    { titulo: 'Nome', campo: 'nome' },
    { titulo: 'CPF', campo: 'cpf' },
    { titulo: 'ID_Consignacao', campo: 'ade' },
    { titulo: 'Servico', campo: 'servico' },
    { titulo: 'Parc_Paga', campo: 'parcela_numero' },
    { titulo: 'Parc_Total', campo: 'parcela_total' },
    { titulo: 'Contrato interno', campo: 'contrato_numero' },
  ],
};

export const LAYOUT_REMESSA_PADRAO: LayoutRemessa = {
  versao: 1,
  colunas: [
    { titulo: 'ADE', campo: 'ade' },
    { titulo: 'CPF', campo: 'cpf' },
    { titulo: 'Matrícula', campo: 'matricula' },
    { titulo: 'Nome', campo: 'nome' },
    { titulo: 'Valor', campo: 'valor' },
    { titulo: 'Competência', campo: 'competencia' },
    { titulo: 'Parcela', campo: 'parcela_numero' },
    { titulo: 'Total de parcelas', campo: 'parcela_total' },
    { titulo: 'Contrato', campo: 'contrato_numero' },
    { titulo: 'Serviço', campo: 'servico' },
  ],
};

export function validarLayoutRetorno(l: unknown): string[] {
  const erros: string[] = [];
  if (!l || typeof l !== 'object' || Array.isArray(l)) return ['O layout está em branco ou em formato inválido.'];
  const obj = l as Record<string, unknown>;
  if (obj.versao !== 1) erros.push('A versão do layout deve ser 1.');
  const cols = obj.colunas;
  if (!cols || typeof cols !== 'object' || Array.isArray(cols)) {
    erros.push('Informe as colunas do layout.');
    return erros;
  }
  const mapa = cols as Record<string, unknown>;
  const conhecidos = new Set<string>(CAMPOS_RETORNO.map((c) => c.campo));
  const usados = new Map<string, string>();
  for (const [campo, titulo] of Object.entries(mapa)) {
    const rotulo = CAMPOS_RETORNO.find((c) => c.campo === campo)?.rotulo ?? campo;
    if (!conhecidos.has(campo)) {
      erros.push(`Campo desconhecido no layout: ${campo}.`);
      continue;
    }
    if (titulo === undefined || titulo === null) continue;
    if (typeof titulo !== 'string') {
      erros.push(`O título da coluna "${rotulo}" deve ser um texto.`);
      continue;
    }
    if (titulo.trim() === '') {
      erros.push(`O título da coluna "${rotulo}" está em branco.`);
      continue;
    }
    const k = chaveTexto(titulo);
    const outro = usados.get(k);
    if (outro) erros.push(`A coluna "${titulo.trim()}" foi usada para dois campos: ${outro} e ${rotulo}.`);
    else usados.set(k, rotulo);
  }
  for (const c of CAMPOS_RETORNO) {
    const t = mapa[c.campo];
    if (c.obrigatorio && (t === undefined || t === null)) erros.push(`Informe a coluna do campo obrigatório: ${c.rotulo}.`);
  }
  const lc = obj.linha_cabecalho;
  if (lc !== undefined && (typeof lc !== 'number' || !Number.isInteger(lc) || lc < 1)) {
    erros.push('A linha do cabeçalho deve ser um número inteiro a partir de 1.');
  }
  return erros;
}

// ---------------------------------------------------------------- leitura

const MAX_LINHAS = 20000;

/** Valor "cru" de uma célula do ExcelJS (fórmula, texto rico, link). */
function valorCelula(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return (v as ExcelJS.CellFormulaValue).result;
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((p) => p.text).join('');
    if ('text' in v) return (v as ExcelJS.CellHyperlinkValue).text;
    return null;
  }
  return v;
}

const dois = (n: number) => String(n).padStart(2, '0');

function textoDe(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  let s: string;
  if (v instanceof Date) s = `${v.getUTCFullYear()}-${dois(v.getUTCMonth() + 1)}-${dois(v.getUTCDate())}`;
  else if (typeof v === 'number') s = Number.isInteger(v) ? v.toFixed(0) : String(v);
  else if (typeof v === 'object') return null;
  else s = String(v);
  s = s.trim();
  return s === '' ? null : s;
}

function parseCsv(texto: string, sep: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

function decodificar(arquivo: ArrayBuffer): string {
  const t = new TextDecoder('utf-8').decode(arquivo);
  return t.includes('�') ? new TextDecoder('windows-1252').decode(arquivo) : t;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'AAAA-MM-01' ou null se não entender. */
function lerCompetencia(v: unknown): string | null {
  const ok = (a: number, m: number) => (m >= 1 && m <= 12 && a >= 1900 && a <= 2999 ? `${a}-${dois(m)}-01` : null);
  if (v instanceof Date) return paraCompetencia(v);
  if (typeof v === 'number') {
    if (Number.isInteger(v) && v >= 190001) return ok(Math.floor(v / 100), v % 100);
    const r = paraCompetencia(v);
    return r && /^\d{4}-\d{2}-01$/.test(r) ? r : null;
  }
  const s = textoDe(v);
  if (!s) return null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/.exec(s))) return ok(+m[1], +m[2]);
  if ((m = /^(\d{1,2})[-/.](\d{4})$/.exec(s))) return ok(+m[2], +m[1]);
  if ((m = /^\d{1,2}[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) return ok(+m[2], +m[1]);
  if ((m = /^(\d{4})(\d{2})$/.exec(s))) return ok(+m[1], +m[2]);
  if ((m = /^(\d{2})(\d{4})$/.exec(s))) return ok(+m[2], +m[1]);
  if ((m = /^([a-zç]+)\.?[\s\-/.]+(\d{4})$/.exec(chaveTexto(s)))) {
    const i = MESES.indexOf(m[1].slice(0, 3));
    return i >= 0 && m[1].length >= 3 ? ok(+m[2], i + 1) : null;
  }
  return null;
}

function lerCpf(v: unknown): string | null {
  const t = textoDe(v);
  if (!t) return null;
  const d = t.replace(/\D/g, '');
  if (!d) return null;
  return d.length >= 9 && d.length <= 10 ? d.padStart(11, '0') : d;
}

const vazioCel = (v: unknown) => textoDe(v) === null;

export async function lerArquivoRetorno(
  arquivo: ArrayBuffer, nomeArquivo: string, layout: LayoutRetorno,
): Promise<{ linhas: LinhaRetorno[]; erros: string[] }> {
  const ext = /\.([^.]+)$/.exec(nomeArquivo.trim())?.[1]?.toLowerCase() ?? '';
  if (!['xlsx', 'csv', 'txt'].includes(ext)) {
    return { linhas: [], erros: ['Formato de arquivo não aceito. Use .xlsx ou .csv.'] };
  }
  const cab = layout.linha_cabecalho && layout.linha_cabecalho >= 1 ? Math.floor(layout.linha_cabecalho) : 1;

  // linhas: índice 0 = linha 1 do arquivo; cada linha é uma lista de valores por coluna
  let linhasBrutas: unknown[][];
  if (ext === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(arquivo);
    } catch {
      return { linhas: [], erros: ['Não foi possível abrir o arquivo. Confira se é uma planilha .xlsx válida.'] };
    }
    const ws = wb.worksheets[0];
    if (!ws) return { linhas: [], erros: ['O arquivo não tem nenhuma planilha.'] };
    const largura = ws.columnCount;
    linhasBrutas = [];
    for (let n = 1; n <= ws.rowCount; n++) {
      const row = ws.getRow(n);
      linhasBrutas.push(Array.from({ length: largura }, (_, i) => valorCelula(row.getCell(i + 1).value)));
    }
  } else {
    const texto = decodificar(arquivo);
    const primeiras = texto.split(/\r?\n/);
    const linhaCab = primeiras[cab - 1] ?? '';
    const pv = (linhaCab.match(/;/g) ?? []).length;
    const vg = (linhaCab.match(/,/g) ?? []).length;
    linhasBrutas = parseCsv(texto, pv > vg ? ';' : ',');
  }

  const cabecalho = linhasBrutas[cab - 1] ?? [];
  const indice = new Map<string, number>();
  const titulos: { titulo: string; col: number }[] = [];
  cabecalho.forEach((v, i) => {
    const t = textoDe(v);
    if (!t) return;
    titulos.push({ titulo: t, col: i });
    const k = chaveTexto(t);
    if (!indice.has(k)) indice.set(k, i);
  });

  const colunaDe: Partial<Record<CampoRetorno, number>> = {};
  const faltando: string[] = [];
  for (const c of CAMPOS_RETORNO) {
    const titulo = layout.colunas[c.campo];
    if (!titulo || !titulo.trim()) {
      if (c.obrigatorio) faltando.push(`Coluna não encontrada no arquivo: ${titulo ?? ''} (${c.rotulo}).`);
      continue;
    }
    const i = indice.get(chaveTexto(titulo));
    if (i === undefined) {
      if (c.obrigatorio) faltando.push(`Coluna não encontrada no arquivo: ${titulo} (${c.rotulo}).`);
    } else colunaDe[c.campo] = i;
  }
  if (faltando.length) return { linhas: [], erros: faltando };

  const dados = linhasBrutas.slice(cab).map((valores, k) => ({ valores, numero: cab + 1 + k }))
    .filter(({ valores }) => !valores.every(vazioCel));
  if (dados.length > MAX_LINHAS) {
    return { linhas: [], erros: [`O arquivo tem mais de ${MAX_LINHAS.toLocaleString('pt-BR')} linhas. Divida em arquivos menores.`] };
  }

  const linhas: LinhaRetorno[] = [];
  const erros: string[] = [];
  for (const { valores, numero } of dados) {
    const get = (campo: CampoRetorno): unknown => {
      const i = colunaDe[campo];
      return i === undefined ? null : valores[i];
    };
    const txt = (campo: CampoRetorno) => textoDe(get(campo));

    let valor: string | null = null;
    const bruto = txt('valor');
    if (bruto !== null) {
      const v = paraDinheiro(typeof get('valor') === 'number' ? get('valor') : bruto);
      if (v !== null && /^-?\d+\.\d{2}$/.test(v)) valor = v;
      else erros.push(`Linha ${numero}: valor inválido (${bruto}).`);
    }

    let competencia: string | null = null;
    const brutoComp = txt('competencia');
    if (brutoComp !== null) {
      competencia = lerCompetencia(get('competencia'));
      if (competencia === null) erros.push(`Linha ${numero}: competência inválida (${brutoComp}).`);
    }

    const todos: Record<string, string> = {};
    for (const { titulo, col } of titulos) {
      const t = textoDe(valores[col]);
      if (t !== null) todos[titulo] = t;
    }

    linhas.push({
      linha: numero,
      ade: txt('ade'),
      cpf: lerCpf(get('cpf')),
      matricula: txt('matricula'),
      valor,
      nome: txt('nome'),
      competencia,
      observacao: txt('observacao'),
      parcela_paga: txt('parcela_paga'),
      parcela_total: txt('parcela_total'),
      dados: todos,
    });
  }
  return { linhas, erros };
}

export function adivinharEscolhas(
  nomeArquivo: string, linhas: LinhaRetorno[],
): { produto?: 'parcelas' | 'mensalidades'; tipo?: 'descontados' | 'nao_descontados'; competencia?: string } {
  const nome = chaveTexto(nomeArquivo).toUpperCase().replace(/[\s_\-]+/g, ' ');
  const r: { produto?: 'parcelas' | 'mensalidades'; tipo?: 'descontados' | 'nao_descontados'; competencia?: string } = {};
  if (nome.includes('CONTRIBUI') || nome.includes('MENSALIDADE')) r.produto = 'mensalidades';
  else if (nome.includes('CONVENIO') || nome.includes('EMPRESTIMO') || nome.includes('PARCELA')) r.produto = 'parcelas';
  if (/NAO ?DESCONTAD/.test(nome)) r.tipo = 'nao_descontados';
  else if (nome.includes('DESCONTAD')) r.tipo = 'descontados';
  const comps = new Set(linhas.map((l) => l.competencia).filter((c): c is string => !!c));
  if (comps.size === 1) r.competencia = [...comps][0];
  return r;
}

export async function hashArquivo(arquivo: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', arquivo);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- remessa

function competenciaBr(c: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(c);
  return m ? `${m[2]}/${m[1]}` : c;
}

export async function gerarRemessa(linhas: LinhaRemessa[], layout: LayoutRemessa | null): Promise<ArrayBuffer> {
  const colunas = layout && layout.colunas.length ? layout.colunas : LAYOUT_REMESSA_PADRAO.colunas;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Remessa');
  ws.addRow(colunas.map((c) => c.titulo)).font = { bold: true };
  colunas.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(14, c.titulo.length + 4);
    if (c.campo === 'valor') ws.getColumn(i + 1).numFmt = '0.00';
  });
  for (const l of linhas) {
    ws.addRow(colunas.map((c) => {
      const v = l[c.campo];
      if (v === null || v === undefined) return null;
      if (c.campo === 'valor') return Number(v);
      if (c.campo === 'competencia') return competenciaBr(String(v));
      return v;
    }));
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
