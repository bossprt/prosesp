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
    ],
  },
});
