import type { Database } from './database.types';

export type Fase = Database['public']['Enums']['fase_contrato'];
export type Situacao = Database['public']['Enums']['situacao_contrato'];

export const ROTULO_FASE: Record<Fase, string> = {
  pre_digitacao: 'Pré-digitação',
  digitado: 'Digitado',
  em_validacao: 'Em validação',
  pendente: 'Pendente',
  em_averbacao: 'Em averbação',
  averbado: 'Averbado',
  aguardando_assinatura: 'Aguardando assinatura',
  aguardando_pagamento: 'Aguardando pagamento',
  credito_liberado: 'Crédito liberado',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
};

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  em_andamento: 'Em andamento',
  ativo: 'Ativo',
  em_atraso: 'Em atraso',
  quitado: 'Quitado',
  renovado: 'Renovado',
  cancelado: 'Cancelado',
  prejuizo: 'Prejuízo',
};

/** Colunas do quadro da esteira (fases finais ficam fora). */
export const ORDEM_FASES: Fase[] = [
  'pre_digitacao', 'digitado', 'em_validacao', 'pendente', 'em_averbacao', 'averbado',
  'aguardando_assinatura', 'aguardando_pagamento',
];

export interface Transicao {
  de: string;
  para: string;
  permissao: string;
}

/** Fases para onde o usuário pode mover (a decisão final é do banco). */
export function transicoesPermitidas(
  fase: Fase,
  matriz: Transicao[],
  pode: (permissao: string) => boolean,
  faseRetorno?: Fase | null,
): Fase[] {
  const destinos = matriz
    .filter((t) => t.de === fase && pode(t.permissao))
    // a pré-digitação vira "digitado" pela aprovação, que confere a tabela vigente
    .filter((t) => !(t.de === 'pre_digitacao' && t.para === 'digitado'))
    .map((t) => t.para as Fase);
  if (fase === 'pendente' && faseRetorno && pode('contratos.mover')) destinos.unshift(faseRetorno);
  return destinos;
}

export function exigeMotivo(para: Fase): boolean {
  return para === 'pendente' || para === 'recusado';
}
