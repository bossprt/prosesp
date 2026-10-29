import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SimuladorForm } from './SimuladorForm';

const convenios = [{ id: 'c1', nome: 'Governo do Acre', vinculos: [{ id: 'v1', nome: 'Efetivo' }] }];

async function preencher(valor: string) {
  await userEvent.selectOptions(screen.getByLabelText('Convênio'), 'c1');
  await userEvent.selectOptions(screen.getByLabelText('Vínculo'), 'v1');
  await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'novo');
  await userEvent.type(screen.getByLabelText('Prazo (meses)'), '24');
  await userEvent.type(screen.getByLabelText('Valor do empréstimo'), valor);
  await userEvent.click(screen.getByRole('button', { name: 'Simular' }));
}

describe('SimuladorForm', () => {
  it('envia valor "1.234,56" como "1234.56"', async () => {
    const onSimular = vi.fn().mockResolvedValue({
      fator: '0.06120000',
      valor: '1234.56',
      parcela: '75.56',
      valor_mensalidade: '35.00',
      percentual_comissao: '8.0000',
      base_comissao: 'liquido',
    });
    render(<SimuladorForm convenios={convenios} onSimular={onSimular} />);
    await preencher('1.234,56');
    expect(onSimular).toHaveBeenCalledWith(
      expect.objectContaining({ modo: 'valor', quantia: '1234.56', prazo: 24, convenioId: 'c1', vinculoId: 'v1', tipo: 'novo' }),
    );
    expect(await screen.findByText(/75,56/)).toBeInTheDocument();
  });

  it('mostra "Nenhuma tabela vigente atende esta simulação."', async () => {
    const onSimular = vi.fn().mockRejectedValue({ code: 'P0001', message: 'Nenhuma tabela vigente atende esta simulação.' });
    render(<SimuladorForm convenios={convenios} onSimular={onSimular} />);
    await preencher('50.000,00');
    expect(await screen.findByRole('alert')).toHaveTextContent('Nenhuma tabela vigente atende esta simulação.');
  });

  it('valor digitado errado não chama o servidor', async () => {
    const onSimular = vi.fn();
    render(<SimuladorForm convenios={convenios} onSimular={onSimular} />);
    await preencher('12,345');
    expect(await screen.findByRole('alert')).toHaveTextContent('Valor inválido.');
    expect(onSimular).not.toHaveBeenCalled();
  });
});
