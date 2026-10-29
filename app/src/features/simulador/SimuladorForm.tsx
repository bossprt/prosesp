import { useState, type FormEvent } from 'react';
import { Aviso, Botao, Campo, Selecao } from '../../components/ui';
import { mensagemErro } from '../../lib/erros';
import { formatarReais, lerReais } from '../../lib/mascaras';

export const TIPOS = [
  { valor: 'novo', rotulo: 'Novo' },
  { valor: 'refinanciamento', rotulo: 'Refinanciamento' },
  { valor: 'compra', rotulo: 'Compra' },
];

export interface ConvenioOpcao {
  id: string;
  nome: string;
  vinculos: { id: string; nome: string }[];
}

export interface PedidoSimulacao {
  convenioId: string;
  vinculoId: string;
  tipo: 'novo' | 'refinanciamento' | 'compra';
  prazo: number;
  modo: 'valor' | 'parcela';
  quantia: string;
  nascimento: string | null;
}

export interface ResultadoSimulacao {
  fator: string;
  valor: string;
  parcela: string;
  valor_mensalidade: string | null;
  percentual_comissao: string | null;
  base_comissao: string | null;
}

interface Props {
  convenios: ConvenioOpcao[];
  onSimular: (p: PedidoSimulacao) => Promise<ResultadoSimulacao>;
}

export function SimuladorForm({ convenios, onSimular }: Props) {
  const [convenioId, setConvenioId] = useState('');
  const [vinculoId, setVinculoId] = useState('');
  const [tipo, setTipo] = useState('');
  const [prazo, setPrazo] = useState('');
  const [modo, setModo] = useState<'valor' | 'parcela'>('valor');
  const [quantia, setQuantia] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<ResultadoSimulacao | null>(null);

  const vinculos = convenios.find((c) => c.id === convenioId)?.vinculos ?? [];

  async function simular(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setResultado(null);
    if (!convenioId || !vinculoId || !tipo) return setErro('Escolha convênio, vínculo e tipo.');
    const p = Number(prazo);
    if (!Number.isInteger(p) || p <= 0) return setErro('Informe o prazo em meses.');
    let valor: string;
    try {
      valor = lerReais(quantia);
    } catch (err) {
      return setErro((err as Error).message);
    }
    try {
      setResultado(
        await onSimular({
          convenioId,
          vinculoId,
          tipo: tipo as PedidoSimulacao['tipo'],
          prazo: p,
          modo,
          quantia: valor,
          nascimento: nascimento || null,
        }),
      );
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={simular} className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Selecao
          rotulo="Convênio"
          value={convenioId}
          onChange={(e) => (setConvenioId(e.target.value), setVinculoId(''))}
          opcoes={convenios.map((c) => ({ valor: c.id, rotulo: c.nome }))}
        />
        <Selecao
          rotulo="Vínculo"
          value={vinculoId}
          onChange={(e) => setVinculoId(e.target.value)}
          opcoes={vinculos.map((v) => ({ valor: v.id, rotulo: v.nome }))}
        />
        <Selecao rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} opcoes={TIPOS} />
        <Campo rotulo="Prazo (meses)" inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        <fieldset className="flex gap-4 text-sm sm:col-span-2">
          <legend className="sr-only">O que você já sabe</legend>
          <label className="flex items-center gap-1">
            <input type="radio" checked={modo === 'valor'} onChange={() => setModo('valor')} /> Tenho o valor
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={modo === 'parcela'} onChange={() => setModo('parcela')} /> Tenho a parcela
          </label>
        </fieldset>
        <Campo
          rotulo={modo === 'valor' ? 'Valor do empréstimo' : 'Parcela (margem)'}
          inputMode="decimal"
          placeholder="R$ 0,00"
          value={quantia}
          onChange={(e) => setQuantia(e.target.value)}
        />
        <Campo rotulo="Data de nascimento (se a tabela pedir)" type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
        <div className="space-y-2 sm:col-span-2">
          <Aviso>{erro}</Aviso>
          <Botao type="submit">Simular</Botao>
        </div>
      </form>

      {resultado && (
        <dl className="grid grid-cols-2 gap-2 rounded border border-sky-200 bg-sky-50 p-4 text-sm">
          <dt className="text-slate-600">Valor</dt>
          <dd className="font-semibold">{formatarReais(resultado.valor)}</dd>
          <dt className="text-slate-600">Parcela</dt>
          <dd className="font-semibold">{formatarReais(resultado.parcela)}</dd>
          <dt className="text-slate-600">Fator</dt>
          <dd>{Number(resultado.fator).toLocaleString('pt-BR', { maximumFractionDigits: 8 })}</dd>
          <dt className="text-slate-600">Mensalidade</dt>
          <dd>{resultado.valor_mensalidade ? formatarReais(resultado.valor_mensalidade) : '—'}</dd>
          <dt className="text-slate-600">Comissão</dt>
          <dd>
            {resultado.percentual_comissao
              ? `${Number(resultado.percentual_comissao).toLocaleString('pt-BR')}% sobre o ${resultado.base_comissao === 'bruto' ? 'bruto' : 'líquido'}`
              : '—'}
          </dd>
        </dl>
      )}
    </div>
  );
}
