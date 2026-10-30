import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { comoDono, comoUsuario, criarClienteTeste, criarUsuarioTeste, emTransacao, erroDe } from './helpers';
import {
  cenarioImportacao, comContratos, conferir, contrato, gravar, juntar, lote, novaMatricula, novoCpf, type CenarioImp, type Lote,
} from './importacao_fixture';

async function desfazer(c: pg.PoolClient, s: CenarioImp, id: string): Promise<string | null> {
  await comoUsuario(c, s.admin);
  try {
    return await erroDe(c, `select public.desfazer_importacao($1)`, [id]);
  } catch {
    return null;
  } finally {
    await comoDono(c);
  }
}

describe('0028 correções da revisão da Etapa 3', () => {
  it('desfazer de 600 contratos termina em menos de 8 segundos', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = juntar(...Array.from({ length: 300 }, () => comContratos({ parcelas_pagas: '20' }, { parcelas_pagas: '20' })));
      const { id } = await gravar(c, s, d);
      const t = Date.now();
      expect(await desfazer(c, s, id)).toBeNull();
      expect(Date.now() - t).toBeLessThan(8000);
    });
  });

  it('lote com 300 contratos e 15 parcelas detalhadas cada confere em menos de 8 segundos', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const lotes: Lote[] = Array.from({ length: 300 }, () => {
        const d = comContratos({ prazo: '15', parcelas_pagas: '0', valor_parcela: '140.00' });
        const num = d.contratos[0].numero_antigo;
        d.parcelas = Array.from({ length: 15 }, (_, i) => ({
          linha: i + 2, numero_antigo: num, numero: String(i + 1),
          competencia: new Date(Date.UTC(2024, 5 + i, 1)).toISOString().slice(0, 10),
          valor: '140.00', situacao: 'paga',
        }));
        return d;
      });
      const t = Date.now();
      const r = await conferir(c, s, juntar(...lotes));
      expect(Date.now() - t).toBeLessThan(8000);
      expect(r.resumo.Parcelas.novas).toBe(4500);
    });
  });

  it('importação que ficou em andamento pode ser desfeita', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      await comoUsuario(c, s.admin);
      const id = (await c.query(`select public.importacao_iniciar('a.xlsx', null, 'h-parada', '2026-10-01') as id`)).rows[0].id;
      const d = lote();
      await c.query(`select public.importacao_gravar_lote($1, $2)`, [id, d]);
      await comoDono(c);
      expect(await desfazer(c, s, id)).toBeNull();
      expect((await c.query(`select 1 from public.clientes where cpf = $1`, [d.clientes[0].cpf])).rowCount).toBe(0);
    });
  });

  it('marca de importação não pode ser posta nem trocada fora das funções', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const { id } = await gravar(c, s, lote());
      const outro = await criarClienteTeste(c);
      await comoUsuario(c, await criarUsuarioTeste(c, 'operador'));
      expect(await erroDe(c, `update public.cliente_matriculas set importacao_id = $1 where cliente_id = $2`, [id, outro.id])).toBe(
        'A marca de importação só é definida pelo próprio sistema.',
      );
    });
  });

  it('nº antigo que já existe para outro cliente é erro', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({});
      await gravar(c, s, d);
      const outro = comContratos({ numero_antigo: d.contratos[0].numero_antigo });
      const r = await conferir(c, s, outro);
      expect(r.erros).toContainEqual({ aba: 'Contratos', linha: 2, mensagem: `O contrato antigo nº ${d.contratos[0].numero_antigo} já existe para outro cliente.` });
    });
  });

  it('parcela detalhada aberta e vencida antes da posição vira atrasada', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({ prazo: '2', parcelas_pagas: '0', valor_parcela: '1050.00' });
      const num = d.contratos[0].numero_antigo;
      d.parcelas = [
        { linha: 2, numero_antigo: num, numero: '1', competencia: '2024-06-01', valor: '1050.00', situacao: 'aberta' },
        { linha: 3, numero_antigo: num, numero: '2', competencia: '2024-07-01', valor: '1050.00', situacao: 'paga' },
      ];
      await gravar(c, s, d);
      const k = await c.query(
        `select k.situacao::text, array_agg(p.status order by p.numero) as st from public.contratos k
         join public.parcelas p on p.contrato_id = k.id where k.numero_legado = $1 group by k.situacao`,
        [num],
      );
      expect(k.rows[0]).toEqual({ situacao: 'em_atraso', st: ['atrasada', 'paga'] });
    });
  });

  it('linhas de contrato já gravado que não está no arquivo contam como existentes', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({ prazo: '1', parcelas_pagas: '1', valor_parcela: '2000.00' });
      await gravar(c, s, d);
      const so = lote(d.clientes[0].cpf as string, d.matriculas[0].matricula as string);
      so.parcelas = [{ linha: 2, numero_antigo: d.contratos[0].numero_antigo, numero: '1', competencia: '2024-06-01', valor: '2000.00', situacao: 'paga' }];
      so.dividas = [{ linha: 2, numero_antigo: d.contratos[0].numero_antigo, credor: 'Banco X', saldo: '10.00', numero_externo: null }];
      const r = await conferir(c, s, so);
      expect(r.resumo.Parcelas).toEqual({ novas: 0, existentes: 1, erros: 0 });
      expect(r.resumo['Dívidas compradas']).toEqual({ novas: 0, existentes: 1, erros: 0 });
    });
  });

  it('CPF com dígito a mais não é cortado para achar outro cliente', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const cli = await criarClienteTeste(c);
      const d = lote(`${cli.cpf}1`, novaMatricula());
      const r = await conferir(c, s, d);
      expect(r.erros).toContainEqual({ aba: 'Clientes', linha: 2, mensagem: 'CPF inválido.' });
    });
  });

  it('matrícula corrigida depois da importação bloqueia o desfazer', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = lote(novoCpf(), novaMatricula());
      const { id } = await gravar(c, s, d);
      await c.query(`update public.cliente_matriculas set orgao = 'SEE' where importacao_id = $1`, [id]);
      expect(await desfazer(c, s, id)).toBe(`Não dá para desfazer: o cliente de CPF ${d.clientes[0].cpf} já foi alterado.`);
    });
  });

  it('pendência na averbação da mensalidade bloqueia o desfazer', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = lote();
      const { cpf, matricula } = d.matriculas[0];
      d.contratos = [contrato(cpf as string, matricula as string)];
      d.mensalidades = [{ linha: 2, cpf, convenio: 'Governo do Acre', matricula, valor: '35.00', vigente_desde: '2024-06-01', situacao: 'ativa', ade: '4242421' }];
      const { id } = await gravar(c, s, d);
      await c.query(
        `insert into public.pendencias_averbadora (tipo, mensalidade_averbacao_id, motivo)
         select 'cancelar', id, 'teste' from public.mensalidade_averbacoes where importacao_id = $1`,
        [id],
      );
      expect(await desfazer(c, s, id)).toBe(`Não dá para desfazer: a mensalidade da matrícula ${matricula} já foi alterada.`);
    });
  });
});
