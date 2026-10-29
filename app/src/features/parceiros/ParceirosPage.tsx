import { useState, type FormEvent } from 'react';
import { Aviso, Botao, Campo, Pagina, Selecao, Tabela } from '../../components/ui';
import type { TablesInsert } from '../../lib/database.types';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { mensagemErro } from '../../lib/erros';
import { formatarCelular } from '../../lib/mascaras';
import { TIPOS_CONTA, TIPOS_PIX } from '../../lib/opcoes';
import { supabase } from '../../lib/supabase';
import { useSessao } from '../auth/sessao';
import { ParceiroForm, type DadosParceiro } from './ParceiroForm';


export function ParceirosPage() {
  const { pode } = useSessao();
  const podeEditar = pode('parceiros.editar');
  const [selecionado, setSelecionado] = useState<string | 'novo' | null>(null);
  const lista = useConsulta(['parceiros'], () =>
    exigir(supabase.from('parceiros').select('*').order('nome')),
  );
  const salvar = useAcao(async (d: DadosParceiro) => {
    if (selecionado && selecionado !== 'novo') {
      await exigir(supabase.from('parceiros').update(d).eq('id', selecionado));
    } else {
      const novo = await exigir(supabase.from('parceiros').insert(d).select('id').single());
      if (novo) setSelecionado(novo.id);
    }
  }, [['parceiros'], ['parceiros-lista']]);

  const atual = lista.data?.find((p) => p.id === selecionado);

  return (
    <Pagina
      titulo="Parceiros"
      acoes={podeEditar && <Botao onClick={() => setSelecionado('novo')}>Novo parceiro</Botao>}
    >
      <Tabela colunas={['Nome', 'Documento', 'WhatsApp', 'Recebe mensalidades', 'Situação']}>
        {(lista.data ?? []).map((p) => (
          <tr
            key={p.id}
            className={`cursor-pointer hover:bg-slate-50 ${p.id === selecionado ? 'bg-sky-50' : ''}`}
            onClick={() => setSelecionado(p.id)}
          >
            <td className="px-3 py-2">{p.nome}</td>
            <td className="px-3 py-2">{p.documento}</td>
            <td className="px-3 py-2">{formatarCelular(p.whatsapp)}</td>
            <td className="px-3 py-2">{p.recebe_mensalidades ? 'Sim' : 'Não'}</td>
            <td className="px-3 py-2">{p.ativo ? 'Ativo' : 'Inativo'}</td>
          </tr>
        ))}
      </Tabela>

      {selecionado && podeEditar && (
        <div className="space-y-2">
          <h2 className="font-medium">{selecionado === 'novo' ? 'Novo parceiro' : `Editar: ${atual?.nome ?? ''}`}</h2>
          <ParceiroForm
            key={selecionado}
            inicial={atual && { ...atual, tipo_pessoa: atual.tipo_pessoa as DadosParceiro['tipo_pessoa'] }}
            onSalvar={async (d) => {
              await salvar.mutateAsync(d).catch((e) => {
                throw new Error(mensagemErro(e));
              });
            }}
          />
        </div>
      )}

      {atual && <ContasEAgentes parceiroId={atual.id} podeEditar={podeEditar} />}
    </Pagina>
  );
}

