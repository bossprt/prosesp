import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type Ouvinte = (evento: string, s: unknown) => void;
let ouvinte: Ouvinte = () => {};
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
      onAuthStateChange: (fn: Ouvinte) => {
        ouvinte = fn;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => new Promise(() => {}) }) }) }),
  },
}));

import { SessaoProvider } from './sessao';

describe('SessaoProvider', () => {
  it('limpa os dados em cache quando o usuário sai ou troca', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['cliente', 'x'], { nome: 'Dado do usuário anterior' });
    render(
      <QueryClientProvider client={qc}>
        <SessaoProvider>
          <span />
        </SessaoProvider>
      </QueryClientProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(qc.getQueryData(['cliente', 'x'])).toBeDefined();
    await act(async () => ouvinte('SIGNED_OUT', null));
    expect(qc.getQueryData(['cliente', 'x'])).toBeUndefined();
  });
});
