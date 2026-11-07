import { useState } from 'react';
import { Aviso, Botao, Selecao, Tabela } from '../../components/ui';
import { formatarCpf } from '../../lib/mascaras';
import { SITUACOES, reais, rotuloSituacao, type LinhaConferida, type ResumoRetorno } from './comum';

/** Contagens e somas por situação, com tabela filtrável das linhas conferidas. */
export function PreviaRetorno({ resumo, linhas, onGravar, gravando, avisos = [] }: {
  resumo: ResumoRetorno;
  linhas: LinhaConferida[];
  onGravar: () => void;
  gravando: boolean;
  avisos?: string[];
}) {
  const [filtro, setFiltro] = useState('');
  const total = linhas.length;
  const visiveis = filtro ? linhas.filter((l) => l.situacao === filtro) : linhas;
  const presentes = SITUACOES.filter((s) => resumo[s.valor]);
  return (
    <div className="space-y-3">
      {avisos.map((a) => <Aviso key={a} tipo="info">{a}</Aviso>)}
      <p className="text-sm">
        {total === 0 ? 'O arquivo não tem nenhuma linha para importar.' : `O arquivo tem ${total} ${total === 1 ? 'linha' : 'linhas'}.`}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {presentes.map((s) => (
          <li key={s.valor} className="rounded border border-slate-200 bg-white p-2 text-sm">
            <p className="font-medium">{s.rotulo}</p>
            <p>{resumo[s.valor].qtd} {resumo[s.valor].qtd === 1 ? 'linha' : 'linhas'} · {reais(resumo[s.valor].soma)}</p>
          </li>
        ))}
      </ul>
      <Selecao rotulo="Mostrar só" vazio="Todas as situações" value={filtro} onChange={(e) => setFiltro(e.target.value)}
        opcoes={presentes.map((s) => ({ valor: s.valor, rotulo: s.rotulo }))} className="max-w-xs" />
      {visiveis.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma linha nesta situação.</p>
      ) : (
        <Tabela colunas={['Linha', 'ADE', 'Cliente', 'CPF', 'Valor', 'Situação', 'Motivo']}>
          {visiveis.map((l) => (
            <tr key={l.linha}>
              <td className="px-3 py-1.5">{l.linha}</td>
              <td className="px-3 py-1.5">{l.ade ?? '—'}</td>
              <td className="px-3 py-1.5">{l.cliente ?? l.nome ?? '—'}</td>
              <td className="px-3 py-1.5">{l.cpf ? formatarCpf(l.cpf) : '—'}</td>
              <td className="px-3 py-1.5">{reais(l.valor)}</td>
              <td className="px-3 py-1.5">{rotuloSituacao(l.situacao)}</td>
              <td className="px-3 py-1.5">{l.motivo ?? ''}</td>
            </tr>
          ))}
        </Tabela>
      )}
      <Botao onClick={onGravar} disabled={gravando || total === 0}>{gravando ? 'Gravando…' : 'Gravar retorno'}</Botao>
    </div>
  );
}
