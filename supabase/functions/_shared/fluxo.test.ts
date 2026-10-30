import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarClienteZapSign } from './zapsign.ts';
import { iniciarZapSignFalsa, type ZapSignFalsa } from './zapsign-falsa.ts';
import { criarFluxo, segredoConfere, ErroUsuario, type Dependencias } from './fluxo.ts';

let z: ZapSignFalsa;
let rpcs: { quem: string; nome: string; args: Record<string, unknown> }[];
let uploads: { caminho: string; tipo: string; tamanho: number }[];
let envioPorToken: Record<string, { id: string; contrato_id: string; situacao: string }>;
let cancelamentos: { id: string; zapsign_token: string }[];

const preparado = {
  assinatura_id: 'ass-1',
  contrato_numero: 1024,
  modelo: { texto: '# Contrato\n\nEu, {cliente.nome}.\n\n{parcelas.tabela}', teste: true, versao: 1 },
  dados: {
    campos: { 'cliente.nome': 'Maria' }, condicoes: { mensalidade: false, quitacoes: false, dividas: false },
    parcelas: [{ numero: 1, competencia: '10/2026', vencimento: '28/10/2026', valor: 'R$ 1,00' }],
  },
  config: { selfie: true, documento: false, codigo: true, email: true, whatsapp: true, prazo: 7, data_limite: '2026-11-06' },
  assinantes: [
    { nome: 'Maria', email: 'maria@x.test', celular: '68999990000', papel: 'cliente' },
    { nome: 'Rep', email: 'rep@x.test', celular: null, papel: 'representante' },
  ],
};

function deps(): Dependencias {
  return {
    rpcUsuario: async (nome, args) => {
      rpcs.push({ quem: 'usuario', nome, args });
      if (nome === 'assinatura_preparar') return preparado;
      if (nome === 'assinatura_para_reenviar') {
        return { assinatura_id: 'ass-1', zapsign_token: 'doc-falso-1', canais: { email: true, whatsapp: true },
          cliente: { nome: 'Maria', email: 'nova@x.test', celular: '68988887777' },
          assinantes: [{ papel: 'cliente', signer_token: 'signer-1-0', email: 'maria@x.test', celular: '68999990000' }] };
      }
      return null;
    },
    rpcServico: async (nome, args) => {
      rpcs.push({ quem: 'servico', nome, args });
      return nome === '_assinatura_atualizar' ? 'assinado' : null;
    },
    upload: async (caminho, bytes, tipo) => {
      uploads.push({ caminho, tipo, tamanho: bytes.length });
    },
    envioPorToken: async (t) => envioPorToken[t] ?? null,
    cancelamentosPendentes: async () => cancelamentos,
    zapsign: criarClienteZapSign({ url: z.url, token: 'chave-teste' }),
  };
}

beforeEach(async () => {
  z = await iniciarZapSignFalsa();
  rpcs = [];
  uploads = [];
  envioPorToken = {};
  cancelamentos = [];
});
afterEach(async () => {
  await z.fechar();
});

