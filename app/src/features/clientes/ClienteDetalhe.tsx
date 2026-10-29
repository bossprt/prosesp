import { useState, type FormEvent } from 'react';
import { Aviso, Botao, Campo, Selecao, Tabela } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { formatarCelular, formatarCpf } from '../../lib/mascaras';
import { TIPOS_CONTA, TIPOS_PIX } from '../../lib/opcoes';
import { supabase } from '../../lib/supabase';
import { useConveniosOpcoes } from '../convenios/useConvenios';
import { MensalidadesSecao } from '../mensalidades/MensalidadesSecao';
import { ClienteDadosForm, type DadosCliente } from './ClienteDadosForm';
import { OQueFalta } from './OQueFalta';

type Modo = 'equipe' | 'parceiro';
const BUCKET = 'documentos-clientes';
const TIPOS_DOC = [
  { valor: 'rg', rotulo: 'RG' },
  { valor: 'comprovante_residencia', rotulo: 'Comprovante de residência' },
  { valor: 'outro', rotulo: 'Outro' },
];

function propor(clienteId: string, tipo: 'dados' | 'conta' | 'matricula', proposta: Record<string, unknown>) {
  return exigir(supabase.rpc('parceiro_propor_alteracao', { p_cliente_id: clienteId, p_tipo: tipo, p_proposta: proposta as never }));
}

export function ClienteDetalhe({ clienteId, modo }: { clienteId: string; modo: Modo }) {
  const chave = ['cliente', clienteId];
  const cliente = useConsulta(chave, () => exigir(supabase.from('clientes').select('*').eq('id', clienteId).maybeSingle()));
  const matriculas = useConsulta(['matriculas', clienteId], () =>
    exigir(
      supabase
        .from('cliente_matriculas')
        .select('*, convenios(nome), convenio_vinculos(nome)')
        .eq('cliente_id', clienteId),
    ),
  );
  const salvarDados = useAcao(
    (m: DadosCliente) =>
      modo === 'equipe'
        ? exigir(supabase.from('clientes').update(m as never).eq('id', clienteId))
        : propor(clienteId, 'dados', m),
    [chave, ['historico', clienteId], ['propostas', clienteId]],
  );

  if (cliente.isLoading) return <p className="text-sm">Carregando…</p>;
  if (!cliente.data) return <Aviso>Cliente não encontrado.</Aviso>;
  const c = cliente.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">{c.nome}</h2>
        <span className="text-sm text-slate-600">CPF {formatarCpf(c.cpf)}</span>
        <span className="text-sm text-slate-600">WhatsApp {formatarCelular(c.whatsapp)}</span>
      </header>

      <QuadroOQueFalta clienteId={clienteId} matriculas={(matriculas.data ?? []).map((m) => ({ id: m.convenio_id, nome: m.convenios?.nome ?? '' }))} />

      <Secao titulo="Cadastro completo">
        <ClienteDadosForm key={c.atualizado_em} cliente={c} modo={modo === 'equipe' ? 'direto' : 'proposta'} onEnviar={(m) => salvarDados.mutateAsync(m)} />
      </Secao>

      <Secao titulo="Matrículas">
        <Tabela colunas={['Convênio', 'Vínculo', 'Matrícula', 'Órgão', 'Situação']}>
          {(matriculas.data ?? []).map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-2">{m.convenios?.nome}</td>
              <td className="px-3 py-2">{m.convenio_vinculos?.nome}</td>
              <td className="px-3 py-2">{m.matricula}</td>
              <td className="px-3 py-2">{m.orgao ?? '—'}</td>
              <td className="px-3 py-2">{m.ativa ? 'Ativa' : 'Inativa'}</td>
            </tr>
          ))}
        </Tabela>
        <NovaMatricula clienteId={clienteId} modo={modo} />
      </Secao>

      <Contas clienteId={clienteId} modo={modo} />
      {modo === 'equipe' && <Beneficiarios clienteId={clienteId} />}
      {modo === 'equipe' && <MensalidadesSecao clienteId={clienteId} />}
      <Documentos clienteId={clienteId} modo={modo} />
      {modo === 'equipe' ? <Historico clienteId={clienteId} /> : <MinhasPropostas clienteId={clienteId} />}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{titulo}</h3>
      {children}
    </section>
  );
}

