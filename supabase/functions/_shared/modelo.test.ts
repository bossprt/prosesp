import { describe, expect, it } from 'vitest';
import { renderizarModelo, type DadosDocumento } from './modelo.ts';

const dados: DadosDocumento = {
  campos: { 'cliente.nome': 'Maria da Silva', 'contrato.prazo': '24', 'mensalidade.valor': 'R$ 35,00' },
  condicoes: { mensalidade: true, quitacoes: false, dividas: false },
  parcelas: [{ numero: 1, competencia: '10/2026', vencimento: '28/10/2026', valor: 'R$ 122,40' }],
};

describe('renderizarModelo', () => {
  it('troca campos, marca títulos, itens e negrito', () => {
    const b = renderizarModelo('# Contrato\n\nEu, **{cliente.nome}**, em {contrato.prazo} parcelas.\n- item {contrato.prazo}', dados);
    expect(b).toEqual([
      { tipo: 'titulo', partes: [{ texto: 'Contrato', negrito: false }] },
      { tipo: 'paragrafo', partes: [
        { texto: 'Eu, ', negrito: false }, { texto: 'Maria da Silva', negrito: true }, { texto: ', em 24 parcelas.', negrito: false },
      ] },
      { tipo: 'item', partes: [{ texto: 'item 24', negrito: false }] },
    ]);
  });

  it('linhas seguidas formam um parágrafo; subtítulo com ##', () => {
    const b = renderizarModelo('## Cláusula 1\nlinha a\nlinha b', dados);
    expect(b).toEqual([
      { tipo: 'subtitulo', partes: [{ texto: 'Cláusula 1', negrito: false }] },
      { tipo: 'paragrafo', partes: [{ texto: 'linha a linha b', negrito: false }] },
    ]);
  });

  it('condição falsa some; verdadeira só perde os marcadores', () => {
    const b = renderizarModelo('A\n\n{se quitacoes}Quitação aqui{fim}\n\n{se mensalidade}\nTermo de {mensalidade.valor}\n{fim}', dados);
    expect(b).toEqual([
      { tipo: 'paragrafo', partes: [{ texto: 'A', negrito: false }] },
      { tipo: 'paragrafo', partes: [{ texto: 'Termo de R$ 35,00', negrito: false }] },
    ]);
  });

  it('tabela de parcelas sozinha na linha vira bloco; campo ausente sai vazio', () => {
    const b = renderizarModelo('Parcelas:\n\n{parcelas.tabela}\n\nRG: {cliente.rg}', dados);
    expect(b[1]).toEqual({ tipo: 'parcelas', linhas: dados.parcelas });
    expect(b[2]).toEqual({ tipo: 'paragrafo', partes: [{ texto: 'RG: ', negrito: false }] });
  });
});
