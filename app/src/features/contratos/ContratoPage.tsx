import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Aviso, Botao, Campo, Pagina, Selecao, Tabela } from '../../components/ui';
import { ROTULO_FASE, ROTULO_SITUACAO, type Fase } from '../../lib/contratos';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { formatarCpf, formatarReais } from '../../lib/mascaras';
import { supabase } from '../../lib/supabase';
import { useSessao } from '../auth/sessao';
import { AcoesFase } from '../esteira/AcoesFase';
import { AdeCampo } from './AdeCampo';
import { ParcelasTabela } from './ParcelasTabela';

const SITUACAO_AVERBACAO: Record<string, string> = {
  proposta: 'Proposta', ativa: 'Ativa', substituida: 'Substituída', migrada: 'Migrada',
  cancelamento_pendente: 'Cancelar na averbadora', cancelada: 'Cancelada',
};

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-medium">{titulo}</h2>
      {children}
    </section>
  );
}

function Valor({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}

export function ContratoPage() {
  const { id = '' } = useParams();
  const { pode, ehParceiro } = useSessao();
  const chave = ['contrato', id];
  const todas = [chave, ['esteira']];
  const contrato = useConsulta(chave, () =>
    exigir(
      supabase
        .from('contratos')
        .select('*, clientes(nome, cpf), convenios(nome, ade_modo, ade_descricao), parceiros(nome), cliente_matriculas(matricula)')
        .eq('id', id)
        .maybeSingle(),
    ),
  );
  const matriz = useConsulta(['fase_transicoes'], async () => (await exigir(supabase.from('fase_transicoes').select('de, para, permissao'))) ?? []);
  const averbacoes = useConsulta(['averbacoes', id], async () =>
    (await exigir(supabase.from('contrato_averbacoes').select('id, ade, situacao, valor_averbado, criado_em').eq('contrato_id', id).order('criado_em'))) ?? [],
  );
  const averbMensalidade = useConsulta(['averb-mensalidade', id], async () =>
    ehParceiro ? [] : ((await exigir(supabase.from('mensalidade_averbacoes').select('id, ade, situacao, valor_averbado').eq('contrato_origem_id', id))) ?? []),
  );
  const parcelas = useConsulta(['parcelas', id], async () =>
    (await exigir(supabase.from('parcelas').select('id, numero, competencia, vencimento, valor, status').eq('contrato_id', id).order('numero'))) ?? [],
  );
  const quitacoes = useConsulta(['quitacoes', id], async () =>
    (await exigir(supabase.from('contrato_quitacoes').select('id, saldo_devedor, fonte, contrato_quitado_id').eq('contrato_id', id))) ?? [],
  );
  const dividas = useConsulta(['dividas', id], async () =>
    (await exigir(supabase.from('contrato_dividas_externas').select('*').eq('contrato_id', id))) ?? [],
  );
  const eventos = useConsulta(['eventos', id], async () =>
    (await exigir(supabase.from('contrato_eventos').select('*').eq('contrato_id', id).order('id', { ascending: false }))) ?? [],
  );
  const versoes = useConsulta(['versoes', id], async () =>
    ehParceiro ? [] : ((await exigir(supabase.from('contrato_versoes').select('versao, motivo, criado_em').eq('contrato_id', id).order('versao'))) ?? []),
  );

  const invalidar = [...todas, ['averbacoes', id], ['averb-mensalidade', id], ['parcelas', id], ['eventos', id], ['versoes', id], ['quitacoes', id]];
  const mover = useAcao(
    ({ para, motivo }: { para: Fase; motivo: string | null }) =>
      exigir(supabase.rpc('mover_contrato', { p_id: id, p_para: para, p_motivo: motivo ?? undefined })),
    invalidar,
  );
  const [diferenca, setDiferenca] = useState<{ antes: Record<string, number>; depois: Record<string, number> } | null>(null);
  const aprovar = useAcao(async () => {
    const r = (await exigir(supabase.rpc('aprovar_pre_digitacao', { p_id: id }))) as { mudou: boolean; antes?: Record<string, number>; depois?: Record<string, number> };
    setDiferenca(r.mudou && r.antes && r.depois ? { antes: r.antes, depois: r.depois } : null);
  }, invalidar);
  const confirmar = useAcao(() => exigir(supabase.rpc('confirmar_aprovacao', { p_id: id })), invalidar);
  const [recado, setRecado] = useState('');
  const devolver = useAcao(() => exigir(supabase.rpc('devolver_pre_digitacao', { p_id: id, p_motivo: recado })), invalidar);
  const ade = useAcao(
    ({ ade, conf }: { ade: string; conf: string | null }) =>
      exigir(supabase.rpc('registrar_ade', { p_contrato_id: id, p_ade: ade, p_confirmacao: conf ?? undefined })),
    invalidar,
  );
  const adeMens = useAcao(
    ({ ade, conf }: { ade: string; conf: string | null }) =>
      exigir(supabase.rpc('registrar_ade_mensalidade', { p_contrato_id: id, p_ade: ade, p_confirmacao: conf ?? undefined })),
    invalidar,
  );
  const [dataLiberacao, setDataLiberacao] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const liberar = useAcao(() => exigir(supabase.rpc('liberar_credito', { p_id: id, p_data: dataLiberacao })), invalidar);
  const [encerramento, setEncerramento] = useState({ tipo: '', motivo: '' });
  const encerrar = useAcao(
    () => exigir(supabase.rpc('encerrar_contrato', { p_id: id, p_tipo: encerramento.tipo, p_motivo: encerramento.motivo })),
    invalidar,
  );

  if (contrato.isLoading) return <p className="text-sm">Carregando…</p>;
  const k = contrato.data;
  if (!k) return <Aviso>Contrato não encontrado.</Aviso>;
  const temAdeAtivo = (averbacoes.data ?? []).some((a) => a.situacao === 'ativa');
  const temAdeMensalidade = (averbMensalidade.data ?? []).some((a) => a.situacao === 'proposta');
  const modoAde = (k.convenios?.ade_modo ?? 'seguro') as 'seguro' | 'rapido';
  const erro = mover.erro || aprovar.erro || confirmar.erro || devolver.erro || ade.erro || adeMens.erro || liberar.erro || encerrar.erro;
  const editavel = !['credito_liberado', 'recusado', 'cancelado'].includes(k.fase) &&
    (ehParceiro ? k.fase === 'pre_digitacao' : k.valores_travados_em ? pode('contratos.editar_averbado') : pode('contratos.digitar'));

  return (
    <Pagina
      titulo={`Contrato nº ${k.numero}`}
      acoes={
        <div className="flex gap-3 text-sm">
          {editavel && <Link to={`/contratos/${id}/editar`} className="text-sky-800 hover:underline">Editar</Link>}
          <Link to={ehParceiro ? '/parceiro/contratos' : '/esteira'} className="text-sky-800 hover:underline">← Voltar</Link>
        </div>
      }
    >
      <dl className="grid gap-3 rounded border border-slate-200 bg-white p-4 text-sm sm:grid-cols-4">
        <Valor rotulo="Cliente" valor={<>{k.clientes?.nome} <span className="text-slate-500">{k.clientes ? formatarCpf(k.clientes.cpf) : ''}</span></>} />
        <Valor rotulo="Convênio / matrícula" valor={`${k.convenios?.nome ?? ''} · ${k.cliente_matriculas?.matricula ?? ''}`} />
        <Valor rotulo="Fase" valor={ROTULO_FASE[k.fase]} />
        <Valor rotulo="Situação" valor={ROTULO_SITUACAO[k.situacao]} />
        <Valor rotulo="Tipo" valor={k.tipo} />
        <Valor rotulo="Parceiro" valor={k.parceiros?.nome ?? 'Da casa'} />
        <Valor rotulo="Prazo / fator" valor={`${k.prazo}x · ${Number(k.fator).toLocaleString('pt-BR', { maximumFractionDigits: 8 })}`} />
        <Valor rotulo="Parcela" valor={formatarReais(k.valor_parcela)} />
        <Valor rotulo="Bruto" valor={formatarReais(k.valor_bruto)} />
        <Valor rotulo="Descontos" valor={formatarReais(k.total_descontos)} />
        <Valor rotulo="Quitações + dívidas" valor={formatarReais(Number(k.total_quitado) + Number(k.total_dividas_externas))} />
        <Valor rotulo="Líquido ao cliente" valor={formatarReais(k.valor_liquido ?? 0)} />
        <Valor rotulo="Mensalidade da tabela" valor={k.valor_mensalidade_tabela ? formatarReais(k.valor_mensalidade_tabela) : '—'} />
        <Valor rotulo="Mensalidade proposta" valor={k.mensalidade_proposta ? formatarReais(k.mensalidade_proposta) : 'sem alteração'} />
        <Valor rotulo="Liberado em" valor={k.data_liberacao ? new Date(`${k.data_liberacao}T12:00:00`).toLocaleDateString('pt-BR') : '—'} />
        <Valor rotulo="Versão" valor={k.versao} />
      </dl>

      <Aviso>{erro}</Aviso>

      {!ehParceiro && k.fase === 'pre_digitacao' && pode('contratos.mover') && (
        <Secao titulo="Pré-digitação do parceiro">
          {diferenca ? (
            <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              <p>A tabela mudou desde a digitação do parceiro:</p>
              <p>
                Parcela {formatarReais(diferenca.antes.valor_parcela)} → <strong>{formatarReais(diferenca.depois.valor_parcela)}</strong> · fator{' '}
                {diferenca.antes.fator} → <strong>{diferenca.depois.fator}</strong>
              </p>
              <Botao onClick={() => confirmar.mutate(undefined, { onSuccess: () => setDiferenca(null) })}>Aprovar com os valores novos</Botao>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <Botao onClick={() => aprovar.mutate(undefined)}>Aprovar pré-digitação</Botao>
              <Campo rotulo="Recado ao parceiro" value={recado} onChange={(e) => setRecado(e.target.value)} className="flex-1" />
              <Botao variante="secundario" disabled={!recado.trim()} onClick={() => devolver.mutate(undefined, { onSuccess: () => setRecado('') })}>
                Devolver ao parceiro
              </Botao>
            </div>
          )}
        </Secao>
      )}

      {!ehParceiro && (
        <AcoesFase fase={k.fase} faseRetorno={k.fase_retorno} matriz={matriz.data ?? []} pode={pode}
          onMover={(para, motivo) => mover.mutate({ para, motivo })} />
      )}

      <Secao titulo="Averbação">
        <Tabela colunas={['ADE', 'Valor averbado', 'Situação', 'Desde']}>
          {(averbacoes.data ?? []).map((a) => (
            <tr key={a.id}>
              <td className="px-3 py-1.5">{a.ade}</td>
              <td className="px-3 py-1.5">{formatarReais(a.valor_averbado)}</td>
              <td className="px-3 py-1.5">{SITUACAO_AVERBACAO[a.situacao] ?? a.situacao}</td>
              <td className="px-3 py-1.5">{new Date(a.criado_em).toLocaleDateString('pt-BR')}</td>
            </tr>
          ))}
        </Tabela>
        {!ehParceiro && k.fase === 'em_averbacao' && pode('contratos.mover') && (
          <div className="space-y-3 rounded border border-slate-200 bg-white p-3">
            {!temAdeAtivo && (
              <div>
                <p className="mb-1 text-sm font-medium">ADE do contrato ({modoAde === 'seguro' ? 'digite duas vezes' : 'pode colar'})</p>
                <AdeCampo modo={modoAde} descricao={k.convenios?.ade_descricao} onConfirmar={(a, c) => ade.mutateAsync({ ade: a, conf: c })} />
              </div>
            )}
            {k.mensalidade_proposta && !temAdeMensalidade && (
              <div>
                <p className="mb-1 text-sm font-medium">ADE da mensalidade ({formatarReais(k.mensalidade_proposta)})</p>
                <AdeCampo modo={modoAde} descricao={k.convenios?.ade_descricao} rotuloBotao="Registrar ADE da mensalidade"
                  onConfirmar={(a, c) => adeMens.mutateAsync({ ade: a, conf: c })} />
              </div>
            )}
          </div>
        )}
        {(averbMensalidade.data ?? []).length > 0 && (
          <p className="text-sm text-slate-600">
            Mensalidade:{' '}
            {(averbMensalidade.data ?? []).map((a) => `ADE ${a.ade} (${formatarReais(a.valor_averbado)}, ${SITUACAO_AVERBACAO[a.situacao]})`).join(' · ')}
          </p>
        )}
      </Secao>

      {!ehParceiro && k.fase === 'aguardando_pagamento' && pode('contratos.liberar') && (
        <Secao titulo="Liberar crédito">
          <div className="flex flex-wrap items-end gap-2 rounded border border-green-300 bg-green-50 p-3">
            <Campo rotulo="Data da liberação" type="date" value={dataLiberacao} onChange={(e) => setDataLiberacao(e.target.value)} />
            <Botao
              disabled={liberar.isPending}
              onClick={() => confirm(`Liberar ${formatarReais(k.valor_liquido ?? 0)} ao cliente? As parcelas serão criadas.`) && liberar.mutate(undefined)}
            >
              Liberar crédito
            </Botao>
          </div>
        </Secao>
      )}

      {!ehParceiro && ['ativo', 'em_atraso'].includes(k.situacao) && pode('contratos.encerrar') && (
        <Secao titulo="Encerrar contrato">
          <div className="flex flex-wrap items-end gap-2">
            <Selecao rotulo="Tipo" value={encerramento.tipo} onChange={(e) => setEncerramento({ ...encerramento, tipo: e.target.value })}
              opcoes={[{ valor: 'quitado', rotulo: 'Quitação' }, { valor: 'cancelado', rotulo: 'Cancelamento' }, { valor: 'prejuizo', rotulo: 'Prejuízo' }]} />
            <Campo rotulo="Motivo" value={encerramento.motivo} onChange={(e) => setEncerramento({ ...encerramento, motivo: e.target.value })} className="flex-1" />
            <Botao variante="perigo" disabled={!encerramento.tipo || !encerramento.motivo.trim()}
              onClick={() => confirm('Encerrar este contrato?') && encerrar.mutate(undefined)}>
              Encerrar
            </Botao>
          </div>
        </Secao>
      )}

      <Secao titulo="Parcelas">
        <ParcelasTabela parcelas={parcelas.data ?? []} />
      </Secao>

      {((quitacoes.data ?? []).length > 0 || (dividas.data ?? []).length > 0) && (
        <Secao titulo="Quitações e dívidas">
          <ul className="space-y-1 text-sm">
            {(quitacoes.data ?? []).map((q) => (
              <li key={q.id}>
                Quita o <Link to={`/contratos/${q.contrato_quitado_id}`} className="text-sky-800 hover:underline">contrato anterior</Link>: saldo{' '}
                {formatarReais(q.saldo_devedor)} ({q.fonte})
              </li>
            ))}
            {(dividas.data ?? []).map((d) => (
              <li key={d.id}>
                Dívida em {d.credor} {d.numero_contrato_externo ? `(nº ${d.numero_contrato_externo})` : ''}: {formatarReais(d.saldo)}
                {d.favorecido ? ` → pagar a ${d.favorecido}` : ''}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <Secao titulo="Histórico">
        <Tabela colunas={['Quando', 'De', 'Para', 'Motivo']}>
          {(eventos.data ?? []).map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap px-3 py-1.5">{new Date(e.em).toLocaleString('pt-BR')}</td>
              <td className="px-3 py-1.5">{e.de ? ROTULO_FASE[e.de] : '—'}</td>
              <td className="px-3 py-1.5">{e.para ? ROTULO_FASE[e.para] : e.situacao_para ? ROTULO_SITUACAO[e.situacao_para] : '—'}</td>
              <td className="px-3 py-1.5">{e.motivo ?? '—'}</td>
            </tr>
          ))}
        </Tabela>
      </Secao>

      {!ehParceiro && (versoes.data ?? []).length > 1 && (
        <Secao titulo="Versões">
          <ul className="text-sm">
            {(versoes.data ?? []).map((v) => (
              <li key={v.versao}>
                Versão {v.versao} · {new Date(v.criado_em).toLocaleString('pt-BR')} {v.motivo ? `· ${v.motivo}` : ''}
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </Pagina>
  );
}
