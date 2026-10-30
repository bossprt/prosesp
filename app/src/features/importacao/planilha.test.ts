import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { DadosImportacao, LinhaImp } from './colunas';
import {
  chaveTexto, conferirArquivo, dividirEmLotes, gerarModelo, lerPlanilha, paraCompetencia, paraData, paraDinheiro,
  planilhaDeErros, separarComErro,
} from './planilha';

async function preencher(buf: ArrayBuffer, f: (wb: ExcelJS.Workbook) => void): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  f(wb);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

function vazio(): DadosImportacao {
  return { posicao: '2026-10-01', clientes: [], matriculas: [], contratos: [], quitacoes: [], dividas: [], parcelas: [], mensalidades: [] };
}
const L = (linha: number, x: Record<string, string | null>): LinhaImp => ({ linha, ...x });

describe('conversões', () => {
  it('paraData', () => {
    expect(paraData(new Date(2024, 4, 10))).toBe('2024-05-10');
    expect(paraData(new Date(Date.UTC(2024, 4, 10)))).toBe('2024-05-10');
    expect(paraData(45422)).toBe('2024-05-10');
    expect(paraData('10/05/2024')).toBe('2024-05-10');
    expect(paraData('2024-05-10')).toBe('2024-05-10');
    expect(paraData('abc')).toBe('abc');
    expect(paraData(null)).toBeNull();
    expect(paraData('  ')).toBeNull();
  });

  it('paraCompetencia', () => {
    expect(paraCompetencia('05/2024')).toBe('2024-05-01');
    expect(paraCompetencia('5/2024')).toBe('2024-05-01');
    expect(paraCompetencia(new Date(Date.UTC(2024, 4, 17)))).toBe('2024-05-01');
    expect(paraCompetencia('2024-05')).toBe('2024-05-01');
    expect(paraCompetencia('maio')).toBe('maio');
  });

  it('paraDinheiro', () => {
    expect(paraDinheiro('1.234,56')).toBe('1234.56');
    expect(paraDinheiro('1234,5')).toBe('1234.50');
    expect(paraDinheiro('R$ 35,00')).toBe('35.00');
    expect(paraDinheiro(1234.5)).toBe('1234.50');
    expect(paraDinheiro('122.40')).toBe('122.40');
    expect(paraDinheiro('dez reais')).toBe('dez reais');
  });

  it('chaveTexto ignora acento, maiúscula, asterisco e espaços', () => {
    expect(chaveTexto('  Nº contrato  ANTIGO * ')).toBe('no contrato antigo');
    expect(chaveTexto('Matrículas')).toBe('matriculas');
  });
});

