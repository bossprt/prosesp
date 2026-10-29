import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdeCampo } from '../contratos/AdeCampo';
import { AcoesFase } from './AcoesFase';
import { CartaoContrato } from './CartaoContrato';

describe('AdeCampo', () => {
  it('no modo seguro bloqueia colar e exige as duas digitações iguais', async () => {
    const onConfirmar = vi.fn().mockResolvedValue(undefined);
    render(<AdeCampo modo="seguro" descricao="8 números" onConfirmar={onConfirmar} />);
    const ade = screen.getByLabelText('ADE');
    fireEvent.paste(ade, { clipboardData: { getData: () => '12345678' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('No modo seguro o ADE precisa ser digitado.');
    await userEvent.type(ade, '12345678');
    await userEvent.type(screen.getByLabelText('Repita o ADE'), '12345679');
    expect(screen.getByRole('button', { name: 'Registrar ADE' })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Repita o ADE'));
    await userEvent.type(screen.getByLabelText('Repita o ADE'), '12345678');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar ADE' }));
    expect(onConfirmar).toHaveBeenCalledWith('12345678', '12345678');
  });

  it('no modo rápido aceita colar e tem um campo só', async () => {
    const onConfirmar = vi.fn().mockResolvedValue(undefined);
    render(<AdeCampo modo="rapido" onConfirmar={onConfirmar} />);
    expect(screen.queryByLabelText('Repita o ADE')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('ADE'));
    await userEvent.paste('87654321');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar ADE' }));
    expect(onConfirmar).toHaveBeenCalledWith('87654321', null);
  });
});

describe('AcoesFase', () => {
  it('pede motivo para recusar', async () => {
    const onMover = vi.fn();
    render(
      <AcoesFase
        fase="digitado"
        matriz={[{ de: 'digitado', para: 'recusado', permissao: 'contratos.recusar' }]}
        pode={() => true}
        onMover={onMover}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Recusado' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o motivo.');
    expect(onMover).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Motivo'), 'Cliente desistiu');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onMover).toHaveBeenCalledWith('recusado', 'Cliente desistiu');
  });
});

describe('CartaoContrato', () => {
  it('não mostra comissão', () => {
    render(
      <MemoryRouter>
        <CartaoContrato
          contrato={{ id: 'k1', numero: 100001, cliente: 'Maria', valor_bruto: 1000, valor_parcela: 61.2, prazo: 24, desde: '2026-10-20T10:00:00Z', parceiro: 'Parceiro A' }}
          hoje={new Date('2026-10-28T10:00:00Z')}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.getByText(/8 dias/)).toBeInTheDocument();
    expect(screen.queryByText(/comiss/i)).not.toBeInTheDocument();
  });
});
