import ExcelJS from 'exceljs';
import {
  ABAS, ABA_INSTRUCOES, ROTULO_POSICAO, type AbaChave, type DadosImportacao, type ErroLinha, type LinhaImp,
  type TipoColuna,
} from './colunas';

const NAO_IMPORTADO = 'Não importado: há erro em outra linha deste CPF.';
const CHAVES: AbaChave[] = ABAS.map((a) => a.chave);
const NOME_ABA = Object.fromEntries(ABAS.map((a) => [a.chave, a.nome])) as Record<AbaChave, string>;

/** Minúsculas, sem acento, sem asterisco e com espaços simples (para casar abas e colunas). */
export function chaveTexto(s: unknown): string {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\*/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');
function isoDeData(d: Date): string {
  // datas do ExcelJS chegam à meia-noite UTC; datas montadas no navegador, no horário local
  const utc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  const [a, m, dia] = utc ? [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()] : [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  return `${a}-${doisDigitos(m)}-${doisDigitos(dia)}`;
}
const dataDeSerial = (n: number) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);

function vazio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

export function paraData(v: unknown): string | null {
  if (vazio(v)) return null;
  if (v instanceof Date) return isoDeData(v);
  if (typeof v === 'number') return isoDeData(dataDeSerial(v));
  const s = String(v).trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (br) return `${br[3]}-${doisDigitos(+br[2])}-${doisDigitos(+br[1])}`;
  return s;
}

export function paraCompetencia(v: unknown): string | null {
  if (vazio(v)) return null;
  if (v instanceof Date || typeof v === 'number') return `${paraData(v)!.slice(0, 7)}-01`;
  const s = String(v).trim();
  const mesAno = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (mesAno) return `${mesAno[2]}-${doisDigitos(+mesAno[1])}-01`;
  const data = paraData(s);
  if (data && /^\d{4}-\d{2}-\d{2}$/.test(data)) return `${data.slice(0, 7)}-01`;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  return s;
}

export function paraDinheiro(v: unknown): string | null {
  if (vazio(v)) return null;
  if (typeof v === 'number') return v.toFixed(2);
  const s = String(v).replace(/R\$/i, '').replace(/\s/g, '');
  let n: string | null = null;
  if (/^-?\d{1,3}(\.\d{3})*,\d+$|^-?\d+,\d+$/.test(s)) n = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+(\.\d+)?$/.test(s)) n = s;
  return n === null ? String(v).trim() : Number(n).toFixed(2);
}

