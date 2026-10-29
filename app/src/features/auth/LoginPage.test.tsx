import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.fn();
const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a) }, rpc: (...a: unknown[]) => rpc(...a) },
}));

import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('mostra "E-mail ou senha incorretos." quando o login falha', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('E-mail'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('registra o acesso quando o login dá certo', async () => {
    signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    rpc.mockResolvedValue({ error: null });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('E-mail'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('registrar_acesso', { p_acao: 'login', p_detalhe: {} }));
  });
});
