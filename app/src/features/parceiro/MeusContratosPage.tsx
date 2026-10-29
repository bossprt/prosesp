import { Link } from 'react-router-dom';
import { Pagina, Tabela } from '../../components/ui';
import { ROTULO_FASE, ROTULO_SITUACAO } from '../../lib/contratos';
import { exigir, useConsulta } from '../../lib/dados';
import { formatarReais } from '../../lib/mascaras';
import { supabase } from '../../lib/supabase';

/** Contratos visíveis ao parceiro (a RLS filtra: só os dele, salvo configuração da PROSESP). */
export function MeusContratosPage() {
  const lista = useConsulta(['meus-contratos'], async () =>
    (await exigir(
      supabase.from('contratos').select('id, numero, fase, situacao, valor_bruto, prazo, valor_parcela, clientes(nome)').order('numero', { ascending: false }),
    )) ?? [],
  );
  return (
    <Pagina titulo="Meus contratos" acoes={<Link to="/parceiro/pre-digitacao" className="rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white">Nova pré-digitação</Link>}>
      <Tabela colunas={['Nº', 'Cliente', 'Valor', 'Parcela', 'Fase', 'Situação']}>
        {(lista.data ?? []).map((k) => (
          <tr key={k.id}>
            <td className="px-3 py-1.5">
              <Link to={`/contratos/${k.id}`} className="text-sky-800 hover:underline">{k.numero}</Link>
            </td>
            <td className="px-3 py-1.5">{k.clientes?.nome}</td>
            <td className="px-3 py-1.5">{formatarReais(k.valor_bruto)}</td>
            <td className="px-3 py-1.5">{k.prazo}x {formatarReais(k.valor_parcela)}</td>
            <td className="px-3 py-1.5">{ROTULO_FASE[k.fase]}</td>
            <td className="px-3 py-1.5">{ROTULO_SITUACAO[k.situacao]}</td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
