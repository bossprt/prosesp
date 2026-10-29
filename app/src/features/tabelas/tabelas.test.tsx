import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LinhaForm } from './LinhaForm';
import { LinhasTabela, type LinhaView } from './LinhasTabela';

const vinculos = [{ id: 'v1', nome: 'Efetivo' }];

describe('LinhaForm', () => {
  it('mostra a mensagem de sobreposição', async () => {
    const onSalvar = vi.fn().mockRejectedValue({ code: '23P01', message: 'conflicting key value' });
    render(<LinhaForm vinculos={vinculos} onSalvar={onSalvar} />);
    await userEvent.selectOptions(screen.getByLabelText('Vínculo'), 'v1');
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'novo');
    await userEvent.type(screen.getByLabelText('Prazo (meses)'), '24');
    await userEvent.type(screen.getByLabelText('Fator'), '0,0612');
    await userEvent.type(screen.getByLabelText('Comissão (%)'), '8');
    await userEvent.type(screen.getByLabelText('Valor mínimo'), '300,00');
    await userEvent.type(screen.getByLabelText('Valor máximo'), '499,99');
    await userEvent.type(screen.getByLabelText('Início da vigência'), '2026-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar linha' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma linha de tabela que atende este mesmo caso.');
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ fator: '0.0612', valor_min: '300.00', valor_max: '499.99', percentual: '8' }),
    );
  });
});

describe('LinhasTabela', () => {
  const base: Omit<LinhaView, 'id' | 'usada'> = {
    vinculo: 'Efetivo',
    tipo: 'novo',
    prazo: 24,
    faixa_valor: '[30000,50000)',
    faixa_idade: '(,)',
    vigencia: '[2026-01-01,)',
    fator: '0.07000000',
    percentual: '8.0000',
    base: 'liquido',
    valor_mensalidade: '35.00',
  };

  it('oferece só "Encerrar vigência" para linha usada', () => {
    render(
      <LinhasTabela
        linhas={[
          { ...base, id: 'a', usada: true },
          { ...base, id: 'b', usada: false, prazo: 36 },
        ]}
        podeEditar
        onEncerrar={() => {}}
        onExcluir={() => {}}
      />,
    );
    const linhaUsada = screen.getAllByRole('row')[1];
    const linhaLivre = screen.getAllByRole('row')[2];
    expect(linhaUsada).toHaveTextContent('Encerrar vigência');
    expect(linhaUsada).not.toHaveTextContent('Excluir');
    expect(linhaLivre).toHaveTextContent('Excluir');
  });
});