function QuadroOQueFalta({ clienteId, matriculas }: { clienteId: string; matriculas: { id: string; nome: string }[] }) {
  const [convenioId, setConvenioId] = useState('');
  const escolhido = convenioId || matriculas[0]?.id || '';
  const falta = useConsulta(
    ['o_que_falta', clienteId, escolhido],
    () => exigir(supabase.rpc('o_que_falta', { p_cliente_id: clienteId, p_convenio_id: escolhido })),
    Boolean(escolhido),
  );
  if (!escolhido) return null;
  return (
    <div className="space-y-2">
      {matriculas.length > 1 && (
        <Selecao
          rotulo="Conferir exigências do convênio"
          vazio="—"
          value={escolhido}
          onChange={(e) => setConvenioId(e.target.value)}
          opcoes={matriculas.map((m) => ({ valor: m.id, rotulo: m.nome }))}
          className="max-w-sm"
        />
      )}
      {falta.data && <OQueFalta itens={falta.data} />}
    </div>
  );
}

function NovaMatricula({ clienteId, modo }: { clienteId: string; modo: Modo }) {
  const convenios = useConveniosOpcoes();
  const [f, setF] = useState({ convenio_id: '', vinculo_id: '', matricula: '', orgao: '' });
  const [ok, setOk] = useState('');
  const salvar = useAcao(
    () => {
      const dados = { ...f, orgao: f.orgao || null };
      return modo === 'equipe'
        ? exigir(supabase.from('cliente_matriculas').insert({ ...dados, cliente_id: clienteId }))
        : propor(clienteId, 'matricula', dados);
    },
    [['matriculas', clienteId], ['propostas', clienteId], ['historico', clienteId]],
  );
  const vinculos = convenios.data?.find((c) => c.id === f.convenio_id)?.vinculos ?? [];
  return (
    <form
      className="grid gap-2 rounded border border-slate-200 bg-white p-3 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        setOk('');
        salvar.mutate(undefined, {
          onSuccess: () => {
            setF({ convenio_id: '', vinculo_id: '', matricula: '', orgao: '' });
            setOk(modo === 'equipe' ? 'Matrícula incluída.' : 'Enviada para conferência.');
          },
        });
      }}
    >
      <Selecao
        rotulo="Convênio"
        value={f.convenio_id}
        onChange={(e) => setF({ ...f, convenio_id: e.target.value, vinculo_id: '' })}
        opcoes={(convenios.data ?? []).map((c) => ({ valor: c.id, rotulo: c.nome }))}
      />
      <Selecao rotulo="Vínculo" value={f.vinculo_id} onChange={(e) => setF({ ...f, vinculo_id: e.target.value })} opcoes={vinculos.map((v) => ({ valor: v.id, rotulo: v.nome }))} />
      <Campo rotulo="Nova matrícula" value={f.matricula} onChange={(e) => setF({ ...f, matricula: e.target.value })} />
      <Campo rotulo="Órgão" value={f.orgao} onChange={(e) => setF({ ...f, orgao: e.target.value })} />
      <div className="flex items-end">
        <Botao type="submit" disabled={!f.convenio_id || !f.vinculo_id || !f.matricula.trim()}>
          {modo === 'equipe' ? 'Incluir' : 'Enviar para conferência'}
        </Botao>
      </div>
      <div className="sm:col-span-5">
        <Aviso>{salvar.erro}</Aviso>
        <Aviso tipo="ok">{ok}</Aviso>
      </div>
    </form>
  );
}

