import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { itensMenu } from '../../lib/permissoes';
import { PreviaImportacao, resultadoVazio, somarResultados, type Resultado } from './PreviaImportacao';

function lote(novas: number, erros: Resultado['erros'] = []): Resultado {
  const r = resultadoVazio();
  r.resumo.Clientes = { novas, existentes: 1, erros: erros.length };
  r.erros = erros;
  return r;
}

describe('prévia da importação', () => {
  it('mostra a prévia somada de dois lotes', async () => {
    const total = somarResultados([
      lote(2),
      lote(3, [{ aba: 'Clientes', linha: 7, mensagem: 'CPF inválido.' }]),
    ]);
    expect(total.resumo.Clientes).toEqual({ novas: 5, existentes: 2, erros: 1 });
    const onGravar = vi.fn();
    render(<PreviaImportacao resultado={total} onGravar={onGravar} gravando={false} />);
    expect(screen.getByText('5 linhas entram, 1 fica de fora.')).toBeInTheDocument();
    expect(screen.getByText('Aba Clientes, linha 7: CPF inválido.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Gravar' }));
    expect(onGravar).toHaveBeenCalled();
  });

  it('Gravar fica desabilitado quando nada entra', () => {
    const r = lote(0, [{ aba: 'Clientes', linha: 2, mensagem: 'CPF inválido.' }]);
    r.resumo.Clientes.existentes = 0;
    render(<PreviaImportacao resultado={r} onGravar={() => {}} gravando={false} />);
    expect(screen.getByRole('button', { name: 'Gravar' })).toBeDisabled();
  });

  it('menu mostra Importar dados antigos só com a permissão', () => {
    const op = itensMenu((k) => ['contratos.ver', 'clientes.ver'].includes(k), false).map((i) => i.rotulo);
    expect(op).not.toContain('Importar dados antigos');
    const adm = itensMenu((k) => k === 'importacao.executar', false).map((i) => i.rotulo);
    expect(adm).toContain('Importar dados antigos');
  });
});
