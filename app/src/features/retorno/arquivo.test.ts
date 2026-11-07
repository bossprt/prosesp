import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  adivinharEscolhas, CAMPOS_REMESSA, CAMPOS_RETORNO, gerarRemessa, hashArquivo, LAYOUT_ACRE_REMESSA, LAYOUT_ACRE_RETORNO,
  LAYOUT_REMESSA_PADRAO, lerArquivoRetorno, validarLayoutRetorno, type LayoutRetorno, type LinhaRemessa, type LinhaRetorno,
} from './arquivo';

const CAB_ACRE = ['ID_Consignacao', 'CPF', 'Matricula', 'Valor_Desconto', 'Nome', 'Folha', 'Observacao', 'Parc_Paga', 'Parc_Total'];

async function xlsx(linhas: unknown[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Plan1');
  for (const l of linhas) ws.addRow(l);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const bytes = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const utf8 = (s: string) => bytes(new TextEncoder().encode(s));
const latin1 = (s: string) => bytes(Uint8Array.from(Buffer.from(s, 'latin1')));

const SO_ADE_VALOR: LayoutRetorno = { versao: 1, colunas: { ade: 'ADE', valor: 'Valor' } };

describe('lerArquivoRetorno - xlsx', () => {
  it('lê o cabeçalho do Acre', async () => {
    const buf = await xlsx([
      CAB_ACRE,
      ['1001', '12345678901', '555', 150.5, 'Maria', '10/2026', 'ok', 3, 12],
      [],
      ['1002', '98765432100', '777', '1.234,56', 'João', new Date(Date.UTC(2026, 9, 1)), null, '4', '10'],
    ]);
    const r = await lerArquivoRetorno(buf, 'folha.xlsx', LAYOUT_ACRE_RETORNO);
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toMatchObject({
      linha: 2, ade: '1001', cpf: '12345678901', matricula: '555', valor: '150.50', nome: 'Maria', competencia: '2026-10-01',
      observacao: 'ok', parcela_paga: '3', parcela_total: '12',
    });
    expect(r.linhas[0].dados.ID_Consignacao).toBe('1001');
    expect(r.linhas[1]).toMatchObject({ linha: 4, valor: '1234.56', competencia: '2026-10-01', observacao: null });
  });

  it('títulos com acento, maiúsculas e espaços diferentes', async () => {
    const buf = await xlsx([[' ade ', 'VALOR  Descontado', 'matrícula'], ['9', 10, '00123']]);
    const layout: LayoutRetorno = { versao: 1, colunas: { ade: 'ADE', valor: 'valor descontado', matricula: 'Matricula' } };
    const r = await lerArquivoRetorno(buf, 'a.XLSX', layout);
    expect(r.erros).toEqual([]);
    expect(r.linhas[0]).toMatchObject({ ade: '9', valor: '10.00', matricula: '00123' });
  });

  it('ADE numérico do Excel vira texto sem ".0"; CPF de 10 dígitos ganha zero', async () => {
    const buf = await xlsx([['ADE', 'Valor', 'CPF'], [123456, 1234.56, 1234567890], [7.0, '35,00', '123.456.789-01']]);
    const layout: LayoutRetorno = { versao: 1, colunas: { ade: 'ADE', valor: 'Valor', cpf: 'CPF' } };
    const r = await lerArquivoRetorno(buf, 'a.xlsx', layout);
    expect(r.linhas[0]).toMatchObject({ ade: '123456', valor: '1234.56', cpf: '01234567890' });
    expect(r.linhas[1]).toMatchObject({ ade: '7', valor: '35.00', cpf: '12345678901' });
  });

  it('coluna opcional ausente fica null; obrigatória ausente é erro', async () => {
    const buf = await xlsx([['ADE', 'Valor'], ['1', 2]]);
    const ok = await lerArquivoRetorno(buf, 'a.xlsx', LAYOUT_ACRE_RETORNO);
    expect(ok.erros).toEqual(['Coluna não encontrada no arquivo: ID_Consignacao (ADE (nº da consignação)).',
      'Coluna não encontrada no arquivo: Valor_Desconto (Valor descontado).']);
    expect(ok.linhas).toEqual([]);

    const opc = await lerArquivoRetorno(buf, 'a.xlsx', { versao: 1, colunas: { ade: 'ADE', valor: 'Valor', cpf: 'CPF' } });
    expect(opc.erros).toEqual([]);
    expect(opc.linhas[0].cpf).toBeNull();
  });

  it('valor inválido vira erro e null; as demais linhas seguem', async () => {
    const buf = await xlsx([['ADE', 'Valor'], ['1', 'dez reais'], ['2', 5]]);
    const r = await lerArquivoRetorno(buf, 'a.xlsx', SO_ADE_VALOR);
    expect(r.erros).toEqual(['Linha 2: valor inválido (dez reais).']);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0].valor).toBeNull();
    expect(r.linhas[1].valor).toBe('5.00');
  });

  it('respeita linha_cabecalho', async () => {
    const buf = await xlsx([['Relatório da folha'], ['ADE', 'Valor'], ['1', 2]]);
    const r = await lerArquivoRetorno(buf, 'a.xlsx', { ...SO_ADE_VALOR, linha_cabecalho: 2 });
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].linha).toBe(3);
  });
});

