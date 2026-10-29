import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AlteracaoCard } from '../aprovacoes/AlteracaoCard';
import { ClienteDadosForm } from './ClienteDadosForm';
import { ClienteRapidoForm } from './ClienteRapidoForm';
import { OQueFalta } from './OQueFalta';

const convenios = [{ id: 'c1', nome: 'Governo do Acre', vinculos: [{ id: 'v1', nome: 'Efetivo' }] }];

describe('ClienteRapidoForm', () => {
  async function preencher() {
    await userEvent.type(screen.getByLabelText('Nome'), 'Fulana');
    await userEvent.type(screen.getByLabelText('CPF'), '529.982.247-25');
    await userEvent.type(screen.getByLabelText('Celular'), '68999990000');
    await userEvent.type(screen.getByLabelText('WhatsApp'), '68999990000');
    await userEvent.selectOptions(screen.getByLabelText('Convênio'), 'c1');
    await userEvent.selectOptions(screen.getByLabelText('Vínculo'), 'v1');
    await userEvent.type(screen.getByLabelText('Matrícula'), '777');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));
  }

  it('mostra "Já existe um cliente com este CPF."', async () => {
    const onSalvar = vi.fn().mockRejectedValue({ code: '23505', message: 'duplicate key value violates unique constraint "clientes_cpf_key"' });
    render(<ClienteRapidoForm convenios={convenios} onSalvar={onSalvar} />);
    await preencher();
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um cliente com este CPF.');
    expect(onSalvar).toHaveBeenCalledWith(expect.objectContaining({ cpf: '52998224725', matricula: '777' }));
  });

  it('recusa CPF inválido sem chamar o servidor', async () => {
    const onSalvar = vi.fn();
    render(<ClienteRapidoForm convenios={convenios} onSalvar={onSalvar} />);
    await userEvent.type(screen.getByLabelText('CPF'), '111.111.111-11');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CPF inválido.');
    expect(onSalvar).not.toHaveBeenCalled();
  });
});

describe('OQueFalta', () => {
  it('lista os rótulos do servidor', () => {
    render(
      <OQueFalta
        itens={[
          { chave: 'rg', rotulo: 'RG' },
          { chave: 'conta_principal', rotulo: 'Conta bancária principal' },
        ]}
      />,
    );
    const lista = screen.getByRole('list');
    expect(within(lista).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['RG', 'Conta bancária principal']);
  });

  it('cadastro completo', () => {
    render(<OQueFalta itens={[]} />);
    expect(screen.getByText('Cadastro completo para este convênio.')).toBeInTheDocument();
  });
});

describe('ClienteDadosForm', () => {
  const cliente = { celular: '68999990000', whatsapp: '68999990000', email: null, rg: null };

  it('no portal do parceiro só existe "Enviar para conferência"', () => {
    render(<ClienteDadosForm cliente={cliente} modo="proposta" onEnviar={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Enviar para conferência' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(screen.getByText('Sua alteração será conferida pela equipe PROSESP.')).toBeInTheDocument();
  });

  it('envia só o que mudou', async () => {
    const onEnviar = vi.fn().mockResolvedValue(undefined);
    render(<ClienteDadosForm cliente={cliente} modo="proposta" onEnviar={onEnviar} />);
    await userEvent.clear(screen.getByLabelText('Celular'));
    await userEvent.type(screen.getByLabelText('Celular'), '(68) 98888-7777');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para conferência' }));
    expect(onEnviar).toHaveBeenCalledWith({ celular: '68988887777' });
  });
});

describe('AlteracaoCard', () => {
  it('recusar sem motivo mostra "Informe o motivo da recusa."', async () => {
    const onRecusar = vi.fn();
    render(
      <AlteracaoCard
        alteracao={{ id: 'a1', cliente: 'Fulana', parceiro: 'Parceiro A', tipo: 'dados', proposta: { celular: '68988887777' }, atual: { celular: '68999990000' }, criado_em: '2026-10-28T12:00:00Z' }}
        onAprovar={vi.fn()}
        onRecusar={onRecusar}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o motivo da recusa.');
    expect(onRecusar).not.toHaveBeenCalled();
  });
});