function paraTexto(v: unknown): string | null {
  if (vazio(v)) return null;
  if (v instanceof Date) return isoDeData(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

const CONVERSOR: Record<TipoColuna, (v: unknown) => string | null> = {
  texto: paraTexto, inteiro: paraTexto, data: paraData, competencia: paraCompetencia, dinheiro: paraDinheiro,
};

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

export async function gerarModelo(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ins = wb.addWorksheet(ABA_INSTRUCOES);
  ins.getCell('A1').value = ROTULO_POSICAO;
  ins.getCell('A1').font = { bold: true };
  ins.getCell('B1').numFmt = 'dd/mm/yyyy';
  ins.getCell('C1').value = 'Dia em que os dados foram tirados do sistema anterior (obrigatório).';
  ins.addRow([]);
  ins.addRow(['Aba', 'Coluna', 'Obrigatória', 'Exemplo']).font = { bold: true };
  for (const a of ABAS) {
    for (const col of a.colunas) ins.addRow([a.nome, col.titulo, col.obrigatoria ? 'Sim' : 'Não', col.exemplo]);
  }
  ins.addRow([]);
  ins.addRow(['Datas em dd/mm/aaaa; competência em mm/aaaa; valores como 1.234,56. Colunas com * são obrigatórias.']);
  ins.columns.forEach((c, i) => (c.width = [24, 32, 12, 50][i] ?? 12));

  for (const a of ABAS) {
    const ws = wb.addWorksheet(a.nome);
    ws.addRow(a.colunas.map((c) => (c.obrigatoria ? `${c.titulo} *` : c.titulo))).font = { bold: true };
    ws.columns.forEach((c) => (c.width = 20));
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function lerPlanilha(arquivo: ArrayBuffer): Promise<{ dados: DadosImportacao; errosLeitura: ErroLinha[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arquivo);
  const errosLeitura: ErroLinha[] = [];
  const porNome = new Map(wb.worksheets.map((ws) => [chaveTexto(ws.name), ws]));
  const dados = { posicao: null } as DadosImportacao;

  const ins = porNome.get(chaveTexto(ABA_INSTRUCOES));
  ins?.eachRow((row) => {
    if (chaveTexto(valorCelula(row.getCell(1).value)) === chaveTexto(ROTULO_POSICAO)) {
      dados.posicao = paraData(valorCelula(row.getCell(2).value));
    }
  });
  if (!dados.posicao) errosLeitura.push({ aba: 'Arquivo', linha: 0, mensagem: 'Informe a Data da posição na aba Instruções.' });

  for (const a of ABAS) {
    dados[a.chave] = [];
    const ws = porNome.get(chaveTexto(a.nome));
    if (!ws) {
      if (a.obrigatoria) errosLeitura.push({ aba: 'Arquivo', linha: 0, mensagem: `A aba ${a.nome} não foi encontrada.` });
      continue;
    }
    const indice = new Map<string, number>();
    ws.getRow(1).eachCell((cel, n) => indice.set(chaveTexto(valorCelula(cel.value)), n));
    ws.eachRow((row, numero) => {
      if (numero === 1) return;
      const linha: LinhaImp = { linha: numero };
      let algum = false;
      for (const col of a.colunas) {
        const n = indice.get(chaveTexto(col.titulo));
        const v = n ? CONVERSOR[col.tipo](valorCelula(row.getCell(n).value)) : null;
        if (v !== null) algum = true;
        linha[col.chave] = v;
      }
      if (algum) dados[a.chave].push(linha);
    });
  }
  return { dados, errosLeitura };
}

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const cpfDe = (v: unknown) => (soDigitos(v) ? soDigitos(v).padStart(11, '0') : '');
const texto = (v: unknown) => String(v ?? '').trim();
const matriculaChave = (conv: unknown, mat: unknown) => `${chaveTexto(conv)}|${texto(mat).replace(/^0+/, '')}`;

/** Repetições dentro do próprio arquivo (o banco confere contra o que já está gravado). */
export function conferirArquivo(d: DadosImportacao): ErroLinha[] {
  const erros: ErroLinha[] = [];
  const unicos = (aba: AbaChave, chave: (l: LinhaImp) => string) => {
    const vistos = new Map<string, number>();
    for (const l of d[aba]) {
      const k = chave(l);
      if (!k) continue;
      const antes = vistos.get(k);
      if (antes !== undefined) erros.push({ aba: NOME_ABA[aba], linha: l.linha, mensagem: `Repetido no arquivo (também na linha ${antes}).` });
      else vistos.set(k, l.linha);
    }
  };
  unicos('clientes', (l) => cpfDe(l.cpf));
  unicos('matriculas', (l) => (texto(l.matricula) ? matriculaChave(l.convenio, l.matricula) : ''));
  unicos('contratos', (l) => texto(l.numero_antigo));

  // ADE: único por convênio entre contratos e mensalidades (o histórico da mesma mensalidade pode repetir)
  const ades = new Map<string, { aba: AbaChave; linha: number; dona: string }>();
  const ade = (aba: AbaChave, l: LinhaImp, dona: string) => {
    if (!texto(l.ade)) return;
    const k = `${chaveTexto(l.convenio)}|${texto(l.ade)}`;
    const antes = ades.get(k);
    if (!antes) ades.set(k, { aba, linha: l.linha, dona });
    else if (antes.dona !== dona) {
      const onde = antes.aba === aba ? `linha ${antes.linha}` : `linha ${antes.linha} da aba ${NOME_ABA[antes.aba]}`;
      erros.push({ aba: NOME_ABA[aba], linha: l.linha, mensagem: `Repetido no arquivo (também na ${onde}).` });
    }
  };
  for (const l of d.contratos) ade('contratos', l, `k:${l.linha}`);
  for (const l of d.mensalidades) ade('mensalidades', l, `m:${matriculaChave(l.convenio, l.matricula)}`);
  return erros;
}

/** CPF de cada linha: o próprio, ou o do contrato (aba Contratos do arquivo). Vazio se não dá para saber. */
function cpfPorLinha(d: DadosImportacao): (aba: AbaChave, l: LinhaImp) => string {
  const doContrato = new Map(d.contratos.map((k) => [texto(k.numero_antigo), cpfDe(k.cpf)]));
  return (aba, l) => {
    if (aba === 'quitacoes') return doContrato.get(texto(l.numero_novo)) ?? '';
    if (aba === 'dividas' || aba === 'parcelas') return doContrato.get(texto(l.numero_antigo)) ?? '';
    return cpfDe(l.cpf);
  };
}

/** Tira do arquivo todo CPF que tem erro de leitura/repetição; as outras linhas dele recebem o aviso do CPF. */
export function separarComErro(d: DadosImportacao, erros: ErroLinha[]): { limpos: DadosImportacao; erros: ErroLinha[] } {
  const cpf = cpfPorLinha(d);
  const comErro = new Set(erros.map((e) => `${e.aba}|${e.linha}`));
  const ruins = new Set<string>();
  for (const a of CHAVES) for (const l of d[a]) if (comErro.has(`${NOME_ABA[a]}|${l.linha}`) && cpf(a, l)) ruins.add(cpf(a, l));
  const limpos = { posicao: d.posicao } as DadosImportacao;
  const saida = [...erros];
  for (const a of CHAVES) {
    limpos[a] = [];
    for (const l of d[a]) {
      const k = cpf(a, l);
      if (comErro.has(`${NOME_ABA[a]}|${l.linha}`)) continue;
      if (k && ruins.has(k)) saida.push({ aba: NOME_ABA[a], linha: l.linha, mensagem: NAO_IMPORTADO });
      else limpos[a].push(l);
    }
  }
  const ordem = (aba: string) => ABAS.findIndex((x) => x.nome === aba);
  saida.sort((x, y) => ordem(x.aba) - ordem(y.aba) || x.linha - y.linha);
  return { limpos, erros: saida };
}

/** Lotes de até maxCpfs CPFs; linhas sem CPF conhecido vão no último lote (o banco explica o erro). */
export function dividirEmLotes(d: DadosImportacao, maxCpfs = 300): DadosImportacao[] {
  const cpf = cpfPorLinha(d);
  const ordem: string[] = [];
  const grupos = new Map<string, Record<AbaChave, LinhaImp[]>>();
  const soltas = Object.fromEntries(CHAVES.map((a) => [a, [] as LinhaImp[]])) as Record<AbaChave, LinhaImp[]>;
  for (const a of CHAVES) {
    for (const l of d[a]) {
      const k = cpf(a, l);
      if (!k) {
        soltas[a].push(l);
        continue;
      }
      if (!grupos.has(k)) {
        grupos.set(k, Object.fromEntries(CHAVES.map((x) => [x, [] as LinhaImp[]])) as Record<AbaChave, LinhaImp[]>);
        ordem.push(k);
      }
      grupos.get(k)![a].push(l);
    }
  }
  const novo = () => ({ posicao: d.posicao, ...Object.fromEntries(CHAVES.map((a) => [a, [] as LinhaImp[]])) }) as DadosImportacao;
  const lotes: DadosImportacao[] = [];
  for (let i = 0; i < ordem.length; i += maxCpfs) {
    const lote = novo();
    for (const k of ordem.slice(i, i + maxCpfs)) for (const a of CHAVES) lote[a].push(...grupos.get(k)![a]);
    lotes.push(lote);
  }
  if (CHAVES.some((a) => soltas[a].length)) {
    if (!lotes.length) lotes.push(novo());
    for (const a of CHAVES) lotes[lotes.length - 1][a].push(...soltas[a]);
  }
  return lotes;
}

/** Mesmo modelo, só com as linhas que não entraram e uma coluna "Erro". */
export async function planilhaDeErros(original: ArrayBuffer, erros: ErroLinha[]): Promise<ArrayBuffer> {
  const orig = new ExcelJS.Workbook();
  await orig.xlsx.load(original);
  const porNome = new Map(orig.worksheets.map((ws) => [chaveTexto(ws.name), ws]));
  const saida = new ExcelJS.Workbook();

  const ins = porNome.get(chaveTexto(ABA_INSTRUCOES));
  const novaIns = saida.addWorksheet(ABA_INSTRUCOES);
  ins?.eachRow((row, n) => {
    novaIns.getRow(n).values = row.values as ExcelJS.CellValue[];
  });

  for (const a of ABAS) {
    const ws = porNome.get(chaveTexto(a.nome));
    const nova = saida.addWorksheet(a.nome);
    if (!ws) continue;
    const msgs = new Map<number, string[]>();
    for (const e of erros) if (e.aba === a.nome) msgs.set(e.linha, [...(msgs.get(e.linha) ?? []), e.mensagem]);
    const largura = Math.max(ws.getRow(1).cellCount, a.colunas.length);
    const cab = ws.getRow(1).values as ExcelJS.CellValue[];
    nova.addRow([...cab.slice(1, largura + 1), ...Array(Math.max(0, largura - (cab.length - 1))).fill(null), 'Erro']).font = { bold: true };
    ws.eachRow((row, n) => {
      if (n === 1 || !msgs.has(n)) return;
      const valores = Array.from({ length: largura }, (_, i) => row.getCell(i + 1).value);
      nova.addRow([...valores, msgs.get(n)!.join(' ')]);
    });
  }
  return (await saida.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function hashArquivo(a: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', a);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}
