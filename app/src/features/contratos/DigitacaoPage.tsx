import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Aviso, Campo, Pagina, Tabela } from '../../components/ui';
import { exigir, useConsulta } from '../../lib/dados';
import { formatarCpf, soDigitos } from '../../lib/mascaras';
import { supabase } from '../../lib/supabase';
import { useSessao } from '../auth/sessao';
import { DigitacaoForm, type DadosContrato } from './DigitacaoForm';

/** Digitação (equipe), pré-digitação (parceiro) e edição de contrato. */
export function DigitacaoPage() {
  const { id } = useParams();
  const [busca] = useSearchParams();
  const { ehParceiro } = useSessao();
  const navigate = useNavigate();
  const [clienteEscolhido, setClienteEscolhido] = useState<string | null>(busca.get('cliente'));

  const existente = useConsulta(['contrato-edicao', id], async () => {
    if (!id) return null;
    const k = await exigir(supabase.from('contratos').select('*, contrato_quitacoes(contrato_quitado_id, saldo_devedor, fonte), contrato_dividas_externas(*)').eq('id', id).maybeSingle());
    return k;
  }, Boolean(id));
  const clienteId = id ? existente.data?.cliente_id ?? null : clienteEscolhido;

  const cliente = useConsulta(['dig-cliente', clienteId], async () => {
    const c = await exigir(supabase.from('clientes').select('id, nome, data_nascimento').eq('id', clienteId!).maybeSingle());
    const ms = (await exigir(
      supabase.from('cliente_matriculas').select('id, matricula, convenio_id, vinculo_id, ativa, convenios(nome)').eq('cliente_id', clienteId!),
    )) ?? [];
    const quitaveis = (await exigir(
      supabase.from('contratos').select('id, numero, valor_parcela, matricula_id').eq('cliente_id', clienteId!).in('situacao', ['ativo', 'em_atraso']),
    )) ?? [];
    return { c, ms: ms.filter((m) => m.ativa), quitaveis };
  }, Boolean(clienteId));
  const parceiros = useConsulta(['parceiros-lista'], async () =>
    ehParceiro ? [] : ((await exigir(supabase.from('parceiros').select('id, nome').eq('ativo', true).order('nome'))) ?? []),
  );
  const agentes = useConsulta(['agentes-todos'], async () =>
    (await exigir(supabase.from('agentes').select('id, nome, parceiro_id').eq('ativo', true).order('nome'))) ?? [],
  );
  const origens = useConsulta(['origens'], async () => (await exigir(supabase.from('origens').select('id, nome').eq('ativo', true).order('nome'))) ?? []);

  if (!clienteId) return <EscolherCliente parceiro={ehParceiro} onEscolher={setClienteEscolhido} />;
  if (cliente.isLoading || (id && existente.isLoading)) return <p className="text-sm">Carregando…</p>;
  if (!cliente.data?.c) return <Aviso>Cliente não encontrado.</Aviso>;
  const { c, ms, quitaveis } = cliente.data;
  const k = existente.data;

  async function simular(d: DadosContrato) {
    const m = ms.find((x) => x.id === d.matricula_id)!;
    const comum = {
      p_convenio_id: m.convenio_id, p_vinculo_id: m.vinculo_id, p_tipo: d.tipo, p_prazo: d.prazo,
      p_data_nascimento: c!.data_nascimento ?? undefined,
    };
    const r = d.modo === 'valor'
      ? await exigir(supabase.rpc('simular_por_valor', { ...comum, p_valor: d.quantia as unknown as number }))
      : await exigir(supabase.rpc('simular_por_parcela', { ...comum, p_parcela: d.quantia as unknown as number }));
    const x = r?.[0];
    if (!x) throw { code: 'P0001', message: 'Nenhuma tabela vigente atende esta simulação.' };
    return { valor: String(x.valor), parcela: String(x.parcela), valor_mensalidade: x.valor_mensalidade === null ? null : String(x.valor_mensalidade) };
  }

  async function enviar(d: DadosContrato) {
    let novoId: string | null = id ?? null;
    if (id) {
      const motivo = k?.valores_travados_em ? window.prompt('Motivo da edição (contrato já averbado):') : null;
      if (k?.valores_travados_em && !motivo?.trim()) throw { code: 'P0001', message: 'Informe o motivo da edição de um contrato já averbado.' };
      await exigir(supabase.rpc('editar_contrato', { p_id: id, p_dados: d as never, p_motivo: motivo ?? '' }));
    } else {
      novoId = await exigir(supabase.rpc(ehParceiro ? 'pre_digitar_contrato' : 'digitar_contrato', { p_dados: d as never }));
    }
    navigate(`/contratos/${novoId}`);
  }

  return (
    <Pagina titulo={id ? `Editar contrato nº ${k?.numero ?? ''}` : ehParceiro ? 'Pré-digitação' : 'Digitar contrato'}>
      {ms.length === 0 && <Aviso>O cliente não tem matrícula ativa. Inclua uma matrícula no cadastro antes.</Aviso>}
      <DigitacaoForm
        modo={ehParceiro ? 'parceiro' : 'equipe'}
        cliente={{ id: c.id, nome: c.nome, matriculas: ms.map((m) => ({ id: m.id, rotulo: `${m.convenios?.nome ?? ''} · ${m.matricula}` })) }}
        contratosQuitaveis={quitaveis.filter((q) => q.id !== id).map((q) => ({ ...q, valor_parcela: String(q.valor_parcela) }))}
        parceiros={parceiros.data ?? []}
        agentes={agentes.data ?? []}
        origens={origens.data ?? []}
        inicial={
          k
            ? {
                matricula_id: k.matricula_id, tipo: k.tipo, prazo: k.prazo, modo: 'valor', quantia: String(k.valor_bruto),
                parceiro_id: k.parceiro_id, agente_id: k.agente_id, origem_id: k.origem_id,
                quitacoes: k.contrato_quitacoes.map((q) => ({ contrato_quitado_id: q.contrato_quitado_id, saldo_devedor: String(q.saldo_devedor), fonte: q.fonte as 'calculo' })),
                dividas_externas: k.contrato_dividas_externas.map((x) => ({
                  credor: x.credor, numero_contrato_externo: x.numero_contrato_externo ?? '', saldo: String(x.saldo), favorecido: x.favorecido ?? '',
                })),
              }
            : undefined
        }
        rotuloEnviar={id ? 'Salvar alterações' : undefined}
        onSimular={simular}
        onEnviar={enviar}
      />
    </Pagina>
  );
}