function Contas({ clienteId, modo }: { clienteId: string; modo: Modo }) {
  const contas = useConsulta(['contas', clienteId], () =>
    exigir(supabase.from('cliente_contas').select('*, bancos(codigo, nome)').eq('cliente_id', clienteId)),
  );
  const bancos = useConsulta(['bancos'], () => exigir(supabase.from('bancos').select('id, codigo, nome').eq('ativo', true).order('codigo')));
  const principal = useAcao(
    (id: string) => exigir(supabase.rpc('definir_conta_principal_cliente', { p_conta_id: id })),
    [['contas', clienteId], ['historico', clienteId]],
  );
  const vazio = { banco_id: '', agencia: '', conta: '', tipo_conta: 'corrente', chave_pix: '', tipo_chave_pix: '' };
  const [f, setF] = useState(vazio);
  const [ok, setOk] = useState('');
  const nova = useAcao(
    () => {
      const dados = { ...f, chave_pix: f.chave_pix || null, tipo_chave_pix: f.chave_pix ? f.tipo_chave_pix || null : null };
      return modo === 'equipe'
        ? exigir(
            supabase
              .from('cliente_contas')
              .insert({ ...dados, cliente_id: clienteId, principal: (contas.data ?? []).length === 0 }),
          )
        : propor(clienteId, 'conta', dados);
    },
    [['contas', clienteId], ['propostas', clienteId], ['historico', clienteId]],
  );

  function enviar(e: FormEvent) {
    e.preventDefault();
    setOk('');
    nova.mutate(undefined, {
      onSuccess: () => (setF(vazio), setOk(modo === 'equipe' ? 'Conta incluída.' : 'Enviada para conferência.')),
    });
  }

  return (
    <Secao titulo="Contas bancárias e PIX">
      <Tabela colunas={['Banco', 'Agência / Conta', 'PIX', '']}>
        {(contas.data ?? []).map((c) => (
          <tr key={c.id}>
            <td className="px-3 py-2">{c.bancos ? `${c.bancos.codigo} — ${c.bancos.nome}` : ''}</td>
            <td className="px-3 py-2">
              {c.agencia} / {c.conta} ({c.tipo_conta})
            </td>
            <td className="px-3 py-2">{c.chave_pix ? `${c.tipo_chave_pix}: ${c.chave_pix}` : '—'}</td>
            <td className="px-3 py-2 text-right">
              {c.principal ? (
                <span className="text-xs font-medium text-green-700">Principal</span>
              ) : (
                modo === 'equipe' && (
                  <Botao variante="secundario" onClick={() => principal.mutate(c.id)}>
                    Tornar principal
                  </Botao>
                )
              )}
            </td>
          </tr>
        ))}
      </Tabela>
      <form onSubmit={enviar} className="grid gap-2 rounded border border-slate-200 bg-white p-3 sm:grid-cols-3">
        <Selecao
          rotulo="Banco"
          value={f.banco_id}
          onChange={(e) => setF({ ...f, banco_id: e.target.value })}
          opcoes={(bancos.data ?? []).map((b) => ({ valor: b.id, rotulo: `${b.codigo} — ${b.nome}` }))}
        />
        <Campo rotulo="Agência" value={f.agencia} onChange={(e) => setF({ ...f, agencia: e.target.value })} />
        <Campo rotulo="Conta" value={f.conta} onChange={(e) => setF({ ...f, conta: e.target.value })} />
        <Selecao rotulo="Tipo de conta" vazio="—" value={f.tipo_conta} onChange={(e) => setF({ ...f, tipo_conta: e.target.value })} opcoes={TIPOS_CONTA} />
        <Selecao rotulo="Tipo da chave PIX" vazio="Sem PIX" value={f.tipo_chave_pix} onChange={(e) => setF({ ...f, tipo_chave_pix: e.target.value })} opcoes={TIPOS_PIX} />
        <Campo rotulo="Chave PIX" value={f.chave_pix} onChange={(e) => setF({ ...f, chave_pix: e.target.value })} />
        <div className="space-y-2 sm:col-span-3">
          <Aviso>{nova.erro || principal.erro}</Aviso>
          <Aviso tipo="ok">{ok}</Aviso>
          <Botao type="submit" disabled={!f.banco_id || !f.agencia || !f.conta}>
            {modo === 'equipe' ? 'Incluir conta' : 'Enviar conta para conferência'}
          </Botao>
        </div>
      </form>
    </Secao>
  );
}

