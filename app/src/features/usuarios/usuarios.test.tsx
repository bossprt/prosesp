import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConviteForm } from './ConviteForm';
import { GradePermissoes } from './GradePermissoes';

describe('GradePermissoes', () => {
  it('desabilita apoio.editar na coluna parceiro e permite simulador.usar', () => {
    render(
      <GradePermissoes
        permissoes={[
          { chave: 'apoio.editar', descricao: 'Editar bancos e origens' },
          { chave: 'simulador.usar', descricao: 'Usar o simulador' },
        ]}
        marcadas={new Set(['parceiro:simulador.usar'])}
        onAlternar={() => {}}
      />,
    );
    expect(screen.getByLabelText('parceiro — Editar bancos e origens')).toBeDisabled();
    expect(screen.getByLabelText('parceiro — Usar o simulador')).toBeEnabled();
    expect(screen.getByLabelText('parceiro — Usar o simulador')).toBeChecked();
    expect(screen.getByLabelText('gerente — Editar bancos e origens')).toBeEnabled();
  });

  it('chama onAlternar com perfil, permissão e novo estado', async () => {
    const onAlternar = vi.fn();
    render(
      <GradePermissoes
        permissoes={[{ chave: 'apoio.editar', descricao: 'Editar bancos e origens' }]}
        marcadas={new Set()}
        onAlternar={onAlternar}
      />,
    );
    await userEvent.click(screen.getByLabelText('operador — Editar bancos e origens'));
    expect(onAlternar).toHaveBeenCalledWith('operador', 'apoio.editar', true);
  });
});

describe('ConviteForm', () => {
  it('mostra a mensagem do servidor quando o convite falha', async () => {
    const onConvidar = vi.fn().mockRejectedValue(new Error('Já existe um usuário com este e-mail.'));
    render(<ConviteForm parceiros={[]} onConvidar={onConvidar} />);
    await userEvent.type(screen.getByLabelText('Nome'), 'Maria');
    await userEvent.type(screen.getByLabelText('E-mail'), 'maria@prosesp.test');
    await userEvent.selectOptions(screen.getByLabelText('Perfil'), 'operador');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um usuário com este e-mail.');
  });

  it('perfil parceiro exige escolher o parceiro', async () => {
    const onConvidar = vi.fn();
    render(<ConviteForm parceiros={[{ id: 'p1', nome: 'Parceiro Um' }]} onConvidar={onConvidar} />);
    await userEvent.type(screen.getByLabelText('Nome'), 'João');
    await userEvent.type(screen.getByLabelText('E-mail'), 'joao@prosesp.test');
    await userEvent.selectOptions(screen.getByLabelText('Perfil'), 'parceiro');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));
    expect(await screen.findByText('Escolha o parceiro deste usuário.')).toBeInTheDocument();
    expect(onConvidar).not.toHaveBeenCalled();
  });
});
