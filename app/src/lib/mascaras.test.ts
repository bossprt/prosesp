import { describe, expect, it } from 'vitest';
import { cpfValido, formatarCelular, formatarCpf, formatarReais, lerReais, soDigitos } from './mascaras';

describe('mascaras', () => {
  it('formatarReais(1234.5) = "R$ 1.234,50"', () => {
    expect(formatarReais(1234.5)).toBe('R$ 1.234,50');
  });

  it('formatarReais aceita texto decimal do banco', () => {
    expect(formatarReais('61.20')).toBe('R$ 61,20');
  });

  it('lerReais("1.234,56") = "1234.56"', () => {
    expect(lerReais('1.234,56')).toBe('1234.56');
    expect(lerReais('R$ 0,5')).toBe('0.50');
    expect(lerReais('1000')).toBe('1000.00');
  });

  it('lerReais("abc") lança "Valor inválido."', () => {
    expect(() => lerReais('abc')).toThrow('Valor inválido.');
    expect(() => lerReais('1,234')).toThrow('Valor inválido.');
  });

  it('cpfValido segue a mesma regra do banco', () => {
    expect(cpfValido('012.345.678-90')).toBe(true);
    expect(cpfValido('1234567890')).toBe(true);
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('012.345.678-91')).toBe(false);
  });

  it('formatarCpf e formatarCelular', () => {
    expect(formatarCpf('1234567890')).toBe('012.345.678-90');
    expect(formatarCelular('68999990000')).toBe('(68) 99999-0000');
    expect(formatarCelular('6833334444')).toBe('(68) 3333-4444');
    expect(soDigitos('(68) 9-9999')).toBe('6899999');
  });
});
