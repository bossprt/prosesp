import { describe, expect, it } from 'vitest';
import { mensagemErro } from './erros';

describe('mensagemErro', () => {
  it('CPF duplicado', () => {
    expect(mensagemErro({ code: '23505', message: 'duplicate key value violates unique constraint "clientes_cpf_key"' })).toBe(
      'Já existe um cliente com este CPF.',
    );
  });
  it('outra duplicidade', () => {
    expect(mensagemErro({ code: '23505', message: 'duplicate key "bancos_codigo_key"' })).toBe('Este registro já existe.');
  });
  it('sobreposição de tabela', () => {
    expect(mensagemErro({ code: '23P01', message: 'conflicting key' })).toBe(
      'Já existe uma linha de tabela que atende este mesmo caso.',
    );
  });
  it('sem permissão (código ou RLS)', () => {
    expect(mensagemErro({ code: '42501', message: 'x' })).toBe('Você não tem permissão para esta ação.');
    expect(mensagemErro({ code: '42501', message: 'new row violates row-level security policy' })).toBe(
      'Você não tem permissão para esta ação.',
    );
  });
  it('mensagem do banco em português passa direto', () => {
    expect(mensagemErro({ code: 'P0001', message: 'CPF inválido.' })).toBe('CPF inválido.');
  });
  it('sem conexão', () => {
    expect(mensagemErro(new TypeError('Failed to fetch'))).toBe('Sem conexão com o servidor. Tente de novo.');
  });
  it('erro desconhecido', () => {
    expect(mensagemErro({ code: 'XX000', message: 'internal' })).toBe(
      'Algo deu errado. Tente de novo ou fale com o administrador.',
    );
    expect(mensagemErro(undefined)).toBe('Algo deu errado. Tente de novo ou fale com o administrador.');
  });
});