describe('fluxo da assinatura', () => {
  it('envio: prepara, gera PDF, guarda, cria na ZapSign com as exigências do convênio e registra', async () => {
    await criarFluxo(deps()).enviar('k-1');
    expect(rpcs.map((r) => `${r.quem}:${r.nome}`)).toEqual(['usuario:assinatura_preparar', 'servico:_assinatura_registrar_envio']);
    expect(uploads).toEqual([{ caminho: 'k-1/ass-1/enviado.pdf', tipo: 'application/pdf', tamanho: expect.any(Number) }]);
    const criar = z.chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/api/v1/docs/')!;
    expect(criar.auth).toBe('Bearer chave-teste');
    const corpo = criar.corpo as Record<string, any>;
    expect(Buffer.from(corpo.base64_pdf, 'base64').subarray(0, 4).toString()).toBe('%PDF');
    expect(corpo).toMatchObject({ lang: 'pt-br', date_limit_to_sign: '2026-11-06', external_id: 'ass-1' });
    expect(corpo.signers[0]).toMatchObject({
      name: 'Maria', email: 'maria@x.test', phone_country: '55', phone_number: '68999990000',
      auth_mode: 'assinaturaTela-tokenWhatsapp', require_selfie_photo: true, require_document_photo: false,
      send_automatic_email: true, send_automatic_whatsapp: true,
    });
    expect(corpo.signers[1]).toMatchObject({ name: 'Rep', qualification: 'representante', send_automatic_whatsapp: false });
    const reg = rpcs[1].args;
    expect(reg).toMatchObject({ p_id: 'ass-1', p_pdf_caminho: 'k-1/ass-1/enviado.pdf', p_zapsign_token: 'doc-falso-1' });
    expect((reg.p_assinantes as any[])[0]).toMatchObject({ papel: 'cliente', signer_token: 'signer-1-0' });
  });

  it('ZapSign fora do ar: marca falha e devolve mensagem em português', async () => {
    await fetch(`${z.url}/_falhar`, { method: 'POST' });
    await expect(criarFluxo(deps()).enviar('k-1')).rejects.toThrow('Não foi possível enviar para a ZapSign. Tente de novo em alguns minutos.');
    expect(rpcs.map((r) => r.nome)).toEqual(['assinatura_preparar', '_assinatura_falhou']);
  });

  it('erro de regra do banco passa adiante sem marcar falha', async () => {
    const d = deps();
    d.rpcUsuario = async () => {
      throw new ErroUsuario('Este convênio ainda não tem modelo de contrato.');
    };
    await expect(criarFluxo(d).enviar('k-1')).rejects.toThrow('Este convênio ainda não tem modelo de contrato.');
    expect(z.chamadas).toHaveLength(0);
  });

  it('aviso de documento assinado: confirma na ZapSign, guarda PDF e evidências', async () => {
    await criarFluxo(deps()).enviar('k-1');
    envioPorToken['doc-falso-1'] = { id: 'ass-1', contrato_id: 'k-1', situacao: 'enviado' };
    await fetch(`${z.url}/_assinar/doc-falso-1`, { method: 'POST' });
    rpcs = [];
    uploads = [];
    await criarFluxo(deps()).receberAviso('doc-falso-1');
    expect(uploads.map((u) => u.caminho)).toEqual(['k-1/ass-1/assinado.pdf', 'k-1/ass-1/evidencias/1-selfie.jpg']);
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0]).toMatchObject({ nome: '_assinatura_atualizar', args: { p_zapsign_token: 'doc-falso-1', p_situacao: 'assinado',
      p_pdf_assinado_caminho: 'k-1/ass-1/assinado.pdf' } });
    const ev = rpcs[0].args.p_evidencias as { assinantes: any[] };
    expect(ev.assinantes[0]).toMatchObject({ nome: 'Maria', assinado_em: '2026-10-30T12:00:00Z', selfie: 'k-1/ass-1/evidencias/1-selfie.jpg' });
  });

  it('aviso de documento pendente, desconhecido ou já tratado não faz nada', async () => {
    await criarFluxo(deps()).enviar('k-1');
    rpcs = [];
    envioPorToken['doc-falso-1'] = { id: 'ass-1', contrato_id: 'k-1', situacao: 'enviado' };
    await criarFluxo(deps()).receberAviso('doc-falso-1');
    await criarFluxo(deps()).receberAviso('nao-existe');
    envioPorToken['doc-falso-1'].situacao = 'assinado';
    await fetch(`${z.url}/_assinar/doc-falso-1`, { method: 'POST' });
    await criarFluxo(deps()).receberAviso('doc-falso-1');
    expect(rpcs).toHaveLength(0);
  });

  it('recusa do cliente vira recusado_cliente', async () => {
    await criarFluxo(deps()).enviar('k-1');
    envioPorToken['doc-falso-1'] = { id: 'ass-1', contrato_id: 'k-1', situacao: 'enviado' };
    await fetch(`${z.url}/_recusar/doc-falso-1`, { method: 'POST' });
    rpcs = [];
    await criarFluxo(deps()).receberAviso('doc-falso-1');
    expect(rpcs[0]).toMatchObject({ nome: '_assinatura_atualizar', args: { p_situacao: 'recusado_cliente', p_pdf_assinado_caminho: null } });
  });

  it('cancelamentos: uma falha não impede as outras; documento já apagado conta como cancelado', async () => {
    await criarFluxo(deps()).enviar('k-1');
    cancelamentos = [{ id: 'a', zapsign_token: 'doc-falso-1' }, { id: 'b', zapsign_token: 'sumiu' }];
    rpcs = [];
    await fetch(`${z.url}/_falhar`, { method: 'POST' });
    await criarFluxo(deps()).processarCancelamentos();
    expect(rpcs.map((r) => r.args)).toEqual([
      { p_id: 'a', p_ok: false, p_erro: expect.stringContaining('ZapSign') },
      { p_id: 'b', p_ok: true, p_erro: null },
    ]);
    rpcs = [];
    cancelamentos = [{ id: 'a', zapsign_token: 'doc-falso-1' }];
    await criarFluxo(deps()).processarCancelamentos();
    expect(rpcs[0].args).toEqual({ p_id: 'a', p_ok: true, p_erro: null });
    expect(z.docs.get('doc-falso-1')!.deleted).toBe(true);
  });

  it('reenviar para o contato novo atualiza o assinante na ZapSign e registra', async () => {
    await criarFluxo(deps()).enviar('k-1');
    rpcs = [];
    await criarFluxo(deps()).reenviar('k-1', true);
    const s = z.docs.get('doc-falso-1')!.signers[0];
    expect(s).toMatchObject({ email: 'nova@x.test', phone_number: '68988887777', send_automatic_whatsapp: true, send_automatic_email: true });
    expect(rpcs.map((r) => r.nome)).toEqual(['assinatura_para_reenviar', '_assinatura_reenviada']);
    expect((rpcs[1].args.p_assinantes as any[])[0]).toMatchObject({ email: 'nova@x.test', celular: '68988887777' });
  });

  it('prévia gera PDF sem gravar nada', async () => {
    const d = deps();
    d.rpcUsuario = async (nome, args) => {
      rpcs.push({ quem: 'usuario', nome, args });
      return nome === 'modelo_campos' ? [{ chave: 'cliente.nome', rotulo: 'Nome', exemplo: 'Maria Exemplo' }] : null;
    };
    const pdf = await criarFluxo(d).previa(null, 'Olá {cliente.nome}', false);
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe('%PDF');
    expect(rpcs.map((r) => r.nome)).toEqual(['validar_modelo_contrato', 'modelo_campos']);
    expect(uploads).toHaveLength(0);
  });

  it('segredo do aviso é conferido', () => {
    expect(segredoConfere('abc', 'abc')).toBe(true);
    expect(segredoConfere('abd', 'abc')).toBe(false);
    expect(segredoConfere(null, 'abc')).toBe(false);
    expect(segredoConfere('abc', '')).toBe(false);
  });
});
