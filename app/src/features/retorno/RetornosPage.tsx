import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Aviso, Botao, Pagina, Tabela } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { supabase } from '../../lib/supabase';
import { useSessao } from '../auth/sessao';
import { DialogoMotivo } from './DialogoMotivo';
import { competenciaBr, dataHoraBr, reais, rotuloProduto, rotuloTipo, totaisDoResumo, type ResumoRetorno } from './comum';

export interface ItemRetorno {
  id: string;
  convenio: string;
  competencia: string;
  produto: string;
  tipo: string;
  arquivo_nome: string;
  resumo: ResumoRetorno;
  quem: string;
  criado_em: string;
  situacao: string;
}


const SITUACAO_RETORNO: Record<string, string> = { gravado: 'Gravado', desfeito: 'Desfeito' };

export function ListaRetornos({ itens, podeDesfazer, onDesfazer }: {
  itens: ItemRetorno[];
  podeDesfazer: boolean;
  onDesfazer: (r: ItemRetorno) => void;
}) {
  if (itens.length === 0) return <p className="text-sm text-slate-500">Nenhum retorno importado ainda.</p>;
  return (
    <Tabela colunas={['Convênio', 'Competência', 'Produto', 'Tipo', 'Arquivo', 'Linhas', 'Total', 'Quem / quando', 'Situação', 'Ações']}>
      {itens.map((r) => {
        const t = totaisDoResumo(r.resumo);
        return (
          <tr key={r.id}>
            <td className="px-3 py-1.5">{r.convenio}</td>
            <td className="px-3 py-1.5">{competenciaBr(r.competencia)}</td>
            <td className="px-3 py-1.5">{rotuloProduto(r.produto)}</td>
            <td className="px-3 py-1.5">{rotuloTipo(r.tipo)}</td>
            <td className="px-3 py-1.5">{r.arquivo_nome}</td>
            <td className="px-3 py-1.5">{t.qtd}</td>
            <td className="px-3 py-1.5">{reais(t.soma)}</td>
            <td className="px-3 py-1.5">{r.quem || '—'} · {dataHoraBr(r.criado_em)}</td>
            <td className="px-3 py-1.5">{SITUACAO_RETORNO[r.situacao] ?? r.situacao}</td>
            <td className="flex gap-1 px-3 py-1.5">
              <Link to={`/retornos/${r.id}`} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">Ver</Link>
              {podeDesfazer && r.situacao === 'gravado' && (
                <Botao variante="secundario" onClick={() => onDesfazer(r)}>Desfazer</Botao>
              )}
            </td>
          </tr>
        );
      })}
    </Tabela>
  );
}

export function RetornosPage() {
  const { pode } = useSessao();
  const podeImportar = pode('retorno.importar');
  const podeDesfazer = pode('retorno.baixar_diferenca');
  const [alvo, setAlvo] = useState<ItemRetorno | null>(null);
  const lista = useConsulta(['retornos'], async (): Promise<ItemRetorno[]> => {
    const rs = (await exigir(
      supabase.from('retornos')
        .select('id, competencia, produto, tipo, arquivo_nome, resumo, criado_em, situacao, usuario_id, convenios(nome)')
        .order('criado_em', { ascending: false }).limit(200),
    )) ?? [];
    const ids = [...new Set(rs.map((r) => r.usuario_id).filter(Boolean))] as string[];
    const nomes = ids.length
      ? new Map(((await exigir(supabase.from('usuarios').select('id, nome').in('id', ids))) ?? []).map((u) => [u.id, u.nome]))
      : new Map<string, string>();
    return rs.map((r) => ({
      id: r.id, convenio: r.convenios?.nome ?? '', competencia: r.competencia, produto: r.produto, tipo: r.tipo,
      arquivo_nome: r.arquivo_nome, resumo: (r.resumo ?? {}) as unknown as ResumoRetorno, criado_em: r.criado_em,
      situacao: r.situacao, quem: nomes.get(r.usuario_id ?? '') ?? '',
    }));
  });
  const desfazer = useAcao(
    ({ id, motivo }: { id: string; motivo: string }) =>
      exigir(supabase.rpc('retorno_desfazer', { p_retorno_id: id, p_motivo: motivo })),
    [['retornos'], ['retorno'], ['diferencas'], ['adimplencia']],
  );
  return (
    <Pagina
      titulo="Retornos"
      acoes={podeImportar ? <Link to="/retornos/importar" className="rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800">Importar retorno</Link> : undefined}
    >
      <Aviso>{lista.error ? 'Não foi possível carregar os retornos.' : ''}</Aviso>
      {alvo && (
        <DialogoMotivo
          titulo={`Desfazer o retorno ${alvo.arquivo_nome}`}
          explicacao="Os pagamentos lançados por este arquivo serão desfeitos. Se algum contrato já foi encerrado, o sistema avisa e não desfaz."
          rotuloConfirmar="Desfazer retorno"
          erro={desfazer.erro}
          ocupado={desfazer.isPending}
          onCancelar={() => setAlvo(null)}
          onConfirmar={(motivo) => desfazer.mutate({ id: alvo.id, motivo }, { onSuccess: () => setAlvo(null) })}
        />
      )}
      <ListaRetornos itens={lista.data ?? []} podeDesfazer={podeDesfazer} onDesfazer={setAlvo} />
    </Pagina>
  );
}
