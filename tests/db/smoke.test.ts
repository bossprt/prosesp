import { expect, it } from 'vitest';
import { emTransacao } from './helpers';

it('conecta no banco local', async () => {
  await emTransacao(async (c) => {
    const r = await c.query('select 1 as ok');
    expect(r.rows[0].ok).toBe(1);
  });
});
