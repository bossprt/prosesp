import { useState, type FormEvent } from 'react';
import { Aviso, Botao, Campo } from '../../components/ui';
import { soDigitos } from '../../lib/mascaras';

export interface DadosParceiro {
  nome: string;
  documento: string;
  tipo_pessoa: 'PF' | 'PJ';
  email: string | null;
  celular: string;
  whatsapp: string;
  recebe_mensalidades: boolean;
}

interface Props {
  inicial?: Partial<DadosParceiro>;
  onSalvar: (d: DadosParceiro) => Promise<unknown>;
}

export function ParceiroForm({ inicial, onSalvar }: Props) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [documento, setDocumento] = useState(inicial?.documento ?? '');
  const [email, setEmail] = useState(inicial?.email ?? '');
  const [celular, setCelular] = useState(inicial?.celular ?? '');
  const [whatsapp, setWhatsapp] = useState(inicial?.whatsapp ?? '');
  const [recebe, setRecebe] = useState(inicial?.recebe_mensalidades ?? false);
  const [erro, setErro] = useState('');

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    const doc = soDigitos(documento);
    if (!nome.trim()) return setErro('Informe o nome.');
    if (doc.length !== 11 && doc.length !== 14) return setErro('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).');
    const cel = soDigitos(celular);
    const wpp = soDigitos(whatsapp);
    if (cel.length < 10 || wpp.length < 10) return setErro('Celular e WhatsApp precisam de DDD e número.');
    try {
      await onSalvar({
        nome: nome.trim(),
        documento: doc,
        tipo_pessoa: doc.length === 11 ? 'PF' : 'PJ',
        email: email.trim() || null,
        celular: cel,
        whatsapp: wpp,
        recebe_mensalidades: recebe,
      });
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  return (
    <form onSubmit={salvar} className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      <Campo rotulo="CPF ou CNPJ" value={documento} onChange={(e) => setDocumento(e.target.value)} />
      <Campo rotulo="E-mail" type="email" value={email ?? ''} onChange={(e) => setEmail(e.target.value)} />
      <Campo rotulo="Celular" value={celular} onChange={(e) => setCelular(e.target.value)} />
      <Campo rotulo="WhatsApp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={recebe} onChange={(e) => setRecebe(e.target.checked)} />
        Recebe as comissões de mensalidade
      </label>
      <div className="space-y-2 sm:col-span-2">
        <Aviso>{erro}</Aviso>
        <Botao type="submit">Salvar parceiro</Botao>
      </div>
    </form>
  );
}
