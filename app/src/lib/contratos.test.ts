import { describe, expect, it } from 'vitest';
import { exigeMotivo, ROTULO_FASE, transicoesPermitidas } from './contratos';

const matriz = [
  { de: 'digitado', para: 'em_validacao', permissao: 'contratos.mover' },
  { de: 'digitado', para: 'pendente', permissao: 'contratos.mover' },
  { de: 'digitado', para: 'recusado', permissao: 'contratos.recusar' },
  { de: 'pre_digitacao', para: 'digitado', permissao: 'contratos.mover' },
] as const;

describe('contratos', () => {
  it('transicoesPermitidas mostra só as da matriz com permissão', () => {
    const operador = (p: string) => p === 'contratos.mover';
    expect(transicoesPermitidas('digitado', [...matriz], operador)).toEqual(['em_validacao', 'pendente']);
    const gerente = () => true;
    expect(transicoesPermitidas('digitado', [...matriz], gerente)).toEqual(['em_validacao', 'pendente', 'recusado']);
  });

  it('pré-digitação não vai para digitado pelos botões comuns (usa aprovar)', () => {
    expect(transicoesPermitidas('pre_digitacao', [...matriz], () => true)).toEqual([]);
  });

  it('pendente volta para a fase de retorno', () => {
    expect(transicoesPermitidas('pendente', [...matriz], (p) => p === 'contratos.mover', 'em_validacao')).toEqual(['em_validacao']);
  });

  it('exigeMotivo e rótulos', () => {
    expect(exigeMotivo('recusado')).toBe(true);
    expect(exigeMotivo('pendente')).toBe(true);
    expect(exigeMotivo('em_validacao')).toBe(false);
    expect(ROTULO_FASE.aguardando_pagamento).toBe('Aguardando pagamento');
  });
});
