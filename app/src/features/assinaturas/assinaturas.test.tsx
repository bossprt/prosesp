import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AssinaturaCartao, type EnvioAssinatura } from '../contratos/AssinaturaCartao';
import { ModeloContratoEditor } from '../convenios/ModeloContrato';
import { ListasAssinaturas } from './AssinaturasPage';

const envio = (situacao: string): EnvioAssinatura => ({
  id: 'a1', situacao, prazo: '2026-11-06', enviado_em: '2026-10-30T10:00:00Z', assinado_em: null,
  pdf_caminho: 'k/a1/enviado.pdf', pdf_assinado_caminho: situacao === 'assinado' ? 'k/a1/assinado.pdf' : null, erro: null, reenvios: 0,
});

function cartao(fase: string, e: EnvioAssinatura | null, extra = {}) {
  const acoes = { onEnviar: vi.fn(), onReenviar: vi.fn(), onAprovar: vi.fn(), onNaoAprovar: vi.fn(), onAbrir: vi.fn() };
  render(<AssinaturaCartao fase={fase} envio={e} podeMover ehParceiro={false} {...acoes} {...extra} />);
  return acoes;
}

describe('AssinaturaCartao', () => {
  it('averbado sem envio mostra "Enviar para assinatura"', async () => {
    const a = cartao('averbado', null);
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para assinatura' }));
    expect(a.onEnviar).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Aprovar assinatura' })).not.toBeInTheDocument();
  });

  it('"Aprovar assinatura" só aparece com envio assinado', () => {
    cartao('aguardando_assinatura', envio('enviado'));
    expect(screen.queryByRole('button', { name: 'Aprovar assinatura' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar para o contato novo' })).toBeInTheDocument();
  });

  it('não aprovar exige motivo', async () => {
    const a = cartao('aguardando_assinatura', envio('assinado'));
    expect(screen.getByText('Assinado — falta conferir')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Não aprovar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o motivo.');
    expect(a.onNaoAprovar).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Motivo'), 'Selfie não confere');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(a.onNaoAprovar).toHaveBeenCalledWith('Selfie não confere');
    await userEvent.click(screen.getByRole('button', { name: 'PDF assinado' }));
    expect(a.onAbrir).toHaveBeenCalledWith('k/a1/assinado.pdf');
  });

  it('vencido permite enviar de novo; parceiro só vê os PDFs', async () => {
    cartao('aguardando_assinatura', envio('vencido'));
    expect(screen.getByRole('button', { name: 'Enviar de novo' })).toBeInTheDocument();
  });

  it('parceiro não vê botões de ação', () => {
    cartao('aguardando_assinatura', envio('assinado'), { ehParceiro: true, podeMover: false });
    expect(screen.queryByRole('button', { name: 'Aprovar assinatura' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF enviado' })).toBeInTheDocument();
  });
});

describe('ModeloContratoEditor', () => {
  const campos = [{ chave: 'cliente.nome', rotulo: 'Nome do cliente', exemplo: 'Maria' }];

  it('clicar num campo insere o marcador no texto; salvar manda texto e teste', async () => {
    const onSalvar = vi.fn();
    render(<ModeloContratoEditor campos={campos} textoInicial="" testeInicial={false} podeEditar onSalvar={onSalvar} onPrevia={vi.fn()} erro="" />);
    await userEvent.type(screen.getByLabelText('Texto do contrato'), 'Eu, ');
    await userEvent.click(screen.getByRole('button', { name: /Nome do cliente/ }));
    expect(screen.getByLabelText('Texto do contrato')).toHaveValue('Eu, {cliente.nome}');
    await userEvent.click(screen.getByLabelText('Modelo de teste (não pode ser usado em produção)'));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }));
    expect(onSalvar).toHaveBeenCalledWith('Eu, {cliente.nome}', true);
  });

  it('mostra o erro do banco como veio', () => {
    render(<ModeloContratoEditor campos={campos} textoInicial="x" testeInicial={false} podeEditar onSalvar={vi.fn()} onPrevia={vi.fn()}
      erro="Campo desconhecido: {cliente.nomee}." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Campo desconhecido: {cliente.nomee}.');
  });
});

describe('ListasAssinaturas', () => {
  it('troca de aba e lista os contratos', async () => {
    const itens = {
      conferir: [{ assinatura_id: '1', contrato_id: 'k1', contrato_numero: 11, cliente: 'Ana', cpf: '12345678909', convenio: 'Acre', situacao: 'assinado', prazo: null, erro: null }],
      vencidas: [{ assinatura_id: '2', contrato_id: 'k2', contrato_numero: 22, cliente: 'Bia', cpf: '12345678909', convenio: 'Acre', situacao: 'vencido', prazo: '2026-10-01', erro: null }],
    };
    const onAba = vi.fn();
    const { rerender } = render(<ListasAssinaturas aba="conferir" onAba={onAba} itens={itens.conferir} onTentarDeNovo={vi.fn()} />, { wrapper: MemoryRouter });
    expect(screen.getByText('Ana')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Vencidas' }));
    expect(onAba).toHaveBeenCalledWith('vencidas');
    rerender(<ListasAssinaturas aba="vencidas" onAba={onAba} itens={itens.vencidas} onTentarDeNovo={vi.fn()} />);
    expect(screen.getByText('Bia')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });
});
