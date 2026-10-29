import { useState, type FormEvent } from 'react';
import { Aviso, Botao, Campo, Selecao } from '../../components/ui';
import { mensagemErro } from '../../lib/erros';
import { formatarReais, lerReais, somarReais, subtrairReais } from '../../lib/mascaras';
import { TIPOS } from '../simulador/SimuladorForm';

export interface QuitacaoDados {
  contrato_quitado_id: string;
  saldo_devedor: string;
  fonte: 'averbadora' | 'calculo' | 'outro';
}
export interface DividaDados {
  credor: string;
  numero_contrato_externo: string;
  saldo: string;
  favorecido: string;
}

/** Mesmo formato de p_dados das RPCs digitar/pre_digitar/editar_contrato. */
export interface DadosContrato {
  cliente_id: string;
  matricula_id: string;
  tipo: 'novo' | 'refinanciamento' | 'compra';
  prazo: number;
  modo: 'valor' | 'parcela';
  quantia: string;
  parceiro_id?: string | null;
  agente_id?: string | null;
  origem_id?: string | null;
  quitacoes: QuitacaoDados[];
  dividas_externas: DividaDados[];
}

export interface PropsDigitacao {
  modo: 'equipe' | 'parceiro';
  cliente: { id: string; nome: string; matriculas: { id: string; rotulo: string }[] };
  contratosQuitaveis: { id: string; numero: number; valor_parcela: string | number; matricula_id: string }[];
  parceiros?: { id: string; nome: string }[];
  agentes: { id: string; nome: string; parceiro_id: string }[];
  origens: { id: string; nome: string }[];
  inicial?: Partial<DadosContrato>;
  rotuloEnviar?: string;
  onSimular: (d: DadosContrato) => Promise<{ valor: string; parcela: string; valor_mensalidade?: string | null }>;
  onEnviar: (d: DadosContrato) => Promise<unknown>;
}

const FONTES = [
  { valor: 'calculo', rotulo: 'Cálculo' },
  { valor: 'averbadora', rotulo: 'Averbadora' },
  { valor: 'outro', rotulo: 'Outro' },
];

