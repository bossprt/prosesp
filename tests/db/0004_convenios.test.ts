import { describe, expect, it } from 'vitest';
import { comoUsuario, criarUsuarioTeste, emTransacao } from './helpers';

describe('0004 convênios', () => {
  it('sementes: Governo do Acre com Efetivo e Temporário', async () => {
    await emTransacao(async (c) => {
      const r = await c.query(
        `select array_agg(v.nome order by v.nome) as v from public.convenios c
         join public.convenio_vinculos v on v.convenio_id = c.id where c.nome = 'Governo do Acre'`,
      );
      expect(r.rows[0].v).toEqual(['Efetivo', 'Temporário']);
    });
  });

  it('ade_regex inválido é recusado em português', async () => {
    await emTransacao(async (c) => {
      await expect(
        c.query(`update public.convenios set ade_regex = '([' where nome = 'Governo do Acre'`),
      ).rejects.toThrow('Formato de ADE inválido.');
    });
  });

  it('campo obrigatório fora do catálogo é recusado', async () => {
    await emTransacao(async (c) => {
      await expect(
        c.query(`update public.convenios set campos_obrigatorios = '{rg,signo}' where nome = 'Governo do Acre'`),
      ).rejects.toThrow('Campo obrigatório desconhecido: signo');
    });
  });

  it('campos do catálogo são aceitos', async () => {
    await emTransacao(async (c) => {
      const r = await c.query(
        `update public.convenios set campos_obrigatorios = '{rg,conta_principal,doc_rg}' where nome = 'Governo do Acre'`,
      );
      expect(r.rowCount).toBe(1);
    });
  });

  it('dia_vencimento 31 é recusado', async () => {
    await emTransacao(async (c) => {
      await expect(
        c.query(`update public.convenios set dia_vencimento = 31 where nome = 'Governo do Acre'`),
      ).rejects.toThrow(/convenios_dia_vencimento_check/);
    });
  });

  it('operador lê mas não edita convênio', async () => {
    await emTransacao(async (c) => {
      const op = await criarUsuarioTeste(c, 'operador');
      await comoUsuario(c, op);
      expect((await c.query(`select 1 from public.convenios`)).rowCount).toBe(2);
      expect((await c.query(`update public.convenios set ativo = false`)).rowCount).toBe(0);
    });
  });

  it('vínculo duplicado no mesmo convênio é recusado', async () => {
    await emTransacao(async (c) => {
      await expect(
        c.query(`insert into public.convenio_vinculos (convenio_id, nome)
                 select id, 'Efetivo' from public.convenios where nome = 'Governo do Acre'`),
      ).rejects.toThrow(/convenio_vinculos_convenio_id_nome_key/);
    });
  });
});
