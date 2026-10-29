import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CancelarMensalidade } from '../mensalidades/CancelarMensalidade';
import { DigitacaoForm, type PropsDigitacao } from './DigitacaoForm';

const base: PropsDigitacao = {
  modo: 'equipe',
  cliente: { id: 'c1', nome: 'Maria', matriculas: [{ id: 'm1', rotulo: 'Governo do Acre · 123' }] },
  contratosQuitaveis: [{ id: 'k0', numero: 100000, valor_parcela: '61.20', matricula_id: 'm1' }],
  parceiros: [{ id: 'p1', nome: 'Parceiro A' }],
  agentes: [],
  origens: [],
  onSimular: vi.fn().mockResolvedValue({ valor: '1000.00', parcela: '61.20', valor_mensalidade: '35.00' }),
  onEnviar: vi.fn().mockResolvedValue(undefined),
};

async function preencher(tipo: string) {
  await userEvent.selectOptions(screen.getByLabelText('Matrícula'), 'm1');
  await userEvent.selectOptions(screen.getByLabelText('Tipo'), tipo);
  await userEvent.type(screen.getByLabelText('Prazo (meses)'), '24');
  await userEvent.type(screen.getByLabelText('Valor do empréstimo'), '1.000,00');
}

describe('DigitacaoForm', () => {
  it('mostra líquido 600,00 para bruto 1.000,00 e quitação 400,00', async () => {
    render(<DigitacaoForm {...base} />);
    await preencher('refinanciamento');
    await userEvent.click(screen.getByLabelText('Quitar contrato nº 100000'));
    await userEvent.type(screen.getByLabelText('Saldo devedor do nº 100000'), '400,00');
    await userEvent.click(screen.getByRole('button', { name: 'Simular' }));
    expect(await screen.findByTestId('liquido')).toHaveTextContent('600,00');
  });

  it('refinanciamento exige escolher contrato a quitar', async () => {
    const onEnviar = vi.fn();
    render(<DigitacaoForm {...base} onEnviar={onEnviar} />);
    await preencher('refinanciamento');
    await userEvent.click(screen.getByRole('button', { name: 'Simular' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Digitar contrato' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha ao menos um contrato a quitar.');
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('envia os dados no formato do banco', async () => {
    const onEnviar = vi.fn().mockResolvedValue(undefined);
    render(<DigitacaoForm {...base} onEnviar={onEnviar} />);
    await preencher('novo');
    await userEvent.click(screen.getByRole('button', { name: 'Simular' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Digitar contrato' }));
    expect(onEnviar).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_id: 'c1', matricula_id: 'm1', tipo: 'novo', prazo: 24, modo: 'valor', quantia: '1000.00', quitacoes: [] }),
    );
  });

  it('na pré-digitação do parceiro não aparece o campo de parceiro', () => {
    render(<DigitacaoForm {...base} modo="parceiro" />);
    expect(screen.queryByLabelText('Parceiro')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simular' })).toBeInTheDocument();
  });
});

describe('CancelarMensalidade', () => {
  it('sem requerimento escolhido o botão fica desabilitado', async () => {
    render(<CancelarMensalidade requerimentos={[]} onCancelar={vi.fn()} />);
    expect(screen.getByText('Anexe primeiro o requerimento assinado nos documentos do cliente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar mensalidade' })).toBeDisabled();
  });
});