function Beneficiarios({ clienteId }: { clienteId: string }) {
  const lista = useConsulta(['beneficiarios', clienteId], () =>
    exigir(supabase.from('cliente_beneficiarios').select('*').eq('cliente_id', clienteId)),
  );
  const [f, setF] = useState({ nome: '', cpf: '', parentesco: '', percentual: '' });
  const novo = useAcao(
    () =>
      exigir(
        supabase.from('cliente_beneficiarios').insert({
          cliente_id: clienteId,
          nome: f.nome.trim(),
          cpf: f.cpf.replace(/\D/g, '').padStart(11, '0') === '00000000000' ? null : f.cpf.replace(/\D/g, '').padStart(11, '0'),
          parentesco: f.parentesco || null,
          percentual: f.percentual ? (f.percentual.replace(',', '.') as unknown as number) : null,
        }),
      ),
    [['beneficiarios', clienteId]],
  );
  return (
    <Secao titulo="Beneficiários">
      <Tabela colunas={['Nome', 'CPF', 'Parentesco', '%']}>
        {(lista.data ?? []).map((b) => (
          <tr key={b.id}>
            <td className="px-3 py-2">{b.nome}</td>
            <td className="px-3 py-2">{b.cpf ? formatarCpf(b.cpf) : '—'}</td>
            <td className="px-3 py-2">{b.parentesco ?? '—'}</td>
            <td className="px-3 py-2">{b.percentual ?? '—'}</td>
          </tr>
        ))}
      </Tabela>
      <form
        className="grid gap-2 rounded border border-slate-200 bg-white p-3 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          novo.mutate(undefined, { onSuccess: () => setF({ nome: '', cpf: '', parentesco: '', percentual: '' }) });
        }}
      >
        <Campo rotulo="Nome do beneficiário" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <Campo rotulo="CPF (opcional)" value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} />
        <Campo rotulo="Parentesco" value={f.parentesco} onChange={(e) => setF({ ...f, parentesco: e.target.value })} />
        <Campo rotulo="Percentual" inputMode="decimal" value={f.percentual} onChange={(e) => setF({ ...f, percentual: e.target.value })} />
        <div className="flex items-end">
          <Botao type="submit" disabled={!f.nome.trim()}>
            Incluir
          </Botao>
        </div>
        <div className="sm:col-span-5">
          <Aviso>{novo.erro}</Aviso>
        </div>
      </form>
    </Secao>
  );
}

