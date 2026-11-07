import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Aviso, Pagina, Selecao } from '../../components/ui';
import { Campo } from '../../components/ui';
import type { Json } from '../../lib/database.types';
import { exigir, useConsulta } from '../../lib/dados';
import { mensagemErro } from '../../lib/erros';
import { supabase } from '../../lib/supabase';
import { useConveniosOpcoes } from '../convenios/useConvenios';
import {
  adivinharEscolhas, hashArquivo, lerArquivoRetorno, validarLayoutRetorno, type LinhaRetorno, type LayoutRetorno,
} from './arquivo';
import { competenciaDeMes, mesDeCompetencia, type LinhaConferida, type Produto, type ResumoRetorno, type TipoArquivo } from './comum';
import { PreviaRetorno } from './PreviaRetorno';

const LIMITE_BYTES = 10 * 1024 * 1024;

interface Arquivo { nome: string; buffer: ArrayBuffer; hash: string }
interface Lido { linhas: LinhaRetorno[]; erros: string[] }

export function ImportarRetornoPage() {
  const navegar = useNavigate();
  const convenios = useConveniosOpcoes();
  const [convenioId, setConvenioId] = useState('');
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [lido, setLido] = useState<Lido | null>(null);
  const [produto, setProduto] = useState<Produto | ''>('');
  const [tipo, setTipo] = useState<TipoArquivo | ''>('');
  const [mes, setMes] = useState('');
  const [previa, setPrevia] = useState<{ resumo: ResumoRetorno; linhas: LinhaConferida[] } | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const layout = useConsulta(['convenio-layout-retorno', convenioId], async () => {
    const c = await exigir(supabase.from('convenios').select('layout_retorno').eq('id', convenioId).single());
    return (c?.layout_retorno ?? null) as unknown;
  }, Boolean(convenioId));
  const layoutOk = Boolean(layout.data) && validarLayoutRetorno(layout.data).length === 0;
  const semLayout = Boolean(convenioId) && layout.isSuccess && !layoutOk;

  // Lê o arquivo de novo quando ele ou o layout do convênio mudam, e pré-preenche as escolhas.
  useEffect(() => {
    let cancelado = false;
    async function ler() {
      if (!arquivo || !layoutOk) return setLido(null);
      const r = await lerArquivoRetorno(arquivo.buffer, arquivo.nome, layout.data as LayoutRetorno);
      if (cancelado) return;
      setLido(r);
      const e = adivinharEscolhas(arquivo.nome, r.linhas);
      setProduto(e.produto ?? '');
      setTipo(e.tipo ?? '');
      setMes(e.competencia ? mesDeCompetencia(e.competencia) : '');
    }
    ler().catch((e) => !cancelado && setErro(mensagemErro(e)));
    return () => { cancelado = true; };
  }, [arquivo, layoutOk, layout.data]);

  async function escolherArquivo(file: File | undefined) {
    setErro('');
    setPrevia(null);
    setLido(null);
    setArquivo(null);
    if (!file) return;
    if (file.size > LIMITE_BYTES) return setErro('Arquivo maior que 10 MB. Divida em arquivos menores.');
    const buffer = await file.arrayBuffer();
    setArquivo({ nome: file.name, buffer, hash: await hashArquivo(buffer) });
  }

  const competencia = competenciaDeMes(mes);
  const pronto = Boolean(convenioId && arquivo && lido && lido.linhas.length > 0 && produto && tipo && competencia);

  function parametros() {
    return {
      p_convenio_id: convenioId, p_produto: produto, p_tipo: tipo, p_competencia: competencia,
      p_linhas: (lido?.linhas ?? []) as unknown as Json, p_hash: arquivo?.hash ?? '',
    };
  }

  async function conferir() {
    setErro('');
    setOcupado(true);
    try {
      const r = (await exigir(supabase.rpc('retorno_conferir', parametros()))) as unknown as { resumo: ResumoRetorno; linhas: LinhaConferida[] };
      setPrevia({ resumo: r.resumo ?? {}, linhas: r.linhas ?? [] });
    } catch (e) {
      setPrevia(null);
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  async function gravar() {
    setErro('');
    setOcupado(true);
    try {
      const r = (await exigir(supabase.rpc('retorno_gravar', { ...parametros(), p_arquivo_nome: arquivo?.nome ?? '' }))) as unknown as { retorno_id: string };
      navegar(`/retornos/${r.retorno_id}`);
    } catch (e) {
      setErro(mensagemErro(e));
      setOcupado(false);
    }
  }

  const limpar = () => setPrevia(null);

  return (
    <Pagina titulo="Importar retorno">
      <p className="text-sm text-slate-600">
        <Link to="/retornos" className="text-sky-800 hover:underline">Voltar para os retornos</Link>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Selecao rotulo="Convênio" value={convenioId}
          onChange={(e) => { setConvenioId(e.target.value); setLido(null); setPrevia(null); }}
          opcoes={(convenios.data ?? []).map((c) => ({ valor: c.id, rotulo: c.nome }))} />
        <div className="flex flex-col gap-1">
          <label htmlFor="arquivo-retorno" className="text-sm font-medium">Arquivo do retorno (.xlsx ou .csv)</label>
          <input id="arquivo-retorno" type="file" accept=".xlsx,.csv" className="text-sm"
            onChange={(e) => void escolherArquivo(e.target.files?.[0])} />
        </div>
      </div>
      {semLayout && (
        <Aviso tipo="info">
          Este convênio ainda não tem o layout do retorno. Configure na página do convênio.{' '}
          <Link to="/convenios" className="underline">Abrir convênios</Link>
        </Aviso>
      )}
      <Aviso>{erro}</Aviso>
      {lido && lido.erros.length > 0 && (
        <Aviso>
          <p>Problemas ao ler o arquivo:</p>
          <ul className="list-disc pl-4">{lido.erros.map((m) => <li key={m}>{m}</li>)}</ul>
        </Aviso>
      )}
      {lido && (
        <div className="space-y-3">
          <p className="text-sm">O arquivo tem {lido.linhas.length} {lido.linhas.length === 1 ? 'linha' : 'linhas'} lidas. Confira as escolhas abaixo.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Selecao rotulo="Produto" value={produto} onChange={(e) => { setProduto(e.target.value as Produto); limpar(); }}
              opcoes={[{ valor: 'parcelas', rotulo: 'Parcelas dos contratos' }, { valor: 'mensalidades', rotulo: 'Mensalidades' }]} />
            <Selecao rotulo="Tipo do arquivo" value={tipo} onChange={(e) => { setTipo(e.target.value as TipoArquivo); limpar(); }}
              opcoes={[{ valor: 'descontados', rotulo: 'Descontados' }, { valor: 'nao_descontados', rotulo: 'Não descontados' }]} />
            <Campo rotulo="Competência (mês da folha)" type="month" value={mes} onChange={(e) => { setMes(e.target.value); limpar(); }} />
          </div>
          <button type="button" disabled={!pronto || ocupado} onClick={() => void conferir()}
            className="rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50">
            {ocupado && !previa ? 'Conferindo…' : 'Conferir'}
          </button>
        </div>
      )}
      {previa && <PreviaRetorno resumo={previa.resumo} linhas={previa.linhas} onGravar={() => void gravar()} gravando={ocupado} />}
    </Pagina>
  );
}
