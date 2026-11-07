import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LAYOUT_ACRE_REMESSA, LAYOUT_ACRE_RETORNO } from './arquivo';
import { CartoesAdimplencia } from './CartoesAdimplencia';
import { DialogoMotivo } from './DialogoMotivo';
import { EditorLayouts } from './EditorLayouts';
import { ListasAdimplencia } from './ListasAdimplencia';
import { PreviaRetorno } from './PreviaRetorno';
import { TabelaLinhasRetorno, type LinhaDetalhe } from './TabelaLinhasRetorno';
import { VincularLinha } from './VincularLinha';
import { acoesDaLinha, type LinhaConferida } from './comum';

const conf = (linha: number, situacao: string, motivo: string | null = null): LinhaConferida => ({
  linha, situacao, motivo, ade: `A${linha}`, cpf: null, nome: `Pessoa ${linha}`, valor: '100.00', saldo: null,
  contrato_numero: null, cliente: null, sugestao_contrato_numero: null, sugestao_cliente: null,
});

describe('PreviaRetorno', () => {
  const resumo = { conciliada: { qtd: 2, soma: '200.00' }, nao_encontrada: { qtd: 1, soma: '100.00' } };
  const linhas = [conf(2, 'conciliada'), conf(3, 'conciliada'), conf(4, 'nao_encontrada', 'ADE não cadastrado.')];

  it('mostra contagens, somas em R$ e filtra por situação', async () => {
    render(<PreviaRetorno resumo={resumo} linhas={linhas} onGravar={() => {}} gravando={false} />);
    expect(screen.getByText('O arquivo tem 3 linhas.')).toBeInTheDocument();
    expect(screen.getByText(/2 linhas · R\$\s200,00/)).toBeInTheDocument();
    expect(screen.getByText('ADE não cadastrado.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Mostrar só'), 'conciliada');
    expect(screen.queryByText('ADE não cadastrado.')).not.toBeInTheDocument();
    expect(screen.getByText('A2')).toBeInTheDocument();
  });

  it('Gravar chama a ação; sem linhas fica desabilitado e explica', async () => {
    const onGravar = vi.fn();
    const { unmount } = render(<PreviaRetorno resumo={resumo} linhas={linhas} onGravar={onGravar} gravando={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Gravar retorno' }));
    expect(onGravar).toHaveBeenCalled();
    unmount();
    render(<PreviaRetorno resumo={{}} linhas={[]} onGravar={onGravar} gravando={false} />);
    expect(screen.getByText('O arquivo não tem nenhuma linha para importar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gravar retorno' })).toBeDisabled();
  });
});

const det = (id: string, situacao: string, extra: Partial<LinhaDetalhe> = {}): LinhaDetalhe => ({
  id, linha: Number(id.replace(/\D/g, '')), ade: `A${id}`, nome: `Nome ${id}`, cpf: null, valor: '50.00', valor_aplicado: null,
  situacao, motivo: null, tratamento: null, tratamento_motivo: null, sugestao_contrato_id: null, sugestao_mensalidade_id: null, ...extra,
});

describe('TabelaLinhasRetorno', () => {
  const linhas = [
    det('1', 'conciliada'), det('2', 'nao_encontrada'), det('3', 'divergente'), det('4', 'duplicada'),
    det('5', 'nao_descontada'), det('6', 'nao_encontrada', { tratamento: 'vinculada', tratamento_motivo: 'Contrato trocado' }),
  ];

  it('ações só nas linhas certas', () => {
    render(<TabelaLinhasRetorno linhas={linhas} retornoGravado podeTratar onVincular={() => {}} onIgnorar={() => {}} />);
    const linha = (ade: string) => within(screen.getByText(ade).closest('tr')!);
    expect(linha('A1').queryByRole('button')).not.toBeInTheDocument();
    expect(linha('A2').getByRole('button', { name: 'Vincular' })).toBeInTheDocument();
    expect(linha('A2').getByRole('button', { name: 'Ignorar' })).toBeInTheDocument();
    expect(linha('A3').getByRole('button', { name: 'Vincular' })).toBeInTheDocument();
    expect(linha('A4').queryByRole('button', { name: 'Vincular' })).not.toBeInTheDocument();
    expect(linha('A4').getByRole('button', { name: 'Marcar como visto' })).toBeInTheDocument();
    expect(linha('A5').getByRole('button', { name: 'Marcar como visto' })).toBeInTheDocument();
    expect(linha('A6').queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Vinculada: Contrato trocado')).toBeInTheDocument();
  });

  it('sem permissão ou com retorno desfeito, nenhuma ação', () => {
    const { unmount } = render(<TabelaLinhasRetorno linhas={linhas} retornoGravado podeTratar={false} onVincular={() => {}} onIgnorar={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();
    render(<TabelaLinhasRetorno linhas={linhas} retornoGravado={false} podeTratar onVincular={() => {}} onIgnorar={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('em arquivo de não descontados só cabe marcar como visto', () => {
    expect(acoesDaLinha({ situacao: 'nao_encontrada', tratamento: null }, true, true, false)).toEqual({ vincular: false, ignorar: false });
    expect(acoesDaLinha({ situacao: 'nao_descontada', tratamento: null }, true, true, false)).toEqual({ vincular: false, ignorar: true });
  });

  it('filtra por situação e dispara Vincular com a linha', async () => {
    const onVincular = vi.fn();
    render(<TabelaLinhasRetorno linhas={linhas} retornoGravado podeTratar onVincular={onVincular} onIgnorar={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText('Mostrar só'), 'divergente');
    expect(screen.queryByText('A1')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(onVincular).toHaveBeenCalledWith(expect.objectContaining({ id: '3' }));
  });
});

describe('DialogoMotivo e VincularLinha', () => {
  it('motivo é obrigatório', async () => {
    const onConfirmar = vi.fn();
    render(<DialogoMotivo titulo="Desfazer" onConfirmar={onConfirmar} onCancelar={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o motivo.');
    expect(onConfirmar).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Motivo'), '  erro de digitação ');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirmar).toHaveBeenCalledWith('erro de digitação');
  });

  it('vincular usa a sugestão com motivo', async () => {
    const onConfirmar = vi.fn();
    render(<VincularLinha produto="parcelas" sugestao="contrato nº 12" onConfirmar={onConfirmar} onCancelar={() => {}} />);
    await userEvent.type(screen.getByLabelText('Motivo'), 'ADE trocado');
    await userEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(onConfirmar).toHaveBeenCalledWith({ tipo: 'sugestao' }, 'ADE trocado');
  });

  it('sem sugestão, pede o número do contrato', async () => {
    const onConfirmar = vi.fn();
    render(<VincularLinha produto="parcelas" sugestao={null} onConfirmar={onConfirmar} onCancelar={() => {}} />);
    await userEvent.type(screen.getByLabelText('Motivo'), 'achei');
    await userEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o número do contrato.');
    await userEvent.type(screen.getByLabelText('Número do contrato'), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(onConfirmar).toHaveBeenCalledWith({ tipo: 'numero', numero: 45 }, 'achei');
  });
});

describe('CartoesAdimplencia', () => {
  it('formata dinheiro em R$ e percentual', () => {
    render(
      <CartoesAdimplencia
        parcelas={{ esperado: '1234.5', recebido: '1000.00', percentual: '81.01', pagas: 3, parciais: 1, nao_pagas: 2 }}
        mensalidades={{ esperado: '0', recebido: '0', percentual: null, atrasadas: 4 }}
      />,
    );
    const p = within(screen.getByRole('region', { name: 'Parcelas' }));
    expect(p.getByText(/R\$\s1\.234,50/)).toBeInTheDocument();
    expect(p.getByText('81,01%')).toBeInTheDocument();
    expect(p.getByText(/3 pagas · 1 parciais · 2 não pagas/)).toBeInTheDocument();
    const m = within(screen.getByRole('region', { name: 'Mensalidades' }));
    expect(m.getByText('—')).toBeInTheDocument();
    expect(m.getByText(/4 atrasadas/)).toBeInTheDocument();
  });
});

describe('ListasAdimplencia', () => {
  it('Tudo pago explica a quitação e liga ao contrato', () => {
    render(
      <MemoryRouter>
        <ListasAdimplencia aba="tudo_pago" onAba={() => {}} naoDescontadas={[]} ausentes={[]} emAtraso={[]}
          tudoPago={[{ contrato_id: 'c1', contrato_numero: 7, cliente: 'Maria' }]} produtoAusentes="parcelas" onProdutoAusentes={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/a quitação é feita pelo encerramento do contrato/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'nº 7' })).toHaveAttribute('href', '/contratos/c1');
  });

  it('troca de aba e de produto nos ausentes', async () => {
    const onAba = vi.fn();
    const onProduto = vi.fn();
    render(
      <MemoryRouter>
        <ListasAdimplencia aba="ausentes" onAba={onAba} naoDescontadas={[]} emAtraso={[]} tudoPago={[]}
          ausentes={[{ contrato_id: 'c2', contrato_numero: 9, cliente: 'João', cpf: '12345678901', matricula: '55', ade: '777', valor: '10', saldo: '10' }]}
          produtoAusentes="parcelas" onProdutoAusentes={onProduto} />
      </MemoryRouter>,
    );
    expect(screen.getByText('João')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Produto'), 'mensalidades');
    expect(onProduto).toHaveBeenCalledWith('mensalidades');
    await userEvent.click(screen.getByRole('tab', { name: 'Em atraso' }));
    expect(onAba).toHaveBeenCalledWith('em_atraso');
  });
});

describe('EditorLayouts', () => {
  it('modelo do Governo do Acre preenche os campos e salva', async () => {
    const onSalvar = vi.fn();
    render(<EditorLayouts layoutRetorno={null} layoutRemessa={null} podeEditar onSalvar={onSalvar} />);
    await userEvent.click(screen.getByRole('button', { name: 'Usar modelo do Governo do Acre' }));
    expect(screen.getByLabelText(/ADE \(nº da consignação\)/)).toHaveValue(LAYOUT_ACRE_RETORNO.colunas.ade);
    expect(screen.getByLabelText(`Título da coluna ${LAYOUT_ACRE_REMESSA.colunas.length}`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar).toHaveBeenCalledTimes(1);
    const [ret, rem] = onSalvar.mock.calls[0];
    expect(ret.colunas.ade).toBe(LAYOUT_ACRE_RETORNO.colunas.ade);
    expect(rem.colunas).toHaveLength(LAYOUT_ACRE_REMESSA.colunas.length);
  });

  it('sem ADE e valor mostra erro e não salva', async () => {
    const onSalvar = vi.fn();
    render(<EditorLayouts layoutRetorno={null} layoutRemessa={null} podeEditar onSalvar={onSalvar} />);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('adiciona, sobe e remove colunas da remessa; somente leitura sem permissão', async () => {
    const { unmount } = render(<EditorLayouts layoutRetorno={LAYOUT_ACRE_RETORNO} layoutRemessa={{ versao: 1, colunas: [{ titulo: 'A', campo: 'ade' }] }} podeEditar onSalvar={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar coluna' }));
    await userEvent.type(screen.getByLabelText('Título da coluna 2'), 'B');
    await userEvent.click(screen.getByRole('button', { name: 'Subir coluna 2' }));
    expect(screen.getByLabelText('Título da coluna 1')).toHaveValue('B');
    await userEvent.click(screen.getByRole('button', { name: 'Remover coluna 1' }));
    expect(screen.queryByLabelText('Título da coluna 2')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Título da coluna 1')).toHaveValue('A');
    unmount();
    render(<EditorLayouts layoutRetorno={LAYOUT_ACRE_RETORNO} layoutRemessa={null} podeEditar={false} onSalvar={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Usar modelo do Governo do Acre' })).not.toBeInTheDocument();
  });
});
