import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Aviso, Pagina } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { supabase } from '../../lib/supabase';
import { useSessao } from '../auth/sessao';
import { DialogoMotivo } from './DialogoMotivo';
import { SITUACOES, competenciaBr, dataHoraBr, reais, rotuloProduto, rotuloTipo, type Produto, type ResumoRetorno } from './comum';
import { TabelaLinhasRetorno, type LinhaDetalhe } from './TabelaLinhasRetorno';
import { VincularLinha, type Destino } from './VincularLinha';

const TAMANHO = 1000;
const SEM_PARCELA = null as unknown as string;

export function RetornoDetalhePage() {
  const { id = '' } = useParams();
  const { pode } = useSessao();
  const podeTratar = pode('retorno.importar');
  const [vincular, setVincular] = useState<LinhaDetalhe | null>(null);
  const [ignorar, setIgnorar] = useState<LinhaDetalhe | null>(null);

  const cab = useConsulta(['retorno', id, 'cabecalho'], () =>
    exigir(supabase.from('retornos')
      .select('id, competencia, produto, tipo, arquivo_nome, resumo, criado_em, situacao, motivo_desfazer, convenios(nome)')
      .eq('id', id).single()),
  );
  const linhas = useConsulta(['retorno', id, 'linhas'], async (): Promise<LinhaDetalhe[]> => {
    const todas: LinhaDetalhe[] = [];
    for (let de = 0; ; de += TAMANHO) {
      const lote = (await exigir(
        supabase.from('retorno_linhas')
          .select('id, linha, ade, nome, cpf, valor, valor_aplicado, situacao, motivo, tratamento, tratamento_motivo, sugestao_contrato_id, sugestao_mensalidade_id')
          .eq('retorno_id', id).order('linha').range(de, de + TAMANHO - 1),
      )) ?? [];
      todas.push(...lote);
      if (lote.length < TAMANHO) return todas;
    }
  });
  const produto = (cab.data?.produto ?? 'parcelas') as Produto;

  const sugestaoId = vincular?.sugestao_contrato_id ?? null;
  const sugestao = useConsulta(['retorno-sugestao', sugestaoId], async () => {
    const c = await exigir(supabase.from('contratos').select('numero').eq('id', sugestaoId!).single());
    return c?.numero ?? null;
  }, Boolean(sugestaoId) && produto === 'parcelas');
  const sugestaoTexto = !vincular ? null
    : produto === 'parcelas'
      ? (sugestao.data ? `contrato nº ${sugestao.data}` : null)
      : (vincular.sugestao_mensalidade_id ? 'a mensalidade sugerida pelo sistema' : null);

  const invalidar = [['retorno', id], ['retornos'], ['diferencas'], ['adimplencia']];
  const vincularAcao = useAcao(
    async ({ linha, destino, motivo }: { linha: LinhaDetalhe; destino: Destino; motivo: string }) => {
      let destinoId: string | null;
      if (destino.tipo === 'sugestao') {
        destinoId = produto === 'parcelas' ? linha.sugestao_contrato_id : linha.sugestao_mensalidade_id;
      } else {
        const c = await exigir(supabase.from('contratos').select('id').eq('numero', destino.numero).maybeSingle());
        if (!c) throw { code: 'P0001', message: `Não existe contrato com o número ${destino.numero}.` };
        destinoId = c.id;
      }
      if (!destinoId) throw { code: 'P0001', message: 'Não há para onde vincular esta linha.' };
      return exigir(supabase.rpc('retorno_vincular_linha', {
        p_linha_id: linha.id, p_destino_id: destinoId, p_parcela_id: SEM_PARCELA, p_motivo: motivo,
      }));
    },
    invalidar,
  );
  const ignorarAcao = useAcao(
    ({ linha, motivo }: { linha: LinhaDetalhe; motivo: string }) =>
      exigir(supabase.rpc('retorno_ignorar_linha', { p_linha_id: linha.id, p_motivo: motivo })),
    invalidar,
  );

  const r = cab.data;
  const resumo = (r?.resumo ?? {}) as unknown as ResumoRetorno;
  const gravado = r?.situacao === 'gravado';
  return (
    <Pagina titulo={r ? `Retorno de ${r.convenios?.nome ?? ''} · ${competenciaBr(r.competencia)}` : 'Retorno'}>
      <p className="text-sm"><Link to="/retornos" className="text-sky-800 hover:underline">Voltar para os retornos</Link></p>
      <Aviso>{cab.error || linhas.error ? 'Não foi possível carregar este retorno.' : ''}</Aviso>
      {r && (
        <div className="space-y-2 rounded border border-slate-200 bg-white p-3 text-sm">
          <p>
            {rotuloProduto(r.produto)} · {rotuloTipo(r.tipo)} · arquivo {r.arquivo_nome} · gravado em {dataHoraBr(r.criado_em)} ·{' '}
            <strong>{gravado ? 'Gravado' : 'Desfeito'}</strong>
          </p>
          {r.motivo_desfazer && <p>Motivo de ter desfeito: {r.motivo_desfazer}</p>}
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {SITUACOES.filter((s) => resumo[s.valor]).map((s) => (
              <li key={s.valor}>{s.rotulo}: {resumo[s.valor].qtd} · {reais(resumo[s.valor].soma)}</li>
            ))}
          </ul>
          {!gravado && <Aviso tipo="info">Este retorno foi desfeito. As linhas ficam só para consulta.</Aviso>}
        </div>
      )}
      {vincular && (
        <VincularLinha
          produto={produto}
          sugestao={sugestaoTexto}
          erro={vincularAcao.erro}
          ocupado={vincularAcao.isPending}
          onCancelar={() => setVincular(null)}
          onConfirmar={(destino, motivo) => vincularAcao.mutate({ linha: vincular, destino, motivo }, { onSuccess: () => setVincular(null) })}
        />
      )}
      {ignorar && (
        <DialogoMotivo
          titulo={ignorar.situacao === 'duplicada' || ignorar.situacao === 'nao_descontada' ? 'Marcar linha como vista' : 'Ignorar linha'}
          explicacao="Nada é lançado. Depois disso a linha não muda mais."
          rotuloConfirmar="Confirmar"
          erro={ignorarAcao.erro}
          ocupado={ignorarAcao.isPending}
          onCancelar={() => setIgnorar(null)}
          onConfirmar={(motivo) => ignorarAcao.mutate({ linha: ignorar, motivo }, { onSuccess: () => setIgnorar(null) })}
        />
      )}
      <TabelaLinhasRetorno
        linhas={linhas.data ?? []}
        retornoGravado={gravado}
        arquivoDeDescontados={r?.tipo === 'descontados'}
        podeTratar={podeTratar}
        onVincular={(l) => { vincularAcao.reset(); setVincular(l); }}
        onIgnorar={(l) => { ignorarAcao.reset(); setIgnorar(l); }}
      />
    </Pagina>
  );
}
