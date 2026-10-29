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

/** Roda a consulta isolada num savepoint e devolve a mensagem de erro (ou falha se não der erro). */
export async function erroDe(c: pg.PoolClient, sql: string, params: unknown[] = []): Promise<string> {
  await c.query('savepoint esperar_erro');
  try {
    await c.query(sql, params);
  } catch (e) {
    await c.query('rollback to savepoint esperar_erro');
    return (e as Error).message;
  }
  await c.query('release savepoint esperar_erro');
  throw new Error(`Era esperado erro em: ${sql}`);
}

/** Gera um CPF válido (11 dígitos) a partir de um número base de 9 dígitos. */
export function gerarCpf(base: number): string {
  const d = String(base).padStart(9, '0').slice(-9).split('').map(Number);
  const dv = (nums: number[]) => {
    const s = nums.reduce((acc, n, i) => acc + n * (nums.length + 1 - i), 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  d.push(dv(d));
  d.push(dv(d));
  return d.join('');
}

let seqCpf = 100000000 + (Date.now() % 100000) * 1000;
/** Cria cliente com matrícula no Governo do Acre / Efetivo (como dono). */
export async function criarClienteTeste(
  c: pg.PoolClient,
  opts: { cpf?: string; matricula?: string; nome?: string } = {},
): Promise<{ id: string; cpf: string; matricula: string }> {
  seqCpf += 1;
  const cpf = opts.cpf ?? gerarCpf(seqCpf);
  const matricula = opts.matricula ?? String(seqCpf);
  const { rows } = await c.query(
    `insert into public.clientes (cpf, nome, celular, whatsapp) values ($1, $2, '68999990000', '68999990000') returning id, cpf`,
    [cpf, opts.nome ?? 'Cliente Teste'],
  );
  await c.query(
    `insert into public.cliente_matriculas (cliente_id, convenio_id, vinculo_id, matricula)
     select $1, c.id, v.id, $2 from public.convenios c join public.convenio_vinculos v on v.convenio_id = c.id
     where c.nome = 'Governo do Acre' and v.nome = 'Efetivo'`,
    [rows[0].id, matricula],
  );
  return { id: rows[0].id, cpf: rows[0].cpf, matricula };
}

let seqDoc = 0;
/** Cria parceiro PJ com CNPJ fictício único (como dono). Devolve o uuid. */
export async function criarParceiroTeste(c: pg.PoolClient, nome = 'Parceiro Teste'): Promise<string> {
  seqDoc += 1;
  const doc = String(90000000000000 + Date.now() % 1000000 * 100 + seqDoc).slice(0, 14);
  const { rows } = await c.query(
    `insert into public.parceiros (tipo_pessoa, documento, nome, celular, whatsapp)
     values ('PJ', $1, $2, '68999990000', '68999990000') returning id`,
    [doc, nome],
  );
  return rows[0].id;
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
  // sem usuário logado (como o pg_cron e os scripts de manutenção)
  await c.query(`select set_config('request.jwt.claims', '', true)`);
}
