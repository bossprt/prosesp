import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Campo, Pagina, Selecao } from '../../components/ui';
import { ORDEM_FASES, ROTULO_FASE } from '../../lib/contratos';
import { exigir, useConsulta } from '../../lib/dados';
import { supabase } from '../../lib/supabase';
import { useSessao } from '../auth/sessao';
import { useConveniosOpcoes } from '../convenios/useConvenios';
import { CartaoContrato, type ContratoCartao } from './CartaoContrato';

export function EsteiraPage() {
  const { pode } = useSessao();
  const convenios = useConveniosOpcoes();
  const [convenioId, setConvenioId] = useState('');
  const [parceiroId, setParceiroId] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const parceiros = useConsulta(['parceiros-lista'], () =>
    exigir(supabase.from('parceiros').select('id, nome').eq('ativo', true).order('nome')),
  );
  const contratos = useConsulta(['esteira', convenioId, parceiroId, de, ate], async () => {
    let q = supabase
      .from('contratos')
      .select('id, numero, fase, fase_desde, prazo, valor_bruto, valor_parcela, clientes(nome), parceiros(nome)')
      .in('fase', ORDEM_FASES)
      .order('numero');
    if (convenioId) q = q.eq('convenio_id', convenioId);
    if (parceiroId) q = parceiroId === 'casa' ? q.is('parceiro_id', null) : q.eq('parceiro_id', parceiroId);
    if (de) q = q.gte('criado_em', de);
    if (ate) q = q.lt('criado_em', `${ate}T23:59:59.999`);
    return (await exigir(q)) ?? [];
  });

  const porFase = new Map<string, ContratoCartao[]>();
  for (const k of contratos.data ?? []) {
    const desde = k.fase_desde;
    const lista = porFase.get(k.fase) ?? [];
    lista.push({
      id: k.id, numero: k.numero, cliente: k.clientes?.nome ?? '', valor_bruto: k.valor_bruto,
      valor_parcela: k.valor_parcela, prazo: k.prazo, desde, parceiro: k.parceiros?.nome ?? null,
    });
    porFase.set(k.fase, lista);
  }

  return (
    <Pagina
      titulo="Esteira"
      acoes={pode('contratos.digitar') && <Link to="/contratos/novo" className="rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white">Digitar contrato</Link>}
    >
      <div className="grid gap-2 sm:grid-cols-4">
        <Selecao rotulo="Convênio" vazio="Todos" value={convenioId} onChange={(e) => setConvenioId(e.target.value)}
          opcoes={(convenios.data ?? []).map((c) => ({ valor: c.id, rotulo: c.nome }))} />
        <Selecao rotulo="Parceiro" vazio="Todos" value={parceiroId} onChange={(e) => setParceiroId(e.target.value)}
          opcoes={[{ valor: 'casa', rotulo: 'Da casa (sem parceiro)' }, ...(parceiros.data ?? []).map((p) => ({ valor: p.id, rotulo: p.nome }))]} />
        <Campo rotulo="Digitado de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <Campo rotulo="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {ORDEM_FASES.map((f) => (
          <section key={f} className="w-60 shrink-0 space-y-2 rounded bg-slate-100 p-2">
            <h2 className="flex justify-between text-sm font-medium">
              {ROTULO_FASE[f]} <span className="text-slate-500">{porFase.get(f)?.length ?? 0}</span>
            </h2>
            {(porFase.get(f) ?? []).map((k) => (
              <CartaoContrato key={k.id} contrato={k} />
            ))}
          </section>
        ))}
      </div>
    </Pagina>
  );
}
