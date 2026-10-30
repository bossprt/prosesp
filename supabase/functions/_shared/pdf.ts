// Gera o PDF do contrato a partir dos blocos do modelo (A4, Helvetica, quebra de linha e de página).
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Bloco, Parcela, Parte } from './modelo.ts';

const LARGURA = 595.28;
const ALTURA = 841.89;
const MARGEM = 50;
const UTIL = LARGURA - 2 * MARGEM;
const TARJA = 'MODELO DE TESTE — NÃO USAR';
const AVISO_DATAS = 'Datas previstas; confirmadas na liberação do crédito.';

// Caracteres além do Latin-1 que a codificação WinAnsi (fontes padrão do PDF) aceita.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Troca o que a fonte padrão não consegue desenhar por "?". */
export function limparTexto(t: string): string {
  return Array.from(t.normalize('NFC'))
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
      if (ch === '\t') return ' ';
      if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_EXTRA.has(ch)) return ch;
      return '?';
    })
    .join('');
}

interface Opcoes {
  teste: boolean;
  titulo: string;
}

interface Palavra {
  texto: string;
  fonte: PDFFont;
}

class Escritor {
  pagina!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument) {
    this.novaPagina();
  }
  novaPagina() {
    this.pagina = this.doc.addPage([LARGURA, ALTURA]);
    this.y = ALTURA - MARGEM;
  }
  garantir(altura: number) {
    if (this.y - altura < MARGEM + 20) this.novaPagina();
  }
}

function quebrarPalavra(p: Palavra, tamanho: number, largura: number): Palavra[] {
  if (p.fonte.widthOfTextAtSize(p.texto, tamanho) <= largura) return [p];
  const pedacos: Palavra[] = [];
  let atual = '';
  for (const ch of Array.from(p.texto)) {
    if (atual && p.fonte.widthOfTextAtSize(atual + ch, tamanho) > largura) {
      pedacos.push({ texto: atual, fonte: p.fonte });
      atual = '';
    }
    atual += ch;
  }
  if (atual) pedacos.push({ texto: atual, fonte: p.fonte });
  return pedacos;
}

function escreverPartes(e: Escritor, partes: Parte[], tamanho: number, fontes: { normal: PDFFont; negrito: PDFFont },
  recuo = 0, forcarNegrito = false) {
  const largura = UTIL - recuo;
  const palavras: Palavra[] = [];
  for (const p of partes) {
    const fonte = p.negrito || forcarNegrito ? fontes.negrito : fontes.normal;
    for (const w of limparTexto(p.texto).split(/(\s+)/)) {
      if (w === '') continue;
      palavras.push(...quebrarPalavra({ texto: /^\s+$/.test(w) ? ' ' : w, fonte }, tamanho, largura));
    }
  }
  const altura = tamanho * 1.4;
  let linha: Palavra[] = [];
  let usado = 0;
  const desenhar = () => {
    while (linha.length && linha[linha.length - 1].texto === ' ') linha.pop();
    e.garantir(altura);
    let x = MARGEM + recuo;
    for (const w of linha) {
      e.pagina.drawText(w.texto, { x, y: e.y - tamanho, size: tamanho, font: w.fonte });
      x += w.fonte.widthOfTextAtSize(w.texto, tamanho);
    }
    e.y -= altura;
    linha = [];
    usado = 0;
  };
  for (const w of palavras) {
    const lw = w.fonte.widthOfTextAtSize(w.texto, tamanho);
    if (w.texto === ' ' && linha.length === 0) continue;
    if (usado + lw > largura && linha.length) {
      desenhar();
      if (w.texto === ' ') continue;
    }
    linha.push(w);
    usado += lw;
  }
  if (linha.length) desenhar();
}

function escreverParcelas(e: Escritor, linhas: Parcela[], normal: PDFFont, negrito: PDFFont) {
  const tam = 9.5;
  const alt = 15;
  const colunas = [0, 60, 180, 300];
  const cabecalho = () => {
    e.garantir(alt * 2);
    ['Nº', 'Competência', 'Vencimento', 'Valor'].forEach((t, i) =>
      e.pagina.drawText(limparTexto(t), { x: MARGEM + colunas[i], y: e.y - tam, size: tam, font: negrito }));
    e.y -= alt;
  };
  cabecalho();
  for (const p of linhas) {
    if (e.y - alt < MARGEM + 20) {
      e.novaPagina();
      cabecalho();
    }
    [String(p.numero), p.competencia, p.vencimento, p.valor].forEach((t, i) =>
      e.pagina.drawText(limparTexto(t), { x: MARGEM + colunas[i], y: e.y - tam, size: tam, font: normal }));
    e.y -= alt;
  }
  e.y -= 4;
  escreverPartes(e, [{ texto: AVISO_DATAS, negrito: false }], 8.5, { normal, negrito });
}

export async function gerarPdf(blocos: Bloco[], opcoes: Opcoes): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(limparTexto(opcoes.titulo));
  doc.setProducer('PROSESP');
  if (opcoes.teste) doc.setSubject(TARJA);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontes = { normal, negrito };
  const e = new Escritor(doc);

  for (const b of blocos) {
    switch (b.tipo) {
      case 'titulo':
        e.y -= 4;
        escreverPartes(e, b.partes, 14, fontes, 0, true);
        e.y -= 6;
        break;
      case 'subtitulo':
        e.y -= 4;
        escreverPartes(e, b.partes, 11.5, fontes, 0, true);
        e.y -= 2;
        break;
      case 'item':
        e.garantir(10.5 * 1.4);
        e.pagina.drawText('•', { x: MARGEM + 6, y: e.y - 10.5, size: 10.5, font: normal });
        escreverPartes(e, b.partes, 10.5, fontes, 18);
        break;
      case 'paragrafo':
        escreverPartes(e, b.partes, 10.5, fontes);
        e.y -= 6;
        break;
      case 'parcelas':
        escreverParcelas(e, b.linhas, normal, negrito);
        e.y -= 6;
        break;
    }
  }

  const paginas = doc.getPages();
  paginas.forEach((pg, i) => {
    const rodape = `Página ${i + 1} de ${paginas.length}`;
    pg.drawText(limparTexto(rodape), {
      x: (LARGURA - normal.widthOfTextAtSize(rodape, 8.5)) / 2, y: MARGEM / 2, size: 8.5, font: normal, color: rgb(0.4, 0.4, 0.4),
    });
    if (opcoes.teste) {
      pg.drawText(limparTexto(TARJA), {
        x: 90, y: 220, size: 34, font: negrito, color: rgb(0.85, 0.1, 0.1), opacity: 0.35, rotate: degrees(45),
      });
    }
  });
  return await doc.save();
}
