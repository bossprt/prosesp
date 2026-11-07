import { useState } from 'react';
import { Botao, Selecao, Tabela } from '../../components/ui';
import { SITUACOES, acoesDaLinha, reais, rotuloSituacao } from './comum';

export interface LinhaDetalhe {
  id: string;
  linha: number;
  ade: string | null;
  nome: string | null;
  cpf: string | null;
  valor: number | string | null;
  valor_aplicado: number | string | null;
  situacao: string;
  motivo: string | null;
  tratamento: string | null;
  tratamento_motivo: string | null;
  sugestao_contrato_id: string | null;
  sugestao_mensalidade_id: string | null;
}

const TRATAMENTOS: Record<string, string> = { vinculada: 'Vinculada', ignorada: 'Visto' };

export function TabelaLinhasRetorno({ linhas, retornoGravado, podeTratar, arquivoDeDescontados = true, onVincular, onIgnorar }: {
  linhas: LinhaDetalhe[];
  retornoGravado: boolean;
  podeTratar: boolean;
  arquivoDeDescontados?: boolean;
  onVincular: (l: LinhaDetalhe) => void;
  onIgnorar: (l: LinhaDetalhe) => void;
}) {
  const [filtro, setFiltro] = useState('');
  const visiveis = filtro ? linhas.filter((l) => l.situacao === filtro) : linhas;
  return (
    <div className="space-y-3">
      <Selecao rotulo="Mostrar só" vazio="Todas as situações" value={filtro} onChange={(e) => setFiltro(e.target.value)}
        opcoes={SITUACOES.map((s) => ({ valor: s.valor, rotulo: s.rotulo }))} className="max-w-xs" />
      {visiveis.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma linha nesta situação.</p>
      ) : (
        <Tabela colunas={['Linha', 'ADE', 'Nome', 'Valor', 'Situação', 'Motivo', 'Tratamento', 'Ações']}>
          {visiveis.map((l) => {
            const a = acoesDaLinha(l, retornoGravado, podeTratar, arquivoDeDescontados);
            const visto = l.situacao === 'duplicada' || l.situacao === 'nao_descontada';
            return (
              <tr key={l.id}>
                <td className="px-3 py-1.5">{l.linha}</td>
                <td className="px-3 py-1.5">{l.ade ?? '—'}</td>
                <td className="px-3 py-1.5">{l.nome ?? '—'}</td>
                <td className="px-3 py-1.5">{reais(l.valor)}</td>
                <td className="px-3 py-1.5">{rotuloSituacao(l.situacao)}</td>
                <td className="px-3 py-1.5">{l.motivo ?? ''}</td>
                <td className="px-3 py-1.5">
                  {l.tratamento
                    ? `${TRATAMENTOS[l.tratamento] ?? l.tratamento}${l.tratamento_motivo ? `: ${l.tratamento_motivo}` : ''}`
                    : ''}
                </td>
                <td className="flex gap-1 px-3 py-1.5">
                  {a.vincular && <Botao variante="secundario" onClick={() => onVincular(l)}>Vincular</Botao>}
                  {a.ignorar && (
                    <Botao variante="secundario" onClick={() => onIgnorar(l)}>{visto ? 'Marcar como visto' : 'Ignorar'}</Botao>
                  )}
                </td>
              </tr>
            );
          })}
        </Tabela>
      )}
    </div>
  );
}
