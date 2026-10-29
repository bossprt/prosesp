import { useState } from 'react';
import { Campo, Pagina, Tabela } from '../../components/ui';
import { exigir, useConsulta } from '../../lib/dados';
import { supabase } from '../../lib/supabase';

export function AuditoriaPage() {
  const [tabela, setTabela] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const registros = useConsulta(['auditoria', tabela, de, ate], () => {
    let q = supabase.from('auditoria').select('*').order('id', { ascending: false }).limit(200);
    // só letras, números e _ no filtro (vírgula e parênteses mudariam a consulta)
    const t = tabela.trim().replace(/[^\p{L}\p{N}_]/gu, '');
    if (t) q = q.or(`tabela.ilike.%${t}%,acao.ilike.%${t}%`);
    if (de) q = q.gte('em', de);
    if (ate) q = q.lt('em', `${ate}T23:59:59.999`);
    return exigir(q);
  });
  const usuarios = useConsulta(['usuarios-nomes'], () => exigir(supabase.from('usuarios').select('id, nome')));
  const nome = (id: string | null) => (id ? usuarios.data?.find((u) => u.id === id)?.nome ?? id.slice(0, 8) : 'sistema');

  return (
    <Pagina titulo="Auditoria">
      <div className="grid gap-2 sm:grid-cols-3">
        <Campo rotulo="Tabela ou ação" value={tabela} onChange={(e) => setTabela(e.target.value)} />
        <Campo rotulo="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <Campo rotulo="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
      </div>
      <Tabela colunas={['Quando', 'Quem', 'Ação', 'Tabela', 'Registro', 'Detalhe']}>
        {(registros.data ?? []).map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap px-3 py-2">{new Date(r.em).toLocaleString('pt-BR')}</td>
            <td className="px-3 py-2">{nome(r.usuario_id)}</td>
            <td className="px-3 py-2">{r.acao}</td>
            <td className="px-3 py-2">{r.tabela ?? '—'}</td>
            <td className="px-3 py-2">{r.registro_id?.slice(0, 8) ?? '—'}</td>
            <td className="max-w-sm truncate px-3 py-2" title={JSON.stringify(r.depois ?? r.detalhe ?? r.antes)}>
              {JSON.stringify(r.depois ?? r.detalhe ?? r.antes)}
            </td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}
