import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Botao, Campo, Pagina, Tabela } from '../../components/ui';
import { exigir, useConsulta } from '../../lib/dados';
import { formatarCelular, formatarCpf, soDigitos } from '../../lib/mascaras';
import { supabase } from '../../lib/supabase';
import { useSessao } from '../auth/sessao';
import { useConveniosOpcoes } from '../convenios/useConvenios';
import { ClienteDetalhe } from './ClienteDetalhe';
import { ClienteRapidoForm } from './ClienteRapidoForm';

export function ClientesPage() {
  const { pode } = useSessao();
  const navigate = useNavigate();
  const convenios = useConveniosOpcoes();
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const termo = busca.trim();
  const lista = useConsulta(['clientes', termo], () => {
    let q = supabase.from('clientes').select('id, nome, cpf, whatsapp').order('nome').limit(50);
    const digitos = soDigitos(termo);
    if (termo) q = digitos.length >= 3 && digitos.length === termo.replace(/[.\-\s]/g, '').length ? q.like('cpf', `%${digitos}%`) : q.ilike('nome', `%${termo}%`);
    return exigir(q);
  });

  return (
    <Pagina titulo="Clientes" acoes={pode('clientes.editar') && <Botao onClick={() => setNovo(!novo)}>Novo cliente</Botao>}>
      {novo && (
        <ClienteRapidoForm
          convenios={convenios.data ?? []}
          onSalvar={async (d) => {
            const id = await exigir(supabase.rpc('cadastrar_cliente', { p_dados: d as never }));
            navigate(`/clientes/${id}`);
          }}
        />
      )}
      <Campo rotulo="Buscar por nome ou CPF" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md" />
      <Tabela colunas={['Nome', 'CPF', 'WhatsApp']}>
        {(lista.data ?? []).map((c) => (
          <tr key={c.id} className="hover:bg-slate-50">
            <td className="px-3 py-2">
              <Link to={`/clientes/${c.id}`} className="text-sky-800 hover:underline">
                {c.nome}
              </Link>
            </td>
            <td className="px-3 py-2">{formatarCpf(c.cpf)}</td>
            <td className="px-3 py-2">{formatarCelular(c.whatsapp)}</td>
          </tr>
        ))}
      </Tabela>
    </Pagina>
  );
}

export function ClienteEquipePage() {
  const { id = '' } = useParams();
  return (
    <Pagina titulo="Cliente" acoes={<Link to="/clientes" className="text-sm text-sky-800 hover:underline">← Voltar</Link>}>
      <ClienteDetalhe clienteId={id} modo="equipe" />
    </Pagina>
  );
}
