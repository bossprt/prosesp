import type pg from 'pg';

export interface Fixture {
  convenio: string;
  efetivo: string;
  tabela: string;
  /** L1 300–499,99 fator 0,07 · L2 500–999,99 fator 0,065 · L3 1.000–10.000 fator 0,0612 */
  linhas: { l1: string; l2: string; l3: string };
}

/** Monta tabela do Governo do Acre, vínculo Efetivo, tipo novo, prazo 24 (como dono). */
export async function montarTabela(c: pg.PoolClient): Promise<Fixture> {
  const conv = await c.query(
    `select c.id as convenio, v.id as efetivo from public.convenios c
     join public.convenio_vinculos v on v.convenio_id = c.id
     where c.nome = 'Governo do Acre' and v.nome = 'Efetivo'`,
  );
  const { convenio, efetivo } = conv.rows[0];
  const t = await c.query(
    `insert into public.tabelas_calculo (convenio_id, nome) values ($1, 'Tabela teste') returning id`,
    [convenio],
  );
  const tabela = t.rows[0].id;
  const linha = async (min: number, max: number, fator: string) => {
    const r = await c.query(
      `insert into public.tabela_linhas (tabela_id, vinculo_id, tipo, prazo, faixa_valor, vigencia, fator, valor_mensalidade)
       values ($1, $2, 'novo', 24, public.faixa_centavos($3, $4), '[2026-01-01,)', $5, 35) returning id`,
      [tabela, efetivo, min, max, fator],
    );
    await c.query(
      `insert into public.tabela_linha_comissoes (linha_id, percentual, base) values ($1, 8, 'liquido')`,
      [r.rows[0].id],
    );
    return r.rows[0].id as string;
  };
  const l1 = await linha(300, 499.99, '0.07');
  const l2 = await linha(500, 999.99, '0.065');
  const l3 = await linha(1000, 10000, '0.0612');
  return { convenio, efetivo, tabela, linhas: { l1, l2, l3 } };
}
