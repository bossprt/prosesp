import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { gerarPdf } from './pdf.ts';
import type { Bloco, Parcela } from './modelo.ts';

const p = (texto: string): Bloco => ({ tipo: 'paragrafo', partes: [{ texto, negrito: false }] });
const parcelas = (n: number): Parcela[] =>
  Array.from({ length: n }, (_, i) => ({ numero: i + 1, competencia: '10/2026', vencimento: '28/10/2026', valor: 'R$ 122,40' }));

describe('gerarPdf', () => {
  it('gera um PDF válido', async () => {
    const b = await gerarPdf([{ tipo: 'titulo', partes: [{ texto: 'Contrato', negrito: false }] }, p('Olá')], { teste: false, titulo: 'Contrato 1' });
    expect(new TextDecoder().decode(b.slice(0, 4))).toBe('%PDF');
    expect((await PDFDocument.load(b)).getPageCount()).toBe(1);
  });

  it('96 parcelas quebram página', async () => {
    const b = await gerarPdf([p('Tabela'), { tipo: 'parcelas', linhas: parcelas(96) }], { teste: false, titulo: 'x' });
    expect((await PDFDocument.load(b)).getPageCount()).toBeGreaterThan(1);
  });

  it('acentos, aspas curvas, travessão, emoji e palavra enorme não quebram', async () => {
    const b = await gerarPdf([p('Cessão “fiduciária” — São João ºª 😀'), p('x'.repeat(2000)), p('palavra '.repeat(3000))], { teste: false, titulo: 'x' });
    expect((await PDFDocument.load(b)).getPageCount()).toBeGreaterThan(1);
  });

  it('modelo de teste ganha a tarja em todas as páginas', async () => {
    const normal = await gerarPdf([p('a'), { tipo: 'parcelas', linhas: parcelas(96) }], { teste: false, titulo: 'x' });
    const teste = await gerarPdf([p('a'), { tipo: 'parcelas', linhas: parcelas(96) }], { teste: true, titulo: 'x' });
    const doc = await PDFDocument.load(teste);
    expect(doc.getPageCount()).toBe((await PDFDocument.load(normal)).getPageCount());
    expect(doc.getSubject()).toBe('MODELO DE TESTE — NÃO USAR');
    expect(teste.length).toBeGreaterThan(normal.length);
  });
});
