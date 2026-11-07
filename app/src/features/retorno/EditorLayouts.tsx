import { useState } from 'react';
import { Aviso, Botao, Campo } from '../../components/ui';
import {
  CAMPOS_REMESSA, CAMPOS_RETORNO, LAYOUT_ACRE_REMESSA, LAYOUT_ACRE_RETORNO, validarLayoutRetorno,
  type CampoRemessa, type CampoRetorno, type LayoutRemessa, type LayoutRetorno,
} from './arquivo';

interface ColunaRemessa { id: number; titulo: string; campo: CampoRemessa }
let proximoId = 1;
const comId = (c: LayoutRemessa['colunas']): ColunaRemessa[] => c.map((x) => ({ ...x, id: proximoId++ }));

function lerRetorno(l: unknown): { colunas: Partial<Record<CampoRetorno, string>>; cabecalho: string } {
  const o = (l && typeof l === 'object' ? l : {}) as Partial<LayoutRetorno>;
  return { colunas: { ...(o.colunas ?? {}) }, cabecalho: String(o.linha_cabecalho ?? 1) };
}

function lerRemessa(l: unknown): ColunaRemessa[] {
  const o = (l && typeof l === 'object' ? l : {}) as Partial<LayoutRemessa>;
  return comId(Array.isArray(o.colunas) ? o.colunas : []);
}

/** Editor do layout do arquivo de retorno e da remessa de um convênio. */
export function EditorLayouts({ layoutRetorno, layoutRemessa, podeEditar, onSalvar, erro, ok, salvando }: {
  layoutRetorno: unknown;
  layoutRemessa: unknown;
  podeEditar: boolean;
  onSalvar: (retorno: LayoutRetorno, remessa: LayoutRemessa) => void;
  erro?: string;
  ok?: string;
  salvando?: boolean;
}) {
  const [ret, setRet] = useState(() => lerRetorno(layoutRetorno));
  const [rem, setRem] = useState<ColunaRemessa[]>(() => lerRemessa(layoutRemessa));
  const [problemas, setProblemas] = useState<string[]>([]);

  function usarModeloAcre() {
    setRet(lerRetorno(LAYOUT_ACRE_RETORNO));
    setRem(lerRemessa(LAYOUT_ACRE_REMESSA));
    setProblemas([]);
  }

  function mover(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= rem.length) return;
    const n = [...rem];
    [n[i], n[j]] = [n[j], n[i]];
    setRem(n);
  }

  function salvar() {
    const colunas: Partial<Record<CampoRetorno, string>> = {};
    for (const [k, v] of Object.entries(ret.colunas)) if (v && v.trim()) colunas[k as CampoRetorno] = v.trim();
    const cab = Number(ret.cabecalho);
    const layoutR: LayoutRetorno = { versao: 1, colunas, linha_cabecalho: Number.isInteger(cab) && cab >= 1 ? cab : 1 };
    const erros = validarLayoutRetorno(layoutR);
    if (rem.some((c) => !c.titulo.trim())) erros.push('Dê um título para cada coluna da remessa.');
    setProblemas(erros);
    if (erros.length) return;
    onSalvar(layoutR, { versao: 1, colunas: rem.map((c) => ({ titulo: c.titulo.trim(), campo: c.campo })) });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Retorno e remessa</h2>
        {podeEditar && <Botao variante="secundario" onClick={usarModeloAcre}>Usar modelo do Governo do Acre</Botao>}
      </div>

      <fieldset className="space-y-2 rounded border border-slate-200 bg-white p-3">
        <legend className="px-1 text-sm font-medium">Arquivo de retorno (o que a folha devolve)</legend>
        <p className="text-sm text-slate-600">
          Para cada informação, escreva o nome da coluna como aparece no arquivo. Só o ADE e o valor são obrigatórios.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CAMPOS_RETORNO.map((c) => (
            <Campo
              key={c.campo}
              rotulo={`${c.rotulo}${c.obrigatorio ? ' *' : ''}`}
              disabled={!podeEditar}
              value={ret.colunas[c.campo] ?? ''}
              onChange={(e) => setRet({ ...ret, colunas: { ...ret.colunas, [c.campo]: e.target.value } })}
            />
          ))}
          <Campo
            rotulo="Linha do cabeçalho"
            inputMode="numeric"
            disabled={!podeEditar}
            value={ret.cabecalho}
            onChange={(e) => setRet({ ...ret, cabecalho: e.target.value.replace(/\D/g, '') })}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-2 rounded border border-slate-200 bg-white p-3">
        <legend className="px-1 text-sm font-medium">Arquivo de remessa (o que enviamos à folha)</legend>
        <p className="text-sm text-slate-600">As colunas saem na ordem abaixo. Se ficar vazio, usamos um modelo simples.</p>
        {rem.length === 0 && <p className="text-sm text-slate-500">Nenhuma coluna ainda.</p>}
        <ul className="space-y-2">
          {rem.map((c, i) => (
            <li key={c.id} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Campo
                rotulo={`Título da coluna ${i + 1}`}
                disabled={!podeEditar}
                value={c.titulo}
                onChange={(e) => setRem(rem.map((x) => (x.id === c.id ? { ...x, titulo: e.target.value } : x)))}
              />
              <div className="flex flex-col gap-1">
                <label htmlFor={`campo-${c.id}`} className="text-sm font-medium">Informação da coluna {i + 1}</label>
                <select
                  id={`campo-${c.id}`}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  disabled={!podeEditar}
                  value={c.campo}
                  onChange={(e) => setRem(rem.map((x) => (x.id === c.id ? { ...x, campo: e.target.value as CampoRemessa } : x)))}
                >
                  {CAMPOS_REMESSA.map((o) => <option key={o.campo} value={o.campo}>{o.rotulo}</option>)}
                </select>
              </div>
              {podeEditar && (
                <div className="flex gap-1">
                  <Botao variante="secundario" aria-label={`Subir coluna ${i + 1}`} disabled={i === 0} onClick={() => mover(i, -1)}>Subir</Botao>
                  <Botao variante="secundario" aria-label={`Descer coluna ${i + 1}`} disabled={i === rem.length - 1} onClick={() => mover(i, 1)}>Descer</Botao>
                  <Botao variante="secundario" aria-label={`Remover coluna ${i + 1}`} onClick={() => setRem(rem.filter((x) => x.id !== c.id))}>Remover</Botao>
                </div>
              )}
            </li>
          ))}
        </ul>
        {podeEditar && (
          <Botao variante="secundario" onClick={() => setRem([...rem, { id: proximoId++, titulo: '', campo: 'ade' }])}>
            Adicionar coluna
          </Botao>
        )}
      </fieldset>

      {problemas.length > 0 && (
        <Aviso>
          <ul className="list-disc pl-4">{problemas.map((p) => <li key={p}>{p}</li>)}</ul>
        </Aviso>
      )}
      <Aviso>{erro}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
      {podeEditar && <Botao onClick={salvar} disabled={salvando}>Salvar</Botao>}
    </div>
  );
}
