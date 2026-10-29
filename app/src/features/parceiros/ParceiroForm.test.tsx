import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ParceiroForm } from './ParceiroForm';

describe('ParceiroForm', () => {
  it('recusa documento inválido antes de enviar', async () => {
    const onSalvar = vi.fn();
    render(<ParceiroForm onSalvar={onSalvar} />);
    await userEvent.type(screen.getByLabelText('Nome'), 'Parceiro X');
    await userEvent.type(screen.getByLabelText('CPF ou CNPJ'), '123');
    await userEvent.type(screen.getByLabelText('Celular'), '68999990000');
    await userEvent.type(screen.getByLabelText('WhatsApp'), '68999990000');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar parceiro' }));
    expect(await screen.findByText('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('envia só dígitos e o tipo de pessoa pelo tamanho do documento', async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    render(<ParceiroForm onSalvar={onSalvar} />);
    await userEvent.type(screen.getByLabelText('Nome'), 'Parceiro X');
    await userEvent.type(screen.getByLabelText('CPF ou CNPJ'), '529.982.247-25');
    await userEvent.type(screen.getByLabelText('Celular'), '(68) 99999-0000');
    await userEvent.type(screen.getByLabelText('WhatsApp'), '(68) 99999-0000');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar parceiro' }));
    await vi.waitFor(() =>
      expect(onSalvar).toHaveBeenCalledWith(
        expect.objectContaining({ documento: '52998224725', tipo_pessoa: 'PF', celular: '68999990000' }),
      ),
    );
  });
});
