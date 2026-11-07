import { useState } from 'react';
import { Aviso, Botao, Campo, Pagina, Selecao } from '../../components/ui';
import { exigir, useConsulta } from '../../lib/dados';
import { mensagemErro } from '../../lib/erros';
import { supabase } from '../../lib/supabase';
import { useSessao } from '../auth/sessao';
import { useConveniosOpcoes } from '../convenios/useConvenios';
import { gerarRemessa, type LayoutRemessa, type LinhaRemessa } from './arquivo';
import { CartoesAdimplencia, type ResumoProduto } from './CartoesAdimplencia';
import { baixarArquivo, competenciaDeMes, type Produto } from './comum';
import {
  ListasAdimplencia, type AbaAdimplencia, type Ausente, type EmAtraso, type NaoDescontada, type TudoPago,
} from './ListasAdimplencia';

interface DadosAdimplencia {
  parcelas: ResumoProduto;
  mensalidades: ResumoProduto;
  em_atraso: EmAtraso[];
  tudo_pago: TudoPago[];
  nao_descontadas: NaoDescontada[];
}

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function AdimplenciaPage() {
  const { pode } = useSessao();
  const convenios = useConveniosOpcoes();
  const [convenioId, setConvenioId] = useState('');
  const [mes, setMes] = useState(mesAtual());
  const [aba, setAba] = useState<AbaAdimplencia>('nao_descontadas');
  const [produtoAusentes, setProdutoAusentes] = useState<Produto>('parcelas');
  const [produtoRemessa, setProdutoRemessa] = useState<Produto>('parcelas');
  const [erro, setErro] = useState('');
  const [baixando, setBaixando] = useState(false);
  const competencia = competenciaDeMes(mes);
  const pronto = Boolean(convenioId && competencia);

  const dados = useConsulta(['adimplencia', convenioId, competencia], async () =>
    (await exigir(supabase.rpc('adimplencia', { p_convenio_id: convenioId, p_competencia: competencia }))) as unknown as DadosAdimplencia,
  pronto);
  const ausentes = useConsulta(['adimplencia', 'ausentes', convenioId, competencia, produtoAusentes], async () =>
    ((await exigir(supabase.rpc('retorno_ausentes', {
      p_convenio_id: convenioId, p_produto: produtoAusentes, p_competencia: competencia,
    }))) ?? []) as unknown as Ausente[],
  pronto && aba === 'ausentes');

  async function baixarRemessa() {
    setErro('');
    setBaixando(true);
    try {
      const linhas = ((await exigir(supabase.rpc('remessa_dados', {
        p_convenio_id: convenioId, p_produto: produtoRemessa, p_competencia: competencia,
      }))) ?? []) as unknown as LinhaRemessa[];
      const c = await exigir(supabase.from('convenios').select('nome, layout_remessa').eq('id', convenioId).single());
      const buf = await gerarRemessa(linhas, (c?.layout_remessa ?? null) as unknown as LayoutRemessa | null);
      const nome = (c?.nome ?? 'CONVENIO').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
      const [ano, m] = mes.split('-');
      baixarArquivo(buf, `REMESSA_${nome}_${produtoRemessa.toUpperCase()}_${m}-${ano}.xlsx`);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setBaixando(false);
    }
  }

  const d = dados.data;
  return (
    <Pagina titulo="Adimplência">
      <div className="grid gap-3 sm:grid-cols-3">
        <Selecao rotulo="Convênio" value={convenioId} onChange={(e) => setConvenioId(e.target.value)}
          opcoes={(convenios.data ?? []).map((c) => ({ valor: c.id, rotulo: c.nome }))} />
        <Campo rotulo="Competência (mês da folha)" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
      </div>
      {!pronto && <p className="text-sm text-slate-500">Escolha o convênio e o mês para ver a adimplência.</p>}
      <Aviso>{erro || (dados.error ? 'Não foi possível carregar a adimplência.' : '')}</Aviso>
      {pronto && pode('retorno.importar') && (
        <div className="flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-white p-3">
          <Selecao rotulo="Remessa de" value={produtoRemessa} onChange={(e) => setProdutoRemessa(e.target.value as Produto)}
            opcoes={[{ valor: 'parcelas', rotulo: 'Parcelas dos contratos' }, { valor: 'mensalidades', rotulo: 'Mensalidades' }]} />
          <Botao onClick={() => void baixarRemessa()} disabled={baixando}>{baixando ? 'Gerando…' : 'Baixar remessa'}</Botao>
        </div>
      )}
      {pronto && d && (
        <>
          <CartoesAdimplencia parcelas={d.parcelas} mensalidades={d.mensalidades} />
          <ListasAdimplencia
            aba={aba} onAba={setAba}
            naoDescontadas={d.nao_descontadas ?? []} emAtraso={d.em_atraso ?? []} tudoPago={d.tudo_pago ?? []}
            ausentes={ausentes.data ?? []} produtoAusentes={produtoAusentes} onProdutoAusentes={setProdutoAusentes}
          />
        </>
      )}
    </Pagina>
  );
}
