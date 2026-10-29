import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Aviso, Botao, Campo, Pagina, Tabela } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { mensagemErro } from '../../lib/erros';
import { formatarCelular, formatarCpf } from '../../lib/mascaras';
import { supabase } from '../../lib/supabase';
import { ClienteDetalhe } from '../clientes/ClienteDetalhe';
import { ClienteRapidoForm } from '../clientes/ClienteRapidoForm';
import { useConveniosOpcoes } from '../convenios/useConvenios';

/** Portal do parceiro: a lista vem filtrada pela RLS (só clientes ligados a ele). */
export function ParceiroClientesPage() {
  const navigate = useNavigate();
  const convenios = useConveniosOpcoes();
  const lista = useConsulta(['meus-clientes'], () =>
    exigir(supabase.from('clientes').select('id, nome, cpf, whatsapp').order('nome')),
  );
  const [cpf, setCpf] = useState('');
  const [matricula, setMatricula] = useState('');
  const [resultado, setResultado] = useState<{ cliente_id: string; nome: string } | null | 'nada'>(null);
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState(false);
  const adotar = useAcao(
    () => exigir(supabase.rpc('parceiro_adotar_cliente', { p_cpf: cpf, p_matricula: matricula })),
    [['meus-clientes']],
  );

  async function buscar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setResultado(null);
    try {
      const r = await exigir(supabase.rpc('parceiro_buscar_cliente', { p_cpf: cpf, p_matricula: matricula }));
      setResultado(r?.[0] ? { cliente_id: r[0].cliente_id, nome: r[0].nome } : 'nada');
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  return (
    <Pagina titulo="Meus clientes" acoes={<Botao onClick={() => setNovo(!novo)}>Cadastrar novo</Botao>}>
      {novo && (
        <ClienteRapidoForm
          convenios={convenios.data ?? []}
          onSalvar={async (d) => {
            const id = await exigir(supabase.rpc('parceiro_cadastrar_cliente', { p_dados: d as never }));
            navigate(`/parceiro/clientes/${id}`);
          }}
        />
      )}

      <form onSubmit={buscar} className="flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-white p-3">
        <Campo rotulo="CPF do cliente" value={cpf} onChange={(e) => setCpf(e.target.value)} />
        <Campo rotulo="Matrícula" value={matricula} onChange={(e) => setMatricula(e.target.value)} />
        <Botao type="submit" disabled={!cpf.trim() || !matricula.trim()}>
          Buscar cliente já cadastrado
        </Botao>
      </form>
      <Aviso>{erro || adotar.erro}</Aviso>
      {resultado === 'nada' && <Aviso tipo="info">Nenhum cliente com este CPF e matrícula. Você pode cadastrá-lo.</Aviso>}
      {resultado && resultado !== 'nada' && (
        <div className="flex items-center gap-3 rounded border border-sky-200 bg-sky-50 p-3 text-sm">
          <span>
            Encontrado: <strong>{resultado.nome}</strong>
          </span>
          <Botao
            onClick={() =>
              adotar.mutate(undefined, { onSuccess: (id) => navigate(`/parceiro/clientes/${id}`) })
            }
          >
            Usar este cadastro
          </Botao>
        </div>
      )}

      <Tabela colunas={['Nome', 'CPF', 'WhatsApp']}>
        {(lista.data ?? []).map((c) => (
          <tr key={c.id}>
            <td className="px-3 py-2">
              <Link to={`/parceiro/clientes/${c.id}`} className="text-sky-800 hover:underline">
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

export function ParceiroClientePage() {
  const { id = '' } = useParams();
  return (
    <Pagina titulo="Cliente" acoes={<Link to="/parceiro/clientes" className="text-sm text-sky-800 hover:underline">← Voltar</Link>}>
      <ClienteDetalhe clienteId={id} modo="parceiro" />
    </Pagina>
  );
}