function ContasEAgentes({ parceiroId, podeEditar }: { parceiroId: string; podeEditar: boolean }) {
  const contas = useConsulta(['parceiro_contas', parceiroId], () =>
    exigir(supabase.from('parceiro_contas').select('*, bancos(codigo, nome)').eq('parceiro_id', parceiroId)),
  );
  const agentes = useConsulta(['agentes', parceiroId], () =>
    exigir(supabase.from('agentes').select('*').eq('parceiro_id', parceiroId).order('nome')),
  );
  const bancos = useConsulta(['bancos'], () => exigir(supabase.from('bancos').select('id, codigo, nome').order('codigo')));
  const principal = useAcao(
    (id: string) => exigir(supabase.rpc('definir_conta_principal', { p_conta_id: id })),
    [['parceiro_contas', parceiroId]],
  );
  const novaConta = useAcao(
    (c: Omit<TablesInsert<'parceiro_contas'>, 'parceiro_id'>) =>
      exigir(supabase.from('parceiro_contas').insert({ ...c, parceiro_id: parceiroId })),
    [['parceiro_contas', parceiroId]],
  );
  const novoAgente = useAcao(
    (nome: string) => exigir(supabase.from('agentes').insert({ parceiro_id: parceiroId, nome })),
    [['agentes', parceiroId]],
  );
  const [conta, setConta] = useState({ banco_id: '', agencia: '', conta: '', tipo_conta: 'corrente', chave_pix: '', tipo_chave_pix: '' });
  const [agente, setAgente] = useState('');

  function adicionarConta(e: FormEvent) {
    e.preventDefault();
    novaConta.mutate({
      ...conta,
      chave_pix: conta.chave_pix || null,
      tipo_chave_pix: conta.chave_pix ? conta.tipo_chave_pix || null : null,
      principal: (contas.data ?? []).length === 0,
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <h2 className="font-medium">Contas e PIX</h2>
        <Tabela colunas={['Banco', 'Agência / Conta', 'PIX', '']}>
          {(contas.data ?? []).map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-2">{(c.bancos as { codigo: string; nome: string } | null)?.nome}</td>
              <td className="px-3 py-2">
                {c.agencia} / {c.conta} ({c.tipo_conta})
              </td>
              <td className="px-3 py-2">{c.chave_pix ? `${c.tipo_chave_pix}: ${c.chave_pix}` : '—'}</td>
              <td className="px-3 py-2 text-right">
                {c.principal ? (
                  <span className="text-xs font-medium text-green-700">Principal</span>
                ) : (
                  podeEditar && (
                    <Botao variante="secundario" onClick={() => principal.mutate(c.id)}>
                      Tornar principal
                    </Botao>
                  )
                )}
              </td>
            </tr>
          ))}
        </Tabela>
        <Aviso>{principal.erro || novaConta.erro}</Aviso>
        {podeEditar && (
          <form onSubmit={adicionarConta} className="grid gap-2 rounded border border-slate-200 bg-white p-3 sm:grid-cols-3">
            <Selecao
              rotulo="Banco"
              value={conta.banco_id}
              onChange={(e) => setConta({ ...conta, banco_id: e.target.value })}
              opcoes={(bancos.data ?? []).map((b) => ({ valor: b.id, rotulo: `${b.codigo} — ${b.nome}` }))}
            />
            <Campo rotulo="Agência" value={conta.agencia} onChange={(e) => setConta({ ...conta, agencia: e.target.value })} />
            <Campo rotulo="Conta" value={conta.conta} onChange={(e) => setConta({ ...conta, conta: e.target.value })} />
            <Selecao
              rotulo="Tipo"
              vazio="—"
              value={conta.tipo_conta}
              onChange={(e) => setConta({ ...conta, tipo_conta: e.target.value })}
              opcoes={TIPOS_CONTA}
            />
            <Selecao
              rotulo="Tipo da chave PIX"
              vazio="Sem PIX"
              value={conta.tipo_chave_pix}
              onChange={(e) => setConta({ ...conta, tipo_chave_pix: e.target.value })}
              opcoes={TIPOS_PIX}
            />
            <Campo rotulo="Chave PIX" value={conta.chave_pix} onChange={(e) => setConta({ ...conta, chave_pix: e.target.value })} />
            <div className="sm:col-span-3">
              <Botao type="submit" disabled={!conta.banco_id || !conta.agencia || !conta.conta}>
                Adicionar conta
              </Botao>
            </div>
          </form>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="font-medium">Agentes</h2>
        <ul className="divide-y divide-slate-100 rounded border border-slate-200 bg-white text-sm">
          {(agentes.data ?? []).map((a) => (
            <li key={a.id} className="px-3 py-2">
              {a.nome} {!a.ativo && <span className="text-slate-500">(inativo)</span>}
            </li>
          ))}
          {agentes.data?.length === 0 && <li className="px-3 py-2 text-slate-500">Nenhum agente.</li>}
        </ul>
        <Aviso>{novoAgente.erro}</Aviso>
        {podeEditar && (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (agente.trim()) novoAgente.mutate(agente.trim(), { onSuccess: () => setAgente('') });
            }}
          >
            <Campo rotulo="Nome do agente" value={agente} onChange={(e) => setAgente(e.target.value)} className="flex-1" />
            <Botao type="submit">Adicionar</Botao>
          </form>
        )}
      </div>
    </div>
  );
}