describe('lerArquivoRetorno - csv', () => {
  it('separador ponto e vírgula e aspas', async () => {
    const csv = 'ADE;Valor;Nome\r\n1;"1.234,56";"Silva; José ""Zé"""\r\n\r\n2;10,00;Ana\r\n';
    const r = await lerArquivoRetorno(utf8(csv), 'a.csv', { versao: 1, colunas: { ade: 'ADE', valor: 'Valor', nome: 'Nome' } });
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toMatchObject({ linha: 2, ade: '1', valor: '1234.56', nome: 'Silva; José "Zé"' });
    expect(r.linhas[1]).toMatchObject({ linha: 4, ade: '2', valor: '10.00' });
  });

  it('separador vírgula, com valor decimal em ponto', async () => {
    const csv = 'ADE,Valor,Nome\n1,"1234.56","Souza, Maria"\n';
    const r = await lerArquivoRetorno(utf8(csv), 'a.txt', { versao: 1, colunas: { ade: 'ADE', valor: 'Valor', nome: 'Nome' } });
    expect(r.linhas[0]).toMatchObject({ valor: '1234.56', nome: 'Souza, Maria' });
  });

  it('csv em windows-1252 com acento', async () => {
    const csv = 'ADE;Valor;Observação\n1;10,00;Não descontado\n';
    const r = await lerArquivoRetorno(latin1(csv), 'a.csv', { versao: 1, colunas: { ade: 'ADE', valor: 'Valor', observacao: 'Observação' } });
    expect(r.erros).toEqual([]);
    expect(r.linhas[0].observacao).toBe('Não descontado');
  });

  it('csv em UTF-8 com BOM', async () => {
    const r = await lerArquivoRetorno(utf8('﻿ADE;Valor\n1;2,00\n'), 'a.csv', SO_ADE_VALOR);
    expect(r.erros).toEqual([]);
    expect(r.linhas[0].ade).toBe('1');
  });

  it('formato não aceito', async () => {
    const r = await lerArquivoRetorno(utf8('x'), 'a.pdf', SO_ADE_VALOR);
    expect(r).toEqual({ linhas: [], erros: ['Formato de arquivo não aceito. Use .xlsx ou .csv.'] });
  });

  it('mais de 20.000 linhas', async () => {
    const corpo = Array.from({ length: 20001 }, (_, i) => `${i + 1};1,00`).join('\n');
    const r = await lerArquivoRetorno(utf8(`ADE;Valor\n${corpo}\n`), 'a.csv', SO_ADE_VALOR);
    expect(r.linhas).toEqual([]);
    expect(r.erros).toEqual(['O arquivo tem mais de 20.000 linhas. Divida em arquivos menores.']);

    const ok = Array.from({ length: 20000 }, (_, i) => `${i + 1};1,00`).join('\n');
    const r2 = await lerArquivoRetorno(utf8(`ADE;Valor\n${ok}\n`), 'a.csv', SO_ADE_VALOR);
    expect(r2.linhas).toHaveLength(20000);
  });
});

describe('competência', () => {
  it('formatos aceitos e inválido', async () => {
    const entradas = ['10/2026', '2026-10', '202610', '01/10/2026', 'out/2026', 'Outubro/2026', '2026-10-15', '9/2026', 'xx/2026', '13/2026'];
    const csv = `ADE;Valor;Folha\n${entradas.map((e, i) => `${i + 1};1,00;${e}`).join('\n')}\n`;
    const r = await lerArquivoRetorno(utf8(csv), 'a.csv', { versao: 1, colunas: { ade: 'ADE', valor: 'Valor', competencia: 'Folha' } });
    expect(r.linhas.map((l) => l.competencia)).toEqual([
      '2026-10-01', '2026-10-01', '2026-10-01', '2026-10-01', '2026-10-01', '2026-10-01', '2026-10-01', '2026-09-01', null, null,
    ]);
    expect(r.erros).toEqual(['Linha 10: competência inválida (xx/2026).', 'Linha 11: competência inválida (13/2026).']);
  });

  it('data do Excel', async () => {
    const buf = await xlsx([['ADE', 'Valor', 'Folha'], ['1', 1, new Date(Date.UTC(2026, 9, 31))]]);
    const r = await lerArquivoRetorno(buf, 'a.xlsx', { versao: 1, colunas: { ade: 'ADE', valor: 'Valor', competencia: 'Folha' } });
    expect(r.linhas[0].competencia).toBe('2026-10-01');
  });
});

