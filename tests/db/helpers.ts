import pg from 'pg';

export type Perfil = 'administrador' | 'gerente' | 'financeiro' | 'operador' | 'consulta' | 'parceiro';

const pool = new pg.Pool({
  connectionString: process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  max: 2,
});

/** Roda fn dentro de uma transação que sempre termina em rollback. */
export async function emTransacao(fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await fn(c);
  } finally {
    await c.query('rollback').catch(() => {});
    c.release();
  }
}

/** Cria usuário em auth.users + public.usuarios (como dono do banco). Devolve o uuid. */
export async function criarUsuarioTeste(
  c: pg.PoolClient,
  perfil: Perfil,
  opts: { parceiroId?: string; ativo?: boolean } = {},
): Promise<string> {
  const { rows } = await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
             'teste-' || gen_random_uuid() || '@prosesp.test', '', now(), now(), now())
     returning id, email`,
  );
  const { id, email } = rows[0];
  await c.query(
    `insert into public.usuarios (id, nome, email, perfil, parceiro_id, ativo) values ($1, $2, $3, $4, $5, $6)`,
    [id, `Teste ${perfil}`, email, perfil, opts.parceiroId ?? null, opts.ativo ?? true],
  );
  return id;
}

/** Passa a agir como o usuário logado (RLS valendo). */
export async function comoUsuario(c: pg.PoolClient, userId: string): Promise<void> {
  await c.query('set local role authenticated');
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
}

export async function comoAnon(c: pg.PoolClient): Promise<void> {
  await c.query('set local role anon');
  await c.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
}

/** Volta a agir como o dono do banco (sem RLS). */
export async function comoDono(c: pg.PoolClient): Promise<void> {
  await c.query('reset role');
}
