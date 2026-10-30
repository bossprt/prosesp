import { useState } from 'react';
import { Botao, Tabela } from '../../components/ui';
import { ABAS, type ErroLinha } from './colunas';

export interface Contagem {
  novas: number;
  existentes: number;
  erros: number;
}
export interface Resultado {
  resumo: Record<string, Contagem>;
  erros: ErroLinha[];
  avisos: ErroLinha[];
}

export function resultadoVazio(): Resultado {
  return {
    resumo: Object.fromEntries(ABAS.map((a) => [a.nome, { novas: 0, existentes: 0, erros: 0 }])),
    erros: [],
    avisos: [],
  };
}

/** Erros achados no navegador (arquivo) no mesmo formato do banco. */
export function resultadoDeErros(erros: ErroLinha[]): Resultado {
  const r = resultadoVazio();
  r.erros = erros;
  for (const e of erros) if (r.resumo[e.aba]) r.resumo[e.aba].erros += 1;
  return r;
}

export function somarResultados(rs: Resultado[]): Resultado {
  const total = resultadoVazio();
  for (const r of rs) {
    for (const [aba, c] of Object.entries(r.resumo)) {
      const t = (total.resumo[aba] ??= { novas: 0, existentes: 0, erros: 0 });
      t.novas += c.novas;
      t.existentes += c.existentes;
      t.erros += c.erros;
    }
    total.erros.push(...r.erros);
    total.avisos.push(...r.avisos);
  }
  const ordem = (aba: string) => (aba === 'Arquivo' ? -1 : ABAS.findIndex((a) => a.nome === aba));
  const ordenar = (x: ErroLinha, y: ErroLinha) => ordem(x.aba) - ordem(y.aba) || x.linha - y.linha;
  total.erros.sort(ordenar);
  total.avisos.sort(ordenar);
  return total;
}

export const textoLinha = (e: ErroLinha) => (e.linha > 0 ? `Aba ${e.aba}, linha ${e.linha}: ${e.mensagem}` : e.mensagem);

export function totais(r: Resultado) {
  const entram = Object.values(r.resumo).reduce((s, c) => s + c.novas, 0);
  const fora = new Set(r.erros.map((e) => `${e.aba}|${e.linha}`)).size;
  return { entram, fora };
}

export function PreviaImportacao({
  resultado, onGravar, gravando, rotuloGravar = 'Gravar',
}: { resultado: Resultado; onGravar: () => void; gravando: boolean; rotuloGravar?: string }) {
  const [filtro, setFiltro] = useState('');
  const { entram, fora } = totais(resultado);
  const erros = resultado.erros.filter((e) => !filtro || e.aba === filtro);
  return (
    <div className="space-y-3">
      <Tabela colunas={['Aba', 'Novas', 'Já existem', 'Com erro']}>
        {Object.entries(resultado.resumo).map(([aba, c]) => (
          <tr key={aba}>
            <td className="px-3 py-1.5">{aba}</td>
            <td className="px-3 py-1.5">{c.novas}</td>
            <td className="px-3 py-1.5">{c.existentes}</td>
            <td className="px-3 py-1.5">{c.erros}</td>
          </tr>
        ))}
      </Tabela>
      <p className="font-medium">
        {entram} {entram === 1 ? 'linha entra' : 'linhas entram'}, {fora} {fora === 1 ? 'fica' : 'ficam'} de fora.
      </p>
      {resultado.avisos.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
          <p className="font-medium">Avisos (não impedem a gravação)</p>
          <ul className="list-disc pl-5">
            {resultado.avisos.map((a, i) => (
              <li key={i}>{textoLinha(a)}</li>
            ))}
          </ul>
        </div>
      )}
      {resultado.erros.length > 0 && (
        <div className="space-y-1 rounded border border-red-300 bg-red-50 p-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">Linhas que ficam de fora</p>
            <select aria-label="Filtrar por aba" value={filtro} onChange={(e) => setFiltro(e.target.value)}
              className="rounded border border-slate-300 px-1 py-0.5 text-sm">
              <option value="">Todas as abas</option>
              {[...new Set(resultado.erros.map((e) => e.aba))].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <ul className="max-h-72 list-disc overflow-y-auto pl-5">
            {erros.map((e, i) => (
              <li key={i}>{textoLinha(e)}</li>
            ))}
          </ul>
        </div>
      )}
      <Botao onClick={onGravar} disabled={gravando || entram === 0}>
        {gravando ? 'Gravando…' : rotuloGravar}
      </Botao>
    </div>
  );
}