describe('adivinharEscolhas', () => {
  const comp = (c: string | null): LinhaRetorno => ({
    linha: 2, ade: '1', cpf: null, matricula: null, valor: '1.00', nome: null, competencia: c, observacao: null,
    parcela_paga: null, parcela_total: null, dados: {},
  });

  it('pelo nome do arquivo', () => {
    expect(adivinharEscolhas('CONTRIBUICAO_NAO_DESCONTADO_10_2026.xlsx', [])).toEqual({ produto: 'mensalidades', tipo: 'nao_descontados' });
    expect(adivinharEscolhas('CONVENIOS_DESCONTADO_102026.csv', [])).toEqual({ produto: 'parcelas', tipo: 'descontados' });
    expect(adivinharEscolhas('Mensalidades não-descontadas.xlsx', [])).toEqual({ produto: 'mensalidades', tipo: 'nao_descontados' });
    expect(adivinharEscolhas('arquivo.xlsx', [])).toEqual({});
  });

  it('competência só quando todas iguais', () => {
    expect(adivinharEscolhas('a.xlsx', [comp('2026-10-01'), comp(null), comp('2026-10-01')]).competencia).toBe('2026-10-01');
    expect(adivinharEscolhas('a.xlsx', [comp('2026-10-01'), comp('2026-11-01')]).competencia).toBeUndefined();
    expect(adivinharEscolhas('a.xlsx', [comp(null)]).competencia).toBeUndefined();
  });
});

describe('hashArquivo', () => {
  it('SHA-256 em hexadecimal minúsculo', async () => {
    expect(await hashArquivo(utf8('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await hashArquivo(utf8(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('gerarRemessa', () => {
  const linhas: LinhaRemessa[] = [
    {
      ade: '1001', cpf: '12345678901', matricula: '555', nome: 'Maria', valor: '150.50', competencia: '2026-10-01',
      parcela_numero: 3, parcela_total: 12, contrato_numero: 42, servico: 'Empréstimo',
    },
    {
      ade: '2002', cpf: '00000000191', matricula: '9', nome: 'João', valor: '35.00', competencia: '2026-10-01',
      parcela_numero: null, parcela_total: null, contrato_numero: null, servico: 'Mensalidade',
    },
  ];

  async function ler(buf: ArrayBuffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    return wb;
  }

  it('layout do Acre', async () => {
    const wb = await ler(await gerarRemessa(linhas, LAYOUT_ACRE_REMESSA));
    expect(wb.worksheets).toHaveLength(1);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe('Remessa');
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(LAYOUT_ACRE_REMESSA.colunas.map((c) => c.titulo));
    const r = (ws.getRow(2).values as unknown[]).slice(1);
    expect(r).toEqual(['10/2026', '555', 150.5, 'Maria', '12345678901', '1001', 'Empréstimo', 3, 12, 42]);
    expect(ws.getCell('C2').numFmt).toBe('0.00');
    expect(ws.getCell('C2').value).toBe(150.5);
    expect(ws.getCell('H3').value).toBeNull();
  });

  it('layout padrão quando null', async () => {
    const ws = (await ler(await gerarRemessa(linhas, null))).worksheets[0];
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(
      ['ADE', 'CPF', 'Matrícula', 'Nome', 'Valor', 'Competência', 'Parcela', 'Total de parcelas', 'Contrato', 'Serviço'],
    );
    expect((ws.getRow(3).values as unknown[]).slice(1, 7)).toEqual(['2002', '00000000191', '9', 'João', 35, '10/2026']);
  });
});

describe('layouts e validação', () => {
  it('o layout do Acre tem as colunas combinadas', () => {
    expect(LAYOUT_ACRE_REMESSA.colunas.map((c) => c.titulo)).toEqual([
      'Folha', 'Matricula', 'Valor_Desconto', 'Nome', 'CPF', 'ID_Consignacao', 'Servico', 'Parc_Paga', 'Parc_Total', 'Contrato interno',
    ]);
    expect(LAYOUT_REMESSA_PADRAO.colunas).toHaveLength(10);
    expect(CAMPOS_REMESSA).toHaveLength(10);
    expect(CAMPOS_RETORNO.filter((c) => c.obrigatorio).map((c) => c.campo)).toEqual(['ade', 'valor']);
  });

  it('validarLayoutRetorno', () => {
    expect(validarLayoutRetorno(LAYOUT_ACRE_RETORNO)).toEqual([]);
    expect(validarLayoutRetorno({ versao: 1, colunas: { ade: 'A', valor: 'V' } })).toEqual([]);
    expect(validarLayoutRetorno(null).length).toBeGreaterThan(0);
    expect(validarLayoutRetorno({ versao: 1, colunas: { valor: 'V' } })).toEqual(['Informe a coluna do campo obrigatório: ADE (nº da consignação).']);
    expect(validarLayoutRetorno({ versao: 1, colunas: { ade: 'A' } })).toEqual(['Informe a coluna do campo obrigatório: Valor descontado.']);
    expect(validarLayoutRetorno({ versao: 1, colunas: { ade: '  ', valor: 'V' } })).toHaveLength(1);
    expect(validarLayoutRetorno({ versao: 1, colunas: { ade: 'Valor', valor: 'VALOR' } })[0]).toContain('dois campos');
    expect(validarLayoutRetorno({ versao: 1, colunas: { ade: 'A', valor: 'V' }, linha_cabecalho: 0 })).toHaveLength(1);
    expect(validarLayoutRetorno({ versao: 2, colunas: { ade: 'A', valor: 'V' } })).toHaveLength(1);
  });
});
