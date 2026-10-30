import { describe, expect, it } from 'vitest';
import { emTransacao } from './helpers';
import { cenarioImportacao, comContratos, conferir, gravar } from './importacao_fixture';

const NAO = 'Não importado: há erro em outra linha deste CPF.';

describe('0024 importação de contratos', () => {
  it('contrato importado fica liberado, legado e sem comissão', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({});
      const { id, r } = await gravar(c, s, d);
      expect(r.erros).toEqual([]);
      expect(r.resumo.Contratos).toEqual({ novas: 1, existentes: 0, erros: 0 });
      const k = await c.query(
        `select id, fase::text, legado, fator::text, importacao_id, valor_liquido::text, data_liberacao::text,
                primeiro_vencimento::text, valores_travados_em is not null as travado
         from public.contratos where numero_legado = $1`,
        [d.contratos[0].numero_antigo],
      );
      expect(k.rows[0]).toMatchObject({
        fase: 'credito_liberado', legado: true, fator: '0.06120000', importacao_id: id, valor_liquido: '2000.00',
        data_liberacao: '2024-05-10', primeiro_vencimento: '2024-06-28', travado: true,
      });
      expect((await c.query(`select 1 from public.contrato_comissao_regra where contrato_id = $1`, [k.rows[0].id])).rowCount).toBe(0);
      const ev = await c.query(`select para::text, motivo from public.contrato_eventos where contrato_id = $1`, [k.rows[0].id]);
      expect(ev.rows).toEqual([{ para: 'credito_liberado', motivo: 'Importado do sistema anterior' }]);
    });
  });

  it('reimportar o mesmo contrato não duplica', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({});
      await gravar(c, s, d);
      const { r } = await gravar(c, s, d);
      expect(r.resumo.Contratos).toEqual({ novas: 0, existentes: 1, erros: 0 });
    });
  });

  it('refinanciamento liga ao quitado renovado e soma o saldo', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos(
        { tipo: 'refinanciamento' },
        { situacao: 'renovado', data_liberacao: '2023-01-10', primeira_competencia: '2023-02-01' },
      );
      d.quitacoes = [{ linha: 2, numero_novo: d.contratos[0].numero_antigo, numero_quitado: d.contratos[1].numero_antigo, saldo: '500.00' }];
      const { r } = await gravar(c, s, d);
      expect(r.erros).toEqual([]);
      const k = await c.query(
        `select k.valor_liquido::text, q.reservado, (select numero_legado from public.contratos where id = q.contrato_quitado_id) as quitado
         from public.contratos k join public.contrato_quitacoes q on q.contrato_id = k.id where k.numero_legado = $1`,
        [d.contratos[0].numero_antigo],
      );
      expect(k.rows).toEqual([{ valor_liquido: '1500.00', reservado: false, quitado: d.contratos[1].numero_antigo }]);
    });
  });

  it('quitado fora do sistema vira referência com aviso', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({ tipo: 'refinanciamento' });
      d.quitacoes = [{ linha: 2, numero_novo: d.contratos[0].numero_antigo, numero_quitado: '3100', saldo: '500.00' }];
      const { r } = await gravar(c, s, d);
      expect(r.avisos).toEqual([
        { aba: 'Quitações', linha: 2, mensagem: 'Contrato quitado nº 3100 não existe no sistema; guardado só como referência.' },
      ]);
      const k = await c.query(`select quitados_legado, valor_liquido::text from public.contratos where numero_legado = $1`, [
        d.contratos[0].numero_antigo,
      ]);
      expect(k.rows[0]).toEqual({ quitados_legado: '3100', valor_liquido: '1500.00' });
    });
  });

  it('líquido menor que bruto vira desconto do sistema anterior', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({ valor_liquido: '1900.00' });
      await gravar(c, s, d);
      const k = await c.query(
        `select k.valor_liquido::text, k.total_descontos::text, t.nome
         from public.contratos k join public.contrato_descontos x on x.contrato_id = k.id
         join public.convenio_tipos_desconto t on t.id = x.tipo_desconto_id where k.numero_legado = $1`,
        [d.contratos[0].numero_antigo],
      );
      expect(k.rows).toEqual([{ valor_liquido: '1900.00', total_descontos: '100.00', nome: 'Descontos do sistema anterior' }]);
    });
  });

  it('líquido que não fecha é erro da linha do contrato', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({ tipo: 'refinanciamento', valor_liquido: '1900.00' });
      d.quitacoes = [{ linha: 2, numero_novo: d.contratos[0].numero_antigo, numero_quitado: '3100', saldo: '500.00' }];
      const r = await conferir(c, s, d);
      expect(r.erros).toContainEqual({
        aba: 'Contratos', linha: 2,
        mensagem: 'O valor líquido não fecha: bruto menos quitações e dívidas fica menor que o líquido informado.',
      });
    });
  });

  it('dívida comprada entra no contrato de compra', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({ tipo: 'compra' });
      d.dividas = [{ linha: 2, numero_antigo: d.contratos[0].numero_antigo, credor: 'Banco X', saldo: '800.00', numero_externo: '77' }];
      const { r } = await gravar(c, s, d);
      expect(r.resumo['Dívidas compradas'].novas).toBe(1);
      const k = await c.query(`select valor_liquido::text from public.contratos where numero_legado = $1`, [d.contratos[0].numero_antigo]);
      expect(k.rows[0].valor_liquido).toBe('1200.00');
    });
  });

  it('ADE repetido no banco é recusado; contrato quitado grava averbação cancelada', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      await gravar(c, s, comContratos({ ade: '999888' }));
      const r = await conferir(c, s, comContratos({ ade: '999888' }));
      expect(r.erros).toContainEqual({ aba: 'Contratos', linha: 2, mensagem: 'Este ADE já está em uso neste convênio.' });
      const d = comContratos({ situacao: 'quitado', ade: '777666' });
      await gravar(c, s, d);
      const a = await c.query(
        `select a.situacao::text from public.contrato_averbacoes a join public.contratos k on k.id = a.contrato_id where k.numero_legado = $1`,
        [d.contratos[0].numero_antigo],
      );
      expect(a.rows).toEqual([{ situacao: 'cancelada' }]);
    });
  });

  it('parceiro inexistente e tipo inválido viram erros da aba Contratos com a linha certa', async () => {
    await emTransacao(async (c) => {
      const s = await cenarioImportacao(c);
      const d = comContratos({ parceiro: 'parceiro a', situacao: 'Em Atraso' }, { parceiro: 'Ninguém' }, { tipo: 'portabilidade' });
      const r = await conferir(c, s, d);
      expect(r.erros).toEqual([
        { aba: 'Clientes', linha: 2, mensagem: NAO },
        { aba: 'Matrículas', linha: 2, mensagem: NAO },
        { aba: 'Contratos', linha: 2, mensagem: NAO },
        { aba: 'Contratos', linha: 3, mensagem: 'Parceiro não encontrado: Ninguém.' },
        { aba: 'Contratos', linha: 4, mensagem: 'Tipo inválido: portabilidade.' },
      ]);
    });
  });
});
