import { useState } from 'react';
import { Aviso, Botao, Campo } from '../../components/ui';

export interface AlteracaoView {
  id: string;
  cliente: string;
  parceiro: string;
  tipo: string;
  proposta: Record<string, unknown>;
  atual: Record<string, unknown>;
  criado_em: string;
}

const TIPOS: Record<string, string> = { dados: 'Dados cadastrais', conta: 'Nova conta bancária', matricula: 'Nova matrícula' };
const txt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

interface Props {
  alteracao: AlteracaoView;
  onAprovar: (id: string) => Promise<unknown> | void;
  onRecusar: (id: string, motivo: string) => Promise<unknown> | void;
}

export function AlteracaoCard({ alteracao: a, onAprovar, onRecusar }: Props) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');

  return (
    <article className="space-y-3 rounded border border-slate-200 bg-white p-4">
      <header className="flex flex-wrap justify-between gap-2 text-sm">
        <span className="font-medium">
          {a.cliente} · {TIPOS[a.tipo] ?? a.tipo}
        </span>
        <span className="text-slate-500">
          Enviado por {a.parceiro} em {new Date(a.criado_em).toLocaleString('pt-BR')}
        </span>
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">Campo</th>
            <th className="py-1">Hoje</th>
            <th className="py-1">Proposto</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(a.proposta).map(([k, v]) => (
            <tr key={k}>
              <td className="py-1">{k}</td>
              <td className="py-1">{a.tipo === 'dados' ? txt(a.atual[k]) : '—'}</td>
              <td className="py-1 font-medium">{txt(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-end gap-2">
        <Campo rotulo="Motivo (para recusar)" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="flex-1" />
        <Botao
          variante="perigo"
          onClick={() => {
            if (!motivo.trim()) return setErro('Informe o motivo da recusa.');
            setErro('');
            onRecusar(a.id, motivo.trim());
          }}
        >
          Recusar
        </Botao>
        <Botao onClick={() => onAprovar(a.id)}>Aprovar</Botao>
      </div>
      <Aviso>{erro}</Aviso>
    </article>
  );
}