describe('modelo e leitura', () => {
  it('modelo gerado é lido de volta sem erros', async () => {
    const modelo = await gerarModelo();
    const buf = await preencher(modelo, (wb) => {
      wb.getWorksheet('Instruções')!.getCell('B1').value = new Date(Date.UTC(2026, 9, 1));
      wb.getWorksheet('Clientes')!.addRow(['529.982.247-25', 'Maria', '(68) 99999-0000']);
      wb.getWorksheet('Contratos')!.addRow(['4521', 52998224725, 'Governo do Acre', 123456, 'novo', 24, 122.4, '2.000,00', null,
        new Date(Date.UTC(2024, 4, 10)), '06/2024', 5, 'ativo']);
    });
    const { dados, errosLeitura } = await lerPlanilha(buf);
    expect(errosLeitura).toEqual([]);
    expect(dados.posicao).toBe('2026-10-01');
    expect(dados.clientes[0]).toMatchObject({ linha: 2, cpf: '529.982.247-25', nome: 'Maria', celular: '(68) 99999-0000' });
    expect(dados.contratos[0]).toMatchObject({
      linha: 2, numero_antigo: '4521', cpf: '52998224725', matricula: '123456', prazo: '24', valor_parcela: '122.40',
      valor_bruto: '2000.00', valor_liquido: null, data_liberacao: '2024-05-10', primeira_competencia: '2024-06-01',
      parcelas_pagas: '5', situacao: 'ativo',
    });
  });

  it('cabeçalho com acento e maiúsculas diferentes é reconhecido; aba faltando e posição vazia viram erro', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Instrucoes');
    const cli = wb.addWorksheet('CLIENTES');
    cli.addRow(['cpf', 'NOME', 'Celular']);
    cli.addRow(['52998224725', 'Ana', '68999990000']);
    const { dados, errosLeitura } = await lerPlanilha((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(dados.clientes[0]).toMatchObject({ cpf: '52998224725', nome: 'Ana' });
    expect(errosLeitura).toContainEqual({ aba: 'Arquivo', linha: 0, mensagem: 'A aba Contratos não foi encontrada.' });
    expect(errosLeitura).toContainEqual({ aba: 'Arquivo', linha: 0, mensagem: 'Informe a Data da posição na aba Instruções.' });
  });
});

describe('conferência do arquivo e lotes', () => {
  it('conferirArquivo acha contrato repetido com as duas linhas', () => {
    const d = vazio();
    d.contratos = [L(2, { numero_antigo: '10', cpf: '1' }), L(3, { numero_antigo: '11', cpf: '1' }), L(5, { numero_antigo: ' 10', cpf: '2' })];
    expect(conferirArquivo(d)).toEqual([{ aba: 'Contratos', linha: 5, mensagem: 'Repetido no arquivo (também na linha 2).' }]);
  });

  it('conferirArquivo aceita o mesmo ADE no histórico da mesma mensalidade', () => {
    const d = vazio();
    const m = { cpf: '1', convenio: 'Acre', matricula: '9', ade: '77' };
    d.mensalidades = [L(2, m), L(3, m)];
    d.contratos = [L(2, { numero_antigo: '1', cpf: '1', convenio: 'ACRE', ade: '77' })];
    const msg = 'Repetido no arquivo (também na linha 2 da aba Contratos).';
    expect(conferirArquivo(d)).toEqual([
      { aba: 'Mensalidades', linha: 2, mensagem: msg },
      { aba: 'Mensalidades', linha: 3, mensagem: msg },
    ]);
    d.contratos = [];
    expect(conferirArquivo(d)).toEqual([]);
  });

  it('separarComErro tira o CPF inteiro', () => {
    const d = vazio();
    d.clientes = [L(2, { cpf: '529.982.247-25' }), L(3, { cpf: '11144477735' })];
    d.contratos = [L(2, { numero_antigo: 'A', cpf: '52998224725' })];
    d.parcelas = [L(2, { numero_antigo: 'A' })];
    const { limpos, erros } = separarComErro(d, [{ aba: 'Contratos', linha: 2, mensagem: 'Repetido no arquivo (também na linha 9).' }]);
    expect(limpos.clientes).toEqual([L(3, { cpf: '11144477735' })]);
    expect(limpos.contratos).toEqual([]);
    expect(limpos.parcelas).toEqual([]);
    expect(erros).toEqual([
      { aba: 'Clientes', linha: 2, mensagem: 'Não importado: há erro em outra linha deste CPF.' },
      { aba: 'Contratos', linha: 2, mensagem: 'Repetido no arquivo (também na linha 9).' },
      { aba: 'Parcelas', linha: 2, mensagem: 'Não importado: há erro em outra linha deste CPF.' },
    ]);
  });

  it('dividirEmLotes com 650 CPFs gera 3 lotes e mantém parcelas junto do contrato', () => {
    const d = vazio();
    for (let i = 0; i < 650; i++) {
      const cpf = String(10000000000 + i);
      d.clientes.push(L(i + 2, { cpf }));
      d.contratos.push(L(i + 2, { numero_antigo: `K${i}`, cpf }));
      d.parcelas.push(L(i + 2, { numero_antigo: `K${i}` }));
    }
    d.parcelas.push(L(900, { numero_antigo: 'SEM-CONTRATO' }));
    const lotes = dividirEmLotes(d);
    expect(lotes.map((l) => l.clientes.length)).toEqual([300, 300, 50]);
    expect(lotes[1].parcelas.map((p) => p.numero_antigo)).toEqual(lotes[1].contratos.map((k) => k.numero_antigo));
    expect(lotes[2].parcelas.at(-1)?.numero_antigo).toBe('SEM-CONTRATO');
    expect(lotes.every((l) => l.posicao === '2026-10-01')).toBe(true);
  });

  it('planilhaDeErros contém só as linhas com erro e a coluna Erro', async () => {
    const buf = await preencher(await gerarModelo(), (wb) => {
      const cli = wb.getWorksheet('Clientes')!;
      cli.addRow(['111', 'Ana', '68999990000']);
      cli.addRow(['52998224725', 'Bia', '68999990000']);
    });
    const saida = await planilhaDeErros(buf, [{ aba: 'Clientes', linha: 2, mensagem: 'CPF inválido.' }]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(saida);
    const cli = wb.getWorksheet('Clientes')!;
    expect(cli.rowCount).toBe(2);
    expect(cli.getRow(2).getCell(1).value).toBe('111');
    const ultima = cli.getRow(1).cellCount;
    expect(cli.getRow(1).getCell(ultima).value).toBe('Erro');
    expect(cli.getRow(2).getCell(ultima).value).toBe('CPF inválido.');
  });
});
