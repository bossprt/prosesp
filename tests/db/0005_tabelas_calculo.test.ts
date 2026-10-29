import { describe, expect, it } from 'vitest';
import { comoUsuario, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import { montarTabela } from './tabelas_fixture';

const SOBREPOSICAO = /tabela_linhas_sem_sobreposicao/;

describe('0005 tabelas de cálculo', () => {
  it('faixas 300–499,99 e 500–999,99 convivem', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      expect(Object.values(f.linhas)).toHaveLength(3);
    });
  });

  it('linhas sobrepostas no mesmo convênio são recusadas mesmo em tabelas diferentes', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const t2 = await c.query(
        `insert into public.tabelas_calculo (convenio_id, nome) values ($1, 'Outra') returning id`,
        [f.convenio],
      );
      await expect(
        c.query(
          `insert into public.tabela_linhas (tabela_id, vinculo_id, tipo, prazo, faixa_valor, vigencia, fator)
           values ($1, $2, 'novo', 24, public.faixa_centavos(450, 600), '[2026-06-01,)', 0.05)`,
          [t2.rows[0].id, f.efetivo],
        ),
      ).rejects.toThrow(SOBREPOSICAO);
    });
  });

  it('faixa ilimitada conflita com qualquer outra', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      await expect(
        c.query(
          `insert into public.tabela_linhas (tabela_id, vinculo_id, tipo, prazo, vigencia, fator)
           values ($1, $2, 'novo', 24, '[2026-01-01,)', 0.05)`,
          [f.tabela, f.efetivo],
        ),
      ).rejects.toThrow(SOBREPOSICAO);
    });
  });

  it('mesma faixa em prazo diferente é aceita', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const r = await c.query(
        `insert into public.tabela_linhas (tabela_id, vinculo_id, tipo, prazo, faixa_valor, vigencia, fator)
         values ($1, $2, 'novo', 36, public.faixa_centavos(300, 499.99), '[2026-01-01,)', 0.05)`,
        [f.tabela, f.efetivo],
      );
      expect(r.rowCount).toBe(1);
    });
  });

  it('fator zero é recusado', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      await expect(
        c.query(
          `insert into public.tabela_linhas (tabela_id, vinculo_id, tipo, prazo, vigencia, fator)
           values ($1, $2, 'refinanciamento', 24, '[2026-01-01,)', 0)`,
          [f.tabela, f.efetivo],
        ),
      ).rejects.toThrow(/tabela_linhas_fator_check/);
    });
  });

  it('compra com base líquido é recusada', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const l = await c.query(
        `insert into public.tabela_linhas (tabela_id, vinculo_id, tipo, prazo, vigencia, fator)
         values ($1, $2, 'compra', 24, '[2026-01-01,)', 0.05) returning id`,
        [f.tabela, f.efetivo],
      );
      await expect(
        c.query(`insert into public.tabela_linha_comissoes (linha_id, percentual, base) values ($1, 5, 'liquido')`, [
          l.rows[0].id,
        ]),
      ).rejects.toThrow('Contrato de compra tem comissão sobre o valor bruto; novo e refinanciamento, sobre o líquido.');
    });
  });

  it('vínculo de outro convênio é recusado', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const rb = await c.query(
        `select v.id from public.convenio_vinculos v join public.convenios c on c.id = v.convenio_id
         where c.nome = 'Prefeitura de Rio Branco'`,
      );
      await expect(
        c.query(
          `insert into public.tabela_linhas (tabela_id, vinculo_id, tipo, prazo, vigencia, fator)
           values ($1, $2, 'novo', 12, '[2026-01-01,)', 0.05)`,
          [f.tabela, rb.rows[0].id],
        ),
      ).rejects.toThrow('O vínculo não pertence ao convênio desta tabela.');
    });
  });

  it('linha usada não pode ser editada', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const admin = await criarUsuarioTeste(c, 'administrador');
      await comoUsuario(c, admin);
      await c.query(
        `select * from public.simular_por_valor($1, $2, 'novo', 24, 1000, null, '2026-10-28', true)`,
        [f.convenio, f.efetivo],
      );
      const msg = 'Esta linha de tabela já foi usada e não pode ser alterada. Encerre a vigência e crie uma nova.';
      expect(await erroDe(c, `update public.tabela_linhas set fator = 0.06 where id = $1`, [f.linhas.l3])).toBe(msg);
      expect(await erroDe(c, `delete from public.tabela_linhas where id = $1`, [f.linhas.l3])).toBe(msg);
      expect(
        await erroDe(c, `update public.tabela_linha_comissoes set percentual = 9 where linha_id = $1`, [f.linhas.l3]),
      ).toBe(msg);
    });
  });

  it('linha usada pode ter a vigência encerrada', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const admin = await criarUsuarioTeste(c, 'administrador');
      await comoUsuario(c, admin);
      await c.query(
        `select * from public.simular_por_valor($1, $2, 'novo', 24, 1000, null, '2026-10-28', true)`,
        [f.convenio, f.efetivo],
      );
      const r = await c.query(
        `update public.tabela_linhas set vigencia = daterange(lower(vigencia), current_date + 1) where id = $1`,
        [f.linhas.l3],
      );
      expect(r.rowCount).toBe(1);
    });
  });

  it('operador não edita tabela', async () => {
    await emTransacao(async (c) => {
      const f = await montarTabela(c);
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect((await c.query(`update public.tabela_linhas set fator = 0.01 where id = $1`, [f.linhas.l1])).rowCount).toBe(0);
    });
  });
});
