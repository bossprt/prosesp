import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Aviso, Botao, Pagina, Tabela } from '../../components/ui';
import type { Json } from '../../lib/database.types';
import { exigir, useConsulta } from '../../lib/dados';
import { mensagemErro } from '../../lib/erros';
import { supabase } from '../../lib/supabase';
import { ABAS, type DadosImportacao } from './colunas';
import {
  conferirArquivo, dividirEmLotes, gerarModelo, hashArquivo, lerPlanilha, planilhaDeErros, separarComErro,
} from './planilha';
import { PreviaImportacao, resultadoDeErros, somarResultados, textoLinha, totais, type Resultado } from './PreviaImportacao';

const LIMITE_BYTES = 10 * 1024 * 1024;
const LIMITE_LINHAS = 50000;
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function baixar(buf: ArrayBuffer, nome: string) {
  const url = URL.createObjectURL(new Blob([buf], { type: TIPO_XLSX }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Arquivo {
  nome: string;
  buffer: ArrayBuffer;
  hash: string;
  lotes: DadosImportacao[];
  local: Resultado; // erros achados no navegador
  posicao: string;
}

export function ImportacaoPage() {
  const qc = useQueryClient();
  const [arq, setArq] = useState<Arquivo | null>(null);
  const [previa, setPrevia] = useState<Resultado | null>(null);
  const [gravado, setGravado] = useState<Resultado | null>(null);
  const [progresso, setProgresso] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const historico = useConsulta(['importacoes'], async () => {
    const lista = (await exigir(
      supabase.from('importacoes').select('id, arquivo_nome, criado_em, situacao, resumo, usuario_id')
        .order('criado_em', { ascending: false }).limit(50),
    )) ?? [];
    const ids = [...new Set(lista.map((i) => i.usuario_id).filter(Boolean))] as string[];
    const nomes = ids.length
      ? new Map(((await exigir(supabase.from('usuarios').select('id, nome').in('id', ids))) ?? []).map((u) => [u.id, u.nome]))
      : new Map<string, string>();
    return lista.map((i) => ({ ...i, quem: nomes.get(i.usuario_id ?? '') ?? '' }));
  });

  async function enviar(file: File) {
    setErro('');
    setPrevia(null);
    setGravado(null);
    setArq(null);
    if (file.size > LIMITE_BYTES) return setErro('Arquivo maior que 10 MB. Divida a planilha.');
    setOcupado(true);
    try {
      setProgresso('Lendo a planilha…');
      const buffer = await file.arrayBuffer();
      const { dados, errosLeitura } = await lerPlanilha(buffer);
      if (errosLeitura.length) return setErro(errosLeitura.map(textoLinha).join(' '));
      if (ABAS.reduce((s, a) => s + dados[a.chave].length, 0) > LIMITE_LINHAS) {
        return setErro('Planilha com mais de 50 mil linhas. Divida em arquivos menores.');
      }
      const { limpos, erros } = separarComErro(dados, conferirArquivo(dados));
      const lotes = dividirEmLotes(limpos);
      const hash = await hashArquivo(buffer);
      const rs: Resultado[] = [];
      for (const [i, lote] of lotes.entries()) {
        setProgresso(`Conferindo lote ${i + 1} de ${lotes.length}…`);
        const r = await exigir(supabase.rpc('importacao_conferir', {
          p_dados: lote as unknown as Json, ...(i === 0 ? { p_hash: hash } : {}),
        }));
        rs.push(r as unknown as Resultado);
      }
      const local = resultadoDeErros(erros);
      setArq({ nome: file.name, buffer, hash, lotes, local, posicao: dados.posicao! });
      setPrevia(somarResultados([local, ...rs]));
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
      setProgresso('');
    }
  }

  async function gravar() {
    if (!arq) return;
    setErro('');
    setOcupado(true);
    try {
      setProgresso('Guardando o arquivo original…');
      const caminho = `${crypto.randomUUID()}/${arq.nome}`;
      const { error: eUp } = await supabase.storage.from('importacoes').upload(caminho, new Blob([arq.buffer], { type: TIPO_XLSX }));
      if (eUp) throw eUp;
      const id = (await exigir(supabase.rpc('importacao_iniciar', {
        p_arquivo_nome: arq.nome, p_arquivo_caminho: caminho, p_hash: arq.hash, p_posicao: arq.posicao,
      }))) as string;
      const rs: Resultado[] = [];
      for (const [i, lote] of arq.lotes.entries()) {
        setProgresso(`Gravando lote ${i + 1} de ${arq.lotes.length}…`);
        rs.push((await exigir(supabase.rpc('importacao_gravar_lote', {
          p_importacao_id: id, p_dados: lote as unknown as Json,
        }))) as unknown as Resultado);
      }
      const total = somarResultados([arq.local, ...rs]);
      await exigir(supabase.rpc('importacao_concluir', {
        p_importacao_id: id, p_resumo: total.resumo as unknown as Json, p_erros: total.erros as unknown as Json,
      }));
      setGravado(total);
      setPrevia(null);
    } catch (e) {
      setErro(`${mensagemErro(e)} Se parte já foi gravada, ela aparece no histórico abaixo: envie o arquivo de novo (o que entrou é pulado) ou use Desfazer.`);
    } finally {
      await qc.invalidateQueries({ queryKey: ['importacoes'] });
      setOcupado(false);
      setProgresso('');
    }
  }

  async function desfazer(id: string, nome: string) {
    if (!confirm(`Desfazer a importação de ${nome}? Os dados criados por ela serão apagados.`)) return;
    setErro('');
    try {
      await exigir(supabase.rpc('desfazer_importacao', { p_id: id }));
      await qc.invalidateQueries({ queryKey: ['importacoes'] });
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Pagina
      titulo="Importar dados antigos"
      acoes={<Botao variante="secundario" onClick={async () => baixar(await gerarModelo(), 'modelo-importacao-prosesp.xlsx')}>
        Baixar modelo
      </Botao>}
    >
      <p className="text-sm text-slate-600">
        Preencha a planilha modelo e envie. Nada é gravado antes da conferência. Se um CPF tiver erro em qualquer linha,
        nenhum dado desse cliente entra; corrija e envie de novo (o que já entrou é pulado).
      </p>
      <label className="block">
        <span className="text-sm font-medium">Enviar planilha (.xlsx)</span>
        <input type="file" accept=".xlsx" disabled={ocupado} className="mt-1 block text-sm"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void enviar(f); }} />
      </label>
      {progresso && <Aviso tipo="info">{progresso}</Aviso>}
      <Aviso>{erro}</Aviso>
      {previa && <PreviaImportacao resultado={previa} onGravar={() => void gravar()} gravando={ocupado} />}
      {gravado && arq && (
        <div className="space-y-2">
          <Aviso tipo="ok">
            Importação gravada: {totais(gravado).entram} linhas entraram, {totais(gravado).fora} ficaram de fora.
          </Aviso>
          {gravado.erros.length > 0 && (
            <Botao variante="secundario"
              onClick={async () => baixar(await planilhaDeErros(arq.buffer, gravado.erros), `linhas-com-erro-${arq.nome}`)}>
              Baixar linhas com erro
            </Botao>
          )}
        </div>
      )}
      <h2 className="pt-4 font-semibold">Importações anteriores</h2>
      <Tabela colunas={['Data', 'Quem', 'Arquivo', 'Entraram', 'Situação', '']}>
        {(historico.data ?? []).map((i) => {
          const resumo = (i.resumo ?? {}) as Record<string, { novas: number }>;
          const entraram = Object.values(resumo).reduce((s, c) => s + (c?.novas ?? 0), 0);
          return (
            <tr key={i.id}>
              <td className="px-3 py-1.5">{new Date(i.criado_em).toLocaleString('pt-BR')}</td>
              <td className="px-3 py-1.5">{i.quem}</td>
              <td className="px-3 py-1.5">{i.arquivo_nome}</td>
              <td className="px-3 py-1.5">{entraram}</td>
              <td className="px-3 py-1.5">{{ em_andamento: 'Em andamento', gravada: 'Gravada', desfeita: 'Desfeita' }[i.situacao] ?? i.situacao}</td>
              <td className="px-3 py-1.5">
                {(i.situacao === 'gravada' || i.situacao === 'em_andamento') && (
                  <Botao variante="perigo" onClick={() => void desfazer(i.id, i.arquivo_nome)}>Desfazer</Botao>
                )}
              </td>
            </tr>
          );
        })}
      </Tabela>
    </Pagina>
  );
}
