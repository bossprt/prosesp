import { useEffect, useState, type FormEvent } from 'react';
import { Aviso, Botao, Campo, Pagina, Selecao, Tabela } from '../../components/ui';
import type { Tables } from '../../lib/database.types';
import { exigir, useAcao, useConsulta } from '../../lib/dados';
import { AssinaturaConfig } from './AssinaturaConfig';
import { ModeloContrato } from './ModeloContrato';
import { supabase } from '../../lib/supabase';
import { useSessao } from '../auth/sessao';

type Convenio = Tables<'convenios'>;

const NUMEROS = ['dia_vencimento', 'dia_corte', 'dias_prejuizo', 'prazo_min', 'prazo_max'] as const;

export function ConveniosPage() {
  const { pode } = useSessao();
  const podeEditar = pode('convenios.editar');
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const lista = useConsulta(['convenios'], () => exigir(supabase.from('convenios').select('*').order('nome')));
  const catalogo = useConsulta(['catalogo-campos'], () => exigir(supabase.rpc('catalogo_campos_cliente')));
  const atual = lista.data?.find((c) => c.id === selecionado) ?? null;

  const novo = useAcao(
    async (nome: string) => {
      const c = await exigir(supabase.from('convenios').insert({ nome }).select('id').single());
      if (c) setSelecionado(c.id);
    },
    [['convenios'], ['convenios-opcoes']],
  );
  const [nomeNovo, setNomeNovo] = useState('');

  return (
    <Pagina titulo="Convênios">
      <Tabela colunas={['Convênio', 'UF', 'Averbadora', 'Vencimento', 'Situação']}>
        {(lista.data ?? []).map((c) => (
          <tr
            key={c.id}
            onClick={() => setSelecionado(c.id)}
            className={`cursor-pointer hover:bg-slate-50 ${c.id === selecionado ? 'bg-sky-50' : ''}`}
          >
            <td className="px-3 py-2">{c.nome}</td>
            <td className="px-3 py-2">{c.uf ?? '—'}</td>
            <td className="px-3 py-2">{c.averbadora ?? '—'}</td>
            <td className="px-3 py-2">{c.dia_vencimento ? `dia ${c.dia_vencimento}` : '—'}</td>
            <td className="px-3 py-2">{c.ativo ? 'Ativo' : 'Inativo'}</td>
          </tr>
        ))}
      </Tabela>
      {podeEditar && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nomeNovo.trim()) novo.mutate(nomeNovo.trim(), { onSuccess: () => setNomeNovo('') });
          }}
        >
          <Campo rotulo="Novo convênio" value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} className="flex-1" />
          <Botao type="submit">Cadastrar</Botao>
        </form>
      )}
      <Aviso>{novo.erro}</Aviso>
      {atual && (
        <ConvenioDetalhe
          key={atual.id}
          convenio={atual}
          catalogo={catalogo.data ?? []}
          podeEditar={podeEditar}
        />
      )}
    </Pagina>
  );
}

