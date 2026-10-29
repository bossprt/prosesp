import { Link } from 'react-router-dom';
import { Aviso, Pagina, Tabela } from '../../components/ui';
import { exigir, useConsulta } from '../../lib/dados';
import { supabase } from '../../lib/supabase';

/** Contratos com atraso maior que o limite do convênio. A decisão de lançar prejuízo é de quem tem a permissão. */
export function CandidatosPrejuizoPage() {
  const lista = useConsulta(['candidatos-prejuizo'], async () =>
    (await exigir(supabase.from('v_candidatos_prejuizo').select('*').order('dias_atraso', { ascending: false }))) ?? [],
  );
  return (
    <Pagina titulo="Candidatos a prejuízo">
      <Aviso tipo="info">Contratos com parcela atrasada há mais dias que o limite do convênio. Abra o contrato para encerrar como prejuízo.</Aviso>
      <Tabela colunas={['Contrato', 'Cliente', 'Convênio', 'Dias de atraso']}>
        {(lista.data ?? []).map((c) => (
          <tr key={c.contrato_id}>
            <td className="px-3 py-1.5">
              <Link to={`/contratos/${c.contrato_id}`} className="text-sky-800 hover:underline">nº {c.numero}</Link>
            </td>
            <td className="px-3 py-1.5">{c.cliente}</td>
            <td className="px-3 py-1.5">{c.convenio}</td>
            <td className="px-3 py-1.5">{c.dias_atraso}</td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
