import { Link } from 'react-router-dom';
import { Selecao, Tabela } from '../../components/ui';
import { formatarCpf } from '../../lib/mascaras';
import { reais, rotuloProduto, type Produto } from './comum';

export type AbaAdimplencia = 'nao_descontadas' | 'ausentes' | 'em_atraso' | 'tudo_pago';

export interface EmAtraso { contrato_id: string; contrato_numero: number; cliente: string; dias: number; parcelas: number; saldo: string | number }
export interface TudoPago { contrato_id: string; contrato_numero: number; cliente: string }
export interface NaoDescontada {
  linha_id: string; produto: string; contrato_numero: number | null; cliente: string | null; matricula: string | null;
  ade: string | null; motivo: string | null; tratamento: string | null;
}
export interface Ausente {
  contrato_id?: string | null; contrato_numero?: number | null; mensalidade_id?: string | null; cliente: string;
  cpf: string | null; matricula: string | null; ade: string | null; valor: string | number; saldo: string | number;
}

const ABAS: { aba: AbaAdimplencia; rotulo: string }[] = [
  { aba: 'nao_descontadas', rotulo: 'Não descontadas' },
  { aba: 'ausentes', rotulo: 'Ausentes do retorno' },
  { aba: 'em_atraso', rotulo: 'Em atraso' },
  { aba: 'tudo_pago', rotulo: 'Tudo pago' },
];

const vazio = (t: string) => <p className="text-sm text-slate-500">{t}</p>;

export function ListasAdimplencia({ aba, onAba, naoDescontadas, ausentes, emAtraso, tudoPago, produtoAusentes, onProdutoAusentes }: {
  aba: AbaAdimplencia;
  onAba: (a: AbaAdimplencia) => void;
  naoDescontadas: NaoDescontada[];
  ausentes: Ausente[];
  emAtraso: EmAtraso[];
  tudoPago: TudoPago[];
  produtoAusentes: Produto;
  onProdutoAusentes: (p: Produto) => void;
}) {
  return (
    <div className="space-y-3">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
        {ABAS.map((a) => (
          <button key={a.aba} role="tab" type="button" aria-selected={a.aba === aba} onClick={() => onAba(a.aba)}
            className={`rounded-t px-3 py-1.5 text-sm ${a.aba === aba ? 'border border-b-white border-slate-200 bg-white font-medium' : 'text-slate-600'}`}>
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === 'nao_descontadas' && (naoDescontadas.length === 0 ? vazio('Nenhuma linha não descontada nesta competência.') : (
        <Tabela colunas={['Produto', 'Contrato', 'Cliente', 'Matrícula', 'ADE', 'Motivo', 'Tratamento']}>
          {naoDescontadas.map((n) => (
            <tr key={n.linha_id}>
              <td className="px-3 py-1.5">{rotuloProduto(n.produto)}</td>
              <td className="px-3 py-1.5">{n.contrato_numero ?? '—'}</td>
              <td className="px-3 py-1.5">{n.cliente ?? '—'}</td>
              <td className="px-3 py-1.5">{n.matricula ?? '—'}</td>
              <td className="px-3 py-1.5">{n.ade ?? '—'}</td>
              <td className="px-3 py-1.5">{n.motivo ?? ''}</td>
              <td className="px-3 py-1.5">{n.tratamento ?? ''}</td>
            </tr>
          ))}
        </Tabela>
      ))}

      {aba === 'ausentes' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Cadastros que deveriam ter sido descontados, mas não aparecem em nenhum retorno gravado desta competência.</p>
          <Selecao rotulo="Produto" value={produtoAusentes} onChange={(e) => onProdutoAusentes(e.target.value as Produto)}
            opcoes={[{ valor: 'parcelas', rotulo: 'Parcelas dos contratos' }, { valor: 'mensalidades', rotulo: 'Mensalidades' }]} className="max-w-xs" />
          {ausentes.length === 0 ? vazio('Nenhum cadastro ausente.') : (
            <Tabela colunas={['Contrato', 'Cliente', 'CPF', 'Matrícula', 'ADE', 'Valor', 'Falta']}>
              {ausentes.map((a, i) => (
                <tr key={a.contrato_id ?? a.mensalidade_id ?? i}>
                  <td className="px-3 py-1.5">
                    {a.contrato_id ? <Link to={`/contratos/${a.contrato_id}`} className="text-sky-800 hover:underline">nº {a.contrato_numero}</Link> : (a.contrato_numero ?? '—')}
                  </td>
                  <td className="px-3 py-1.5">{a.cliente}</td>
                  <td className="px-3 py-1.5">{a.cpf ? formatarCpf(a.cpf) : '—'}</td>
                  <td className="px-3 py-1.5">{a.matricula ?? '—'}</td>
                  <td className="px-3 py-1.5">{a.ade ?? '—'}</td>
                  <td className="px-3 py-1.5">{reais(a.valor)}</td>
                  <td className="px-3 py-1.5">{reais(a.saldo)}</td>
                </tr>
              ))}
            </Tabela>
          )}
        </div>
      )}

      {aba === 'em_atraso' && (emAtraso.length === 0 ? vazio('Nenhum contrato em atraso.') : (
        <Tabela colunas={['Contrato', 'Cliente', 'Dias de atraso', 'Parcelas em atraso', 'Saldo']}>
          {emAtraso.map((c) => (
            <tr key={c.contrato_id}>
              <td className="px-3 py-1.5"><Link to={`/contratos/${c.contrato_id}`} className="text-sky-800 hover:underline">nº {c.contrato_numero}</Link></td>
              <td className="px-3 py-1.5">{c.cliente}</td>
              <td className="px-3 py-1.5">{c.dias}</td>
              <td className="px-3 py-1.5">{c.parcelas}</td>
              <td className="px-3 py-1.5">{reais(c.saldo)}</td>
            </tr>
          ))}
        </Tabela>
      ))}

      {aba === 'tudo_pago' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Contratos com todas as parcelas pagas. O sistema não encerra o contrato sozinho: a quitação é feita pelo
            encerramento do contrato. Abra o contrato para encerrar.
          </p>
          {tudoPago.length === 0 ? vazio('Nenhum contrato com tudo pago.') : (
            <Tabela colunas={['Contrato', 'Cliente']}>
              {tudoPago.map((c) => (
                <tr key={c.contrato_id}>
                  <td className="px-3 py-1.5"><Link to={`/contratos/${c.contrato_id}`} className="text-sky-800 hover:underline">nº {c.contrato_numero}</Link></td>
                  <td className="px-3 py-1.5">{c.cliente}</td>
                </tr>
              ))}
            </Tabela>
          )}
        </div>
      )}
    </div>
  );
}