function ConvenioDetalhe({
  convenio,
  catalogo,
  podeEditar,
}: {
  convenio: Convenio;
  catalogo: { chave: string; rotulo: string }[];
  podeEditar: boolean;
}) {
  const [f, setF] = useState(convenio);
  useEffect(() => setF(convenio), [convenio]);
  const vinculos = useConsulta(['vinculos', convenio.id], () =>
    exigir(supabase.from('convenio_vinculos').select('*').eq('convenio_id', convenio.id).order('nome')),
  );
  const salvar = useAcao(
    (dados: Partial<Convenio>) => exigir(supabase.from('convenios').update(dados).eq('id', convenio.id)),
    [['convenios'], ['convenios-opcoes']],
  );
  const novoVinculo = useAcao(
    (nome: string) => exigir(supabase.from('convenio_vinculos').insert({ convenio_id: convenio.id, nome })),
    [['vinculos', convenio.id], ['convenios-opcoes']],
  );
  const [vinculo, setVinculo] = useState('');
  const [ok, setOk] = useState('');

  const texto = (k: keyof Convenio) => ({
    value: (f[k] as string | null) ?? '',
    disabled: !podeEditar,
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value || null }),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setOk('');
    const dados: Partial<Convenio> = {
      nome: f.nome, uf: f.uf, ente: f.ente, ativo: f.ativo, averbadora: f.averbadora,
      ade_regex: f.ade_regex, ade_descricao: f.ade_descricao, ade_modo: f.ade_modo,
      margem_percentual: f.margem_percentual, campos_obrigatorios: f.campos_obrigatorios,
    };
    for (const k of NUMEROS) {
      const v = f[k] as unknown;
      (dados as Record<string, unknown>)[k] = v === null || v === '' ? null : Number(v);
    }
    salvar.mutate(dados, { onSuccess: () => setOk('Convênio salvo.') });
  }

  const marcados = new Set(f.campos_obrigatorios);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <form onSubmit={enviar} className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:col-span-2">
        <h2 className="font-medium sm:col-span-2">Configuração: {convenio.nome}</h2>
        <Campo rotulo="Nome" {...texto('nome')} />
        <Campo rotulo="UF" maxLength={2} {...texto('uf')} />
        <Campo rotulo="Ente (Estado, Município…)" {...texto('ente')} />
        <Campo rotulo="Averbadora" {...texto('averbadora')} />
        <Campo rotulo="Formato do ADE (expressão)" placeholder="ex.: ^\d{8}$" {...texto('ade_regex')} />
        <Campo rotulo="Formato do ADE (explicação)" placeholder="ex.: 8 números" {...texto('ade_descricao')} />
        <Selecao
          rotulo="Digitação do ADE"
          vazio="—"
          value={f.ade_modo}
          disabled={!podeEditar}
          onChange={(e) => setF({ ...f, ade_modo: e.target.value })}
          opcoes={[
            { valor: 'seguro', rotulo: 'Seguro: digitar 2 vezes, sem colar' },
            { valor: 'rapido', rotulo: 'Rápido: um campo, pode colar' },
          ]}
        />
        <Campo rotulo="Margem (%)" inputMode="decimal" {...texto('margem_percentual')} />
        <Campo rotulo="Dia de vencimento" inputMode="numeric" {...texto('dia_vencimento')} />
        <Campo rotulo="Dia de corte" inputMode="numeric" {...texto('dia_corte')} />
        <Campo rotulo="Dias para sugerir prejuízo" inputMode="numeric" {...texto('dias_prejuizo')} />
        <Campo rotulo="Prazo mínimo (meses)" inputMode="numeric" {...texto('prazo_min')} />
        <Campo rotulo="Prazo máximo (meses)" inputMode="numeric" {...texto('prazo_max')} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.ativo} disabled={!podeEditar} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
          Convênio ativo
        </label>
        <fieldset className="space-y-1 sm:col-span-2">
          <legend className="text-sm font-medium">Exigências do cadastro do cliente</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {catalogo.map((c) => (
              <label key={c.chave} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!podeEditar}
                  checked={marcados.has(c.chave)}
                  onChange={(e) =>
                    setF({
                      ...f,
                      campos_obrigatorios: e.target.checked
                        ? [...f.campos_obrigatorios, c.chave]
                        : f.campos_obrigatorios.filter((x) => x !== c.chave),
                    })
                  }
                />
                {c.rotulo}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-2 sm:col-span-2">
          <Aviso>{salvar.erro}</Aviso>
          <Aviso tipo="ok">{ok}</Aviso>
          {podeEditar && <Botao type="submit">Salvar configuração</Botao>}
        </div>
      </form>

      <div className="space-y-2">
        <h2 className="font-medium">Vínculos</h2>
        <ul className="divide-y divide-slate-100 rounded border border-slate-200 bg-white text-sm">
          {(vinculos.data ?? []).map((v) => (
            <li key={v.id} className="px-3 py-2">
              {v.nome}
            </li>
          ))}
        </ul>
        <Aviso>{novoVinculo.erro}</Aviso>
        {podeEditar && (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (vinculo.trim()) novoVinculo.mutate(vinculo.trim(), { onSuccess: () => setVinculo('') });
            }}
          >
            <Campo rotulo="Novo vínculo" value={vinculo} onChange={(e) => setVinculo(e.target.value)} className="flex-1" />
            <Botao type="submit">Adicionar</Botao>
          </form>
        )}
      </div>
      <AssinaturaConfig convenio={convenio} podeEditar={podeEditar} />
      <ModeloContrato convenioId={convenio.id} podeEditar={podeEditar} />
    </div>
  );
}
