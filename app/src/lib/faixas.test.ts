import { describe, expect, it } from 'vitest';
import { faixaAnos, faixaReais, vigenciaEncerrada, vigenciaTexto } from './faixas';

describe('faixas', () => {
  it('faixa de valor em centavos vira texto em reais (fim exclusivo do banco)', () => {
    expect(faixaReais('[30000,50000)')).toBe('R$ 300,00 a R$ 499,99');
    expect(faixaReais('[100000,)')).toBe('a partir de R$ 1.000,00');
    expect(faixaReais('(,)')).toBe('qualquer valor');
  });

  it('faixa de idade', () => {
    expect(faixaAnos('[18,66)')).toBe('18 a 65 anos');
    expect(faixaAnos('(,)')).toBe('qualquer idade');
  });

  it('encerrar vigência termina hoje; se a linha ainda não começou, fica só o primeiro dia', () => {
    expect(vigenciaEncerrada('[2026-01-01,)', '2026-10-28')).toBe('[2026-01-01,2026-10-29)');
    expect(vigenciaEncerrada('[2026-12-01,)', '2026-10-28')).toBe('[2026-12-01,2026-12-02)');
  });

  it('vigência', () => {
    expect(vigenciaTexto('[2026-01-01,)')).toBe('desde 01/01/2026');
    expect(vigenciaTexto('[2026-01-01,2026-11-01)')).toBe('01/01/2026 a 31/10/2026');
  });
});