export function DigitacaoForm(p: PropsDigitacao) {
  const ini = p.inicial ?? {};
  const [matricula, setMatricula] = useState(ini.matricula_id ?? '');
  const [tipo, setTipo] = useState<string>(ini.tipo ?? '');
  const [prazo, setPrazo] = useState(ini.prazo ? String(ini.prazo) : '');
  const [modoValor, setModoValor] = useState<'valor' | 'parcela'>(ini.modo ?? 'valor');
  const [quantia, setQuantia] = useState(ini.quantia ? ini.quantia.replace('.', ',') : '');
  const [parceiro, setParceiro] = useState(ini.parceiro_id ?? '');
  const [agente, setAgente] = useState(ini.agente_id ?? '');
  const [origem, setOrigem] = useState(ini.origem_id ?? '');
  const [quitar, setQuitar] = useState<Record<string, { saldo: string; fonte: QuitacaoDados['fonte'] }>>(
    Object.fromEntries((ini.quitacoes ?? []).map((q) => [q.contrato_quitado_id, { saldo: q.saldo_devedor.replace('.', ','), fonte: q.fonte }])),
  );
  const [dividas, setDividas] = useState<DividaDados[]>(ini.dividas_externas ?? []);
  const [simulado, setSimulado] = useState<{ valor: string; parcela: string; valor_mensalidade?: string | null } | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const quitaveis = p.contratosQuitaveis.filter((k) => k.matricula_id === matricula);
  const agentesDoParceiro = p.agentes.filter((a) => p.modo === 'parceiro' || a.parceiro_id === parceiro);

  function montar(): DadosContrato {
    if (!matricula || !tipo) throw new Error('Escolha a matrícula e o tipo.');
    if (!/^\d+$/.test(prazo) || Number(prazo) <= 0) throw new Error('Informe o prazo em meses.');
    const q: QuitacaoDados[] = tipo === 'refinanciamento'
      ? Object.entries(quitar).map(([id, v]) => ({ contrato_quitado_id: id, saldo_devedor: lerReais(v.saldo || '0'), fonte: v.fonte }))
      : [];
    return {
      cliente_id: p.cliente.id,
      matricula_id: matricula,
      tipo: tipo as DadosContrato['tipo'],
      prazo: Number(prazo),
      modo: modoValor,
      quantia: lerReais(quantia),
      ...(p.modo === 'equipe' ? { parceiro_id: parceiro || null } : {}),
      agente_id: agente || null,
      origem_id: origem || null,
      quitacoes: q,
      dividas_externas: tipo === 'compra' ? dividas.map((d) => ({ ...d, saldo: lerReais(d.saldo || '0') })) : [],
    };
  }

  async function simular() {
    setErro('');
    setSimulado(null);
    try {
      setSimulado(await p.onSimular(montar()));
    } catch (err) {
      setErro(err instanceof Error && !('code' in err) ? err.message : mensagemErro(err));
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    let d: DadosContrato;
    try {
      d = montar();
      if (d.tipo === 'refinanciamento' && d.quitacoes.length === 0) throw new Error('Escolha ao menos um contrato a quitar.');
    } catch (err) {
      return setErro((err as Error).message);
    }
    setEnviando(true);
    try {
      await p.onEnviar(d);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  let liquido: string | null = null;
  if (simulado) {
    try {
      const d = montar();
      liquido = subtrairReais(
        simulado.valor,
        somarReais(...d.quitacoes.map((q) => q.saldo_devedor)),
        somarReais(...d.dividas_externas.map((x) => x.saldo)),
      );
    } catch {
      liquido = null;
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4 rounded border border-slate-200 bg-white p-4">
      <p className="text-sm">
        Cliente: <strong>{p.cliente.nome}</strong>
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Selecao rotulo="Matrícula" value={matricula} onChange={(e) => (setMatricula(e.target.value), setQuitar({}))}
          opcoes={p.cliente.matriculas.map((m) => ({ valor: m.id, rotulo: m.rotulo }))} />
        <Selecao rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} opcoes={TIPOS} />
        <Campo rotulo="Prazo (meses)" inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        <fieldset className="flex items-end gap-4 text-sm">
          <legend className="sr-only">O que você já sabe</legend>
          <label className="flex items-center gap-1">
            <input type="radio" checked={modoValor === 'valor'} onChange={() => setModoValor('valor')} /> Tenho o valor
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={modoValor === 'parcela'} onChange={() => setModoValor('parcela')} /> Tenho a parcela
          </label>
        </fieldset>
        <Campo rotulo={modoValor === 'valor' ? 'Valor do empréstimo' : 'Parcela (margem)'} inputMode="decimal" placeholder="R$ 0,00"
          value={quantia} onChange={(e) => setQuantia(e.target.value)} />
        {p.modo === 'equipe' && (
          <Selecao rotulo="Parceiro" vazio="Da casa (sem parceiro)" value={parceiro} onChange={(e) => (setParceiro(e.target.value), setAgente(''))}
            opcoes={(p.parceiros ?? []).map((x) => ({ valor: x.id, rotulo: x.nome }))} />
        )}
        <Selecao rotulo="Agente" vazio="—" value={agente} onChange={(e) => setAgente(e.target.value)}
          opcoes={agentesDoParceiro.map((a) => ({ valor: a.id, rotulo: a.nome }))} />
        <Selecao rotulo="Origem" vazio="—" value={origem} onChange={(e) => setOrigem(e.target.value)}
          opcoes={p.origens.map((o) => ({ valor: o.id, rotulo: o.nome }))} />
      </div>

      {tipo === 'refinanciamento' && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Contratos que este refinanciamento quita</legend>
          {quitaveis.length === 0 && <p className="text-sm text-slate-500">Nenhum contrato ativo nesta matrícula.</p>}
          {quitaveis.map((k) => (
            <div key={k.id} className="flex flex-wrap items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={`Quitar contrato nº ${k.numero}`}
                  checked={k.id in quitar}
                  onChange={(e) => {
                    const n = { ...quitar };
                    if (e.target.checked) n[k.id] = { saldo: '', fonte: 'calculo' };
                    else delete n[k.id];
                    setQuitar(n);
                  }}
                />
                nº {k.numero} · parcela {formatarReais(k.valor_parcela)}
              </label>
              {k.id in quitar && (
                <>
                  <Campo rotulo={`Saldo devedor do nº ${k.numero}`} inputMode="decimal" value={quitar[k.id].saldo}
                    onChange={(e) => setQuitar({ ...quitar, [k.id]: { ...quitar[k.id], saldo: e.target.value } })} />
                  <Selecao rotulo="Fonte do saldo" vazio="—" value={quitar[k.id].fonte} opcoes={FONTES}
                    onChange={(e) => setQuitar({ ...quitar, [k.id]: { ...quitar[k.id], fonte: e.target.value as QuitacaoDados['fonte'] } })} />
                </>
              )}
            </div>
          ))}
        </fieldset>
      )}

      {tipo === 'compra' && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Dívidas em outro banco (opcional)</legend>
          {dividas.map((d, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-4">
              {(['credor', 'numero_contrato_externo', 'saldo', 'favorecido'] as const).map((k) => (
                <Campo key={k} rotulo={{ credor: 'Banco/credor', numero_contrato_externo: 'Nº do contrato', saldo: 'Saldo', favorecido: 'Pagar a' }[k]}
                  value={d[k]} onChange={(e) => setDividas(dividas.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
              ))}
            </div>
          ))}
          <Botao variante="secundario" onClick={() => setDividas([...dividas, { credor: '', numero_contrato_externo: '', saldo: '', favorecido: '' }])}>
            Adicionar dívida
          </Botao>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Botao variante="secundario" onClick={simular}>
          Simular
        </Botao>
        {simulado && (
          <span className="text-sm">
            Bruto {formatarReais(simulado.valor)} · {prazo}x {formatarReais(simulado.parcela)}
            {simulado.valor_mensalidade ? ` · mensalidade ${formatarReais(simulado.valor_mensalidade)}` : ''} ·{' '}
            Líquido <strong data-testid="liquido">{liquido ? formatarReais(liquido) : '—'}</strong>
          </span>
        )}
      </div>
      <Aviso>{erro}</Aviso>
      {simulado && (
        <Botao type="submit" disabled={enviando}>
          {p.rotuloEnviar ?? (p.modo === 'parceiro' ? 'Enviar pré-digitação' : 'Digitar contrato')}
        </Botao>
      )}
    </form>
  );
}
