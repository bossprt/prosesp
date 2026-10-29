import { useState, type FormEvent } from 'react';
import { Aviso, Botao, Campo, Selecao } from '../../components/ui';
import { mensagemErro } from '../../lib/erros';
import { lerReais } from '../../lib/mascaras';
import { TIPOS } from '../simulador/SimuladorForm';

export interface NovaLinha {
  vinculo_id: string;
  tipo: 'novo' | 'refinanciamento' | 'compra';
  prazo: number;
  valor_min: string | null;
  valor_max: string | null;
  idade_min: number | null;
  idade_max: number | null;
  inicio: string;
  fim: string | null;
  fator: string;
  percentual: string;
  valor_mensalidade: string | null;
}

/** Decimal digitado com vírgula ("0,0612") → texto com ponto. */
function decimal(s: string, rotulo: string): string {
  const t = s.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`${rotulo} inválido.`);
  return t;
}

const inteiroOuNulo = (s: string) => (s.trim() === '' ? null : Number(s));

export function LinhaForm({
  vinculos,
  onSalvar,
}: {
  vinculos: { id: string; nome: string }[];
  onSalvar: (l: NovaLinha) => Promise<unknown>;
}) {
  const [f, setF] = useState({
    vinculo_id: '', tipo: '', prazo: '', fator: '', percentual: '', mensalidade: '',
    valor_min: '', valor_max: '', idade_min: '', idade_max: '', inicio: '', fim: '',
  });
  const [erro, setErro] = useState('');
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    let linha: NovaLinha;
    try {
      if (!f.vinculo_id || !f.tipo) throw new Error('Escolha vínculo e tipo.');
      if (!/^\d+$/.test(f.prazo) || Number(f.prazo) <= 0) throw new Error('Informe o prazo em meses.');
      if (!f.inicio) throw new Error('Informe o início da vigência.');
      linha = {
        vinculo_id: f.vinculo_id,
        tipo: f.tipo as NovaLinha['tipo'],
        prazo: Number(f.prazo),
        valor_min: f.valor_min.trim() ? lerReais(f.valor_min) : null,
        valor_max: f.valor_max.trim() ? lerReais(f.valor_max) : null,
        idade_min: inteiroOuNulo(f.idade_min),
        idade_max: inteiroOuNulo(f.idade_max),
        inicio: f.inicio,
        fim: f.fim || null,
        fator: decimal(f.fator, 'Fator'),
        percentual: decimal(f.percentual, 'Percentual de comissão'),
        valor_mensalidade: f.mensalidade.trim() ? lerReais(f.mensalidade) : null,
      };
    } catch (err) {
      return setErro((err as Error).message);
    }
    try {
      await onSalvar(linha);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  return (
    <form onSubmit={salvar} className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-4">
      <Selecao rotulo="Vínculo" {...campo('vinculo_id')} opcoes={vinculos.map((v) => ({ valor: v.id, rotulo: v.nome }))} />
      <Selecao rotulo="Tipo" {...campo('tipo')} opcoes={TIPOS} />
      <Campo rotulo="Prazo (meses)" inputMode="numeric" {...campo('prazo')} />
      <Campo rotulo="Fator" inputMode="decimal" placeholder="0,0612" {...campo('fator')} />
      <Campo rotulo="Valor mínimo" inputMode="decimal" placeholder="vazio = sem limite" {...campo('valor_min')} />
      <Campo rotulo="Valor máximo" inputMode="decimal" placeholder="vazio = sem limite" {...campo('valor_max')} />
      <Campo rotulo="Idade mínima" inputMode="numeric" {...campo('idade_min')} />
      <Campo rotulo="Idade máxima" inputMode="numeric" {...campo('idade_max')} />
      <Campo rotulo="Comissão (%)" inputMode="decimal" {...campo('percentual')} />
      <Campo rotulo="Mensalidade (R$)" inputMode="decimal" {...campo('mensalidade')} />
      <Campo rotulo="Início da vigência" type="date" {...campo('inicio')} />
      <Campo rotulo="Fim da vigência (opcional)" type="date" {...campo('fim')} />
      <div className="space-y-2 sm:col-span-4">
        <Aviso>{erro}</Aviso>
        <Botao type="submit">Adicionar linha</Botao>
      </div>
    </form>
  );
}
