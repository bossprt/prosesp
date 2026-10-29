import { useState } from 'react';
import { Aviso, Botao, Campo, Pagina, Selecao } from '../../components/ui';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { vigenciaEncerrada } from '../../lib/faixas';
import { supabase } from '../../lib/supabase';
import { useSessao } from '../auth/sessao';
import { useConveniosOpcoes } from '../convenios/useConvenios';
import { LinhaForm, type NovaLinha } from './LinhaForm';
import { LinhasTabela, type LinhaView } from './LinhasTabela';

const hoje = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local

export function TabelasPage() {
  const { pode } = useSessao();
  const podeEditar = pode('tabelas.editar');
  const convenios = useConveniosOpcoes();
  const [convenioId, setConvenioId] = useState('');
  const [tabelaId, setTabelaId] = useState('');
  const [nomeTabela, setNomeTabela] = useState('');

  const tabelas = useConsulta(
    ['tabelas', convenioId],
    () => exigir(supabase.from('tabelas_calculo').select('id, nome').eq('convenio_id', convenioId).order('nome')),
    Boolean(convenioId),
  );

  const linhas = useConsulta(
    ['linhas', tabelaId],
    async (): Promise<LinhaView[]> => {
      const dados =
        (await exigir(
          supabase
            .from('tabela_linhas')
            .select('*, convenio_vinculos(nome), tabela_linha_comissoes(percentual, base)')
            .eq('tabela_id', tabelaId)
            .order('tipo')
            .order('prazo'),
        )) ?? [];
      const usadas = new Set(
        dados.length && podeEditar
          ? ((await exigir(supabase.rpc('linhas_usadas', { p_linha_ids: dados.map((d) => d.id) }))) ?? [])
          : [],
      );
      return dados.map((d) => ({
        id: d.id,
        vinculo: d.convenio_vinculos?.nome ?? '',
        tipo: d.tipo,
        prazo: d.prazo,
        faixa_valor: String(d.faixa_valor),
        faixa_idade: String(d.faixa_idade),
        vigencia: String(d.vigencia),
        fator: String(d.fator),
        percentual: d.tabela_linha_comissoes ? String(d.tabela_linha_comissoes.percentual) : null,
        base: d.tabela_linha_comissoes?.base ?? null,
        valor_mensalidade: d.valor_mensalidade === null ? null : String(d.valor_mensalidade),
        usada: usadas.has(d.id),
      }));
    },
    Boolean(tabelaId),
  );

  const novaTabela = useAcao(
    async (nome: string) => {
      const t = await exigir(supabase.from('tabelas_calculo').insert({ convenio_id: convenioId, nome }).select('id').single());
      if (t) setTabelaId(t.id);
    },
    [['tabelas', convenioId]],
  );
  const novaLinha = useAcao(
    (l: NovaLinha) =>
      exigir(
        supabase.rpc('criar_linha_tabela', {
          p_tabela_id: tabelaId,
          p_vinculo_id: l.vinculo_id,
          p_tipo: l.tipo,
          p_prazo: l.prazo,
          p_valor_min: l.valor_min as unknown as number,
          p_valor_max: l.valor_max as unknown as number,
          p_idade_min: l.idade_min as number,
          p_idade_max: l.idade_max as number,
          p_inicio: l.inicio,
          p_fim: l.fim as string,
          p_fator: l.fator as unknown as number,
          p_percentual: l.percentual as unknown as number,
          p_valor_mensalidade: l.valor_mensalidade as unknown as number,
        }),
      ),
    [['linhas', tabelaId]],
  );
  const encerrar = useAcao(
    (l: LinhaView) =>
      exigir(supabase.from('tabela_linhas').update({ vigencia: vigenciaEncerrada(l.vigencia, hoje()) }).eq('id', l.id)),
    [['linhas', tabelaId]],
  );
  const excluir = useAcao((id: string) => exigir(supabase.from('tabela_linhas').delete().eq('id', id)), [['linhas', tabelaId]]);

  const vinculos = convenios.data?.find((c) => c.id === convenioId)?.vinculos ?? [];

  return (
    <Pagina titulo="Tabelas de cálculo">
      <div className="grid gap-3 sm:grid-cols-3">
        <Selecao
          rotulo="Convênio"
          value={convenioId}
          onChange={(e) => (setConvenioId(e.target.value), setTabelaId(''))}
          opcoes={(convenios.data ?? []).map((c) => ({ valor: c.id, rotulo: c.nome }))}
        />
        <Selecao
          rotulo="Tabela"
          value={tabelaId}
          onChange={(e) => setTabelaId(e.target.value)}
          opcoes={(tabelas.data ?? []).map((t) => ({ valor: t.id, rotulo: t.nome }))}
        />
        {podeEditar && convenioId && (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (nomeTabela.trim()) novaTabela.mutate(nomeTabela.trim(), { onSuccess: () => setNomeTabela('') });
            }}
          >
            <Campo rotulo="Nova tabela" value={nomeTabela} onChange={(e) => setNomeTabela(e.target.value)} className="flex-1" />
            <Botao type="submit">Criar</Botao>
          </form>
        )}
      </div>
      <Aviso>{novaTabela.erro || encerrar.erro || excluir.erro}</Aviso>
      {tabelaId && (
        <>
          <LinhasTabela
            linhas={linhas.data ?? []}
            podeEditar={podeEditar}
            onEncerrar={(id) => {
              const l = linhas.data?.find((x) => x.id === id);
              if (l && confirm('Encerrar a vigência desta linha a partir de hoje?')) encerrar.mutate(l);
            }}
            onExcluir={(id) => confirm('Excluir esta linha?') && excluir.mutate(id)}
          />
          {podeEditar && <LinhaForm vinculos={vinculos} onSalvar={(l) => novaLinha.mutateAsync(l)} />}
        </>
      )}
    </Pagina>
  );
}
