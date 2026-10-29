import { Botao, Tabela } from '../../components/ui';
import { faixaAnos, faixaReais, vigenciaTexto } from '../../lib/faixas';
import { formatarReais } from '../../lib/mascaras';

export interface LinhaView {
  id: string;
  vinculo: string;
  tipo: string;
  prazo: number;
  faixa_valor: string;
  faixa_idade: string;
  vigencia: string;
  fator: string;
  percentual: string | null;
  base: string | null;
  valor_mensalidade: string | null;
  usada: boolean;
}

interface Props {
  linhas: LinhaView[];
  podeEditar: boolean;
  onEncerrar: (id: string) => void;
  onExcluir: (id: string) => void;
}

export function LinhasTabela({ linhas, podeEditar, onEncerrar, onExcluir }: Props) {
  return (
    <Tabela colunas={['Vínculo', 'Tipo', 'Prazo', 'Valor', 'Idade', 'Vigência', 'Fator', 'Comissão', 'Mensalidade', '']}>
      {linhas.map((l) => {
        const encerrada = !/,\)$/.test(l.vigencia);
        return (
          <tr key={l.id} className={encerrada ? 'text-slate-400' : ''}>
            <td className="px-3 py-2">{l.vinculo}</td>
            <td className="px-3 py-2">{l.tipo}</td>
            <td className="px-3 py-2">{l.prazo}x</td>
            <td className="px-3 py-2">{faixaReais(l.faixa_valor)}</td>
            <td className="px-3 py-2">{faixaAnos(l.faixa_idade)}</td>
            <td className="px-3 py-2">{vigenciaTexto(l.vigencia)}</td>
            <td className="px-3 py-2">{Number(l.fator).toLocaleString('pt-BR', { maximumFractionDigits: 8 })}</td>
            <td className="px-3 py-2">
              {l.percentual ? `${Number(l.percentual).toLocaleString('pt-BR')}% ${l.base === 'bruto' ? 'bruto' : 'líquido'}` : '—'}
            </td>
            <td className="px-3 py-2">{l.valor_mensalidade ? formatarReais(l.valor_mensalidade) : '—'}</td>
            <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
              {podeEditar && !encerrada && (
                <Botao variante="secundario" onClick={() => onEncerrar(l.id)}>
                  Encerrar vigência
                </Botao>
              )}
              {podeEditar && !l.usada && (
                <Botao variante="perigo" onClick={() => onExcluir(l.id)}>
                  Excluir
                </Botao>
              )}
            </td>
          </tr>
        );
      })}
    </Tabela>
  );
}