function Documentos({ clienteId, modo }: { clienteId: string; modo: Modo }) {
  const docs = useConsulta(['documentos', clienteId], () =>
    exigir(supabase.from('cliente_documentos').select('*').eq('cliente_id', clienteId).order('enviado_em', { ascending: false })),
  );
  const [tipo, setTipo] = useState('rg');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState('');
  const enviar = useAcao(
    async () => {
      if (!arquivo) throw new Error('Escolha um arquivo.');
      const nomeSeguro = arquivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_');
      const caminho = `${clienteId}/${crypto.randomUUID()}-${nomeSeguro}`;
      await exigir(supabase.storage.from(BUCKET).upload(caminho, arquivo));
      await exigir(supabase.from('cliente_documentos').insert({ cliente_id: clienteId, tipo, caminho, nome_arquivo: arquivo.name }));
    },
    [['documentos', clienteId], ['o_que_falta', clienteId]],
  );

  async function baixar(caminho: string) {
    setErro('');
    // registra o acesso antes de gerar o link; sem registro, não abre
    const { error: erroAuditoria } = await supabase.rpc('registrar_acesso', { p_acao: 'download_documento', p_detalhe: { caminho } });
    if (erroAuditoria) return setErro('Não foi possível abrir o documento.');
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 60);
    if (error || !data) return setErro('Não foi possível abrir o documento.');
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  return (
    <Secao titulo="Documentos">
      <ul className="divide-y divide-slate-100 rounded border border-slate-200 bg-white text-sm">
        {(docs.data ?? []).map((d) => (
          <li key={d.id} className="flex items-center justify-between px-3 py-2">
            <span>
              {TIPOS_DOC.find((t) => t.valor === d.tipo)?.rotulo} · {d.nome_arquivo}
            </span>
            <Botao variante="secundario" onClick={() => baixar(d.caminho)}>
              Abrir
            </Botao>
          </li>
        ))}
        {docs.data?.length === 0 && <li className="px-3 py-2 text-slate-500">Nenhum documento.</li>}
      </ul>
      <Aviso>{erro || enviar.erro}</Aviso>
      {modo === 'equipe' && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            enviar.mutate(undefined, { onSuccess: () => setArquivo(null) });
          }}
        >
          <Selecao rotulo="Tipo de documento" vazio="—" value={tipo} onChange={(e) => setTipo(e.target.value)} opcoes={TIPOS_DOC} />
          <label className="flex flex-col gap-1 text-sm font-medium">
            Arquivo
            <input type="file" accept=".pdf,image/*" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          </label>
          <Botao type="submit" disabled={!arquivo || enviar.isPending}>
            Anexar
          </Botao>
        </form>
      )}
    </Secao>
  );
}

function Historico({ clienteId }: { clienteId: string }) {
  const hist = useConsulta(['historico', clienteId], () =>
    exigir(supabase.from('cliente_historico').select('*').eq('cliente_id', clienteId).order('id', { ascending: false }).limit(50)),
  );
  const resumo = (v: unknown) => (v ? JSON.stringify(v).replace(/[{}"]/g, '').replace(/,/g, ', ') : '—');
  return (
    <Secao titulo="Histórico de telefone, conta e matrícula">
      <Tabela colunas={['Quando', 'O quê', 'Antes', 'Depois']}>
        {(hist.data ?? []).map((h) => (
          <tr key={h.id}>
            <td className="whitespace-nowrap px-3 py-2">{new Date(h.em).toLocaleString('pt-BR')}</td>
            <td className="px-3 py-2">{h.campo}</td>
            <td className="max-w-xs truncate px-3 py-2" title={resumo(h.antes)}>
              {resumo(h.antes)}
            </td>
            <td className="max-w-xs truncate px-3 py-2" title={resumo(h.depois)}>
              {resumo(h.depois)}
            </td>
          </tr>
        ))}
      </Tabela>
    </Secao>
  );
}

function MinhasPropostas({ clienteId }: { clienteId: string }) {
  const lista = useConsulta(['propostas', clienteId], () =>
    exigir(
      supabase
        .from('cliente_alteracoes_pendentes')
        .select('id, tipo, status, motivo, criado_em')
        .eq('cliente_id', clienteId)
        .order('criado_em', { ascending: false }),
    ),
  );
  const STATUS: Record<string, string> = { pendente: 'Aguardando conferência', aprovada: 'Aprovada', recusada: 'Recusada' };
  return (
    <Secao titulo="Minhas alterações enviadas">
      <Tabela colunas={['Quando', 'Tipo', 'Situação', 'Motivo']}>
        {(lista.data ?? []).map((p) => (
          <tr key={p.id}>
            <td className="px-3 py-2">{new Date(p.criado_em).toLocaleString('pt-BR')}</td>
            <td className="px-3 py-2">{p.tipo}</td>
            <td className="px-3 py-2">{STATUS[p.status] ?? p.status}</td>
            <td className="px-3 py-2">{p.motivo ?? '—'}</td>
          </tr>
        ))}
      </Tabela>
    </Secao>
  );
}