function EscolherCliente({ parceiro, onEscolher }: { parceiro: boolean; onEscolher: (id: string) => void }) {
  const [termo, setTermo] = useState('');
  const t = termo.trim();
  const lista = useConsulta(['dig-busca', t], async () => {
    let q = supabase.from('clientes').select('id, nome, cpf').order('nome').limit(30);
    const dig = soDigitos(t);
    if (t) q = dig.length >= 3 && dig.length === t.replace(/[.\-\s]/g, '').length ? q.like('cpf', `%${dig}%`) : q.ilike('nome', `%${t}%`);
    return (await exigir(q)) ?? [];
  });
  return (
    <Pagina titulo={parceiro ? 'Pré-digitação' : 'Digitar contrato'}>
      <p className="text-sm">
        Escolha o cliente.{' '}
        {parceiro ? (
          <>Se ele não aparece, busque por CPF e matrícula em <Link to="/parceiro/clientes" className="text-sky-800 underline">Meus clientes</Link>.</>
        ) : (
          <>Para cliente novo, cadastre em <Link to="/clientes" className="text-sky-800 underline">Clientes</Link>.</>
        )}
      </p>
      <Campo rotulo="Buscar por nome ou CPF" value={termo} onChange={(e) => setTermo(e.target.value)} className="max-w-md" />
      <Tabela colunas={['Nome', 'CPF', '']}>
        {(lista.data ?? []).map((c) => (
          <tr key={c.id}>
            <td className="px-3 py-1.5">{c.nome}</td>
            <td className="px-3 py-1.5">{formatarCpf(c.cpf)}</td>
            <td className="px-3 py-1.5 text-right">
              <button type="button" className="text-sky-800 hover:underline" onClick={() => onEscolher(c.id)}>
                Escolher
              </button>
            </td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
