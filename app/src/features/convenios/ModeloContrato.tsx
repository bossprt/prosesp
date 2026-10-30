import { useEffect, useRef, useState } from 'react';
import { Aviso, Botao } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { mensagemErro } from '../../lib/erros';
import { supabase } from '../../lib/supabase';
import { abrirPdf, chamarAssinatura } from '../assinaturas/useAssinaturas';

interface CampoModelo {
  chave: string;
  rotulo: string;
  exemplo: string;
}

interface EditorProps {
  campos: CampoModelo[];
  textoInicial: string;
  testeInicial: boolean;
  podeEditar: boolean;
  onSalvar: (texto: string, teste: boolean) => void;
  onPrevia: (texto: string, teste: boolean) => void;
  erro: string;
  ok?: string;
}

const AJUDA = 'Use "# " para título, "## " para subtítulo, "- " para item, **texto** para negrito e uma linha em branco entre parágrafos.';

export function ModeloContratoEditor({ campos, textoInicial, testeInicial, podeEditar, onSalvar, onPrevia, erro, ok }: EditorProps) {
  const [texto, setTexto] = useState(textoInicial);
  const [teste, setTeste] = useState(testeInicial);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setTexto(textoInicial);
    setTeste(testeInicial);
  }, [textoInicial, testeInicial]);

  function inserir(chave: string) {
    const marcador = chave.startsWith('se ') ? `{${chave}}\n\n{fim}` : `{${chave}}`;
    const el = area.current;
    const ini = el?.selectionStart ?? texto.length;
    const fim = el?.selectionEnd ?? texto.length;
    const novo = texto.slice(0, ini) + marcador + texto.slice(fim);
    setTexto(novo);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + marcador.length, ini + marcador.length);
    });
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_16rem]">
      <div className="space-y-2">
        <label htmlFor="texto-modelo" className="text-sm font-medium">Texto do contrato</label>
        <p className="text-xs text-slate-500">{AJUDA}</p>
        <textarea
          id="texto-modelo"
          ref={area}
          value={texto}
          disabled={!podeEditar}
          onChange={(e) => setTexto(e.target.value)}
          rows={18}
          className="w-full rounded border border-slate-300 p-2 font-mono text-sm disabled:bg-slate-100"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={teste} disabled={!podeEditar} onChange={(e) => setTeste(e.target.checked)} />
          Modelo de teste (não pode ser usado em produção)
        </label>
        <Aviso>{erro}</Aviso>
        <Aviso tipo="ok">{ok}</Aviso>
        <div className="flex gap-2">
          <Botao variante="secundario" disabled={!texto.trim()} onClick={() => onPrevia(texto, teste)}>Ver prévia</Botao>
          {podeEditar && <Botao disabled={!texto.trim()} onClick={() => onSalvar(texto, teste)}>Salvar nova versão</Botao>}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Campos (clique para inserir)</p>
        <ul className="max-h-[28rem] space-y-1 overflow-y-auto text-xs">
          {campos.map((c) => (
            <li key={c.chave}>
              <button
                type="button"
                disabled={!podeEditar}
                onClick={() => inserir(c.chave)}
                className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-left hover:border-sky-400 disabled:opacity-60"
              >
                <span className="block font-medium">{c.rotulo}</span>
                <span className="block text-slate-500">{`{${c.chave}}`}{c.exemplo ? ` · ex.: ${c.exemplo}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Modelo de contrato do convênio: versão ativa, histórico, edição e prévia. */
export function ModeloContrato({ convenioId, podeEditar }: { convenioId: string; podeEditar: boolean }) {
  const campos = useConsulta(['modelo-campos'], async () => ((await exigir(supabase.rpc('modelo_campos'))) ?? []) as CampoModelo[]);
  const versoes = useConsulta(['modelos', convenioId], async () =>
    (await exigir(supabase.from('contrato_modelos').select('id, versao, texto, teste, ativo, criado_em')
      .eq('convenio_id', convenioId).order('versao', { ascending: false }))) ?? [],
  );
  const [ok, setOk] = useState('');
  const [erroPrevia, setErroPrevia] = useState('');
  const salvar = useAcao(
    ({ texto, teste }: { texto: string; teste: boolean }) =>
      exigir(supabase.rpc('salvar_modelo_contrato', { p_convenio_id: convenioId, p_texto: texto, p_teste: teste })),
    [['modelos', convenioId]],
  );
  const ativo = (versoes.data ?? []).find((v) => v.ativo);

  async function previa(texto: string, teste: boolean) {
    setErroPrevia('');
    try {
      abrirPdf(await chamarAssinatura({ acao: 'previa', texto, teste }));
    } catch (e) {
      setErroPrevia(mensagemErro(e));
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="font-medium">
        Modelo do contrato{' '}
        <span className="text-sm font-normal text-slate-500">
          {ativo ? `versão ${ativo.versao}${ativo.teste ? ' (de teste)' : ''} em uso` : 'nenhum modelo cadastrado'}
        </span>
      </h2>
      <ModeloContratoEditor
        campos={campos.data ?? []}
        textoInicial={ativo?.texto ?? ''}
        testeInicial={ativo?.teste ?? true}
        podeEditar={podeEditar}
        erro={salvar.erro || erroPrevia}
        ok={ok}
        onPrevia={previa}
        onSalvar={(texto, teste) => {
          setOk('');
          salvar.mutate({ texto, teste }, { onSuccess: (v) => setOk(`Versão ${v} salva e em uso.`) });
        }}
      />
      {(versoes.data ?? []).length > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-sky-800">Versões anteriores</summary>
          <ul className="mt-2 space-y-2">
            {(versoes.data ?? []).filter((v) => !v.ativo).map((v) => (
              <li key={v.id} className="rounded border border-slate-200 bg-white p-2">
                <p className="text-xs text-slate-500">
                  Versão {v.versao}{v.teste ? ' (de teste)' : ''} · {new Date(v.criado_em).toLocaleString('pt-BR')}
                </p>
                <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs">{v.texto}</pre>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
