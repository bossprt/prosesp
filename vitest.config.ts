import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          environment: 'node',
          // testes de banco compartilham um único Postgres local
          fileParallelism: false,
          testTimeout: 20000,
        },
      },
      {
        root: 'app',
        esbuild: { jsx: 'automatic' },
        test: {
          name: 'app',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['src/test/setup.ts'],
          env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'chave-de-teste' },
        },
      },
    ],
  },
});
