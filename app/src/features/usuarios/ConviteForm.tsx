import { useState, type FormEvent } from 'react';
import { Aviso, Botao, Campo, Selecao } from '../../components/ui';
import type { Perfil } from '../../lib/permissoes';
import { PERFIS } from './GradePermissoes';

export interface DadosConvite {
  nome: string;
  email: string;
  perfil: Perfil;
  parceiro_id: string | null;
}

interface Props {
  parceiros: { id: string; nome: string }[];
  onConvidar: (d: DadosConvite) => Promise<unknown>;
}

export function ConviteForm({ parceiros, onConvidar }: Props) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [perfil, setPerfil] = useState('');
  const [parceiroId, setParceiroId] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setOk('');
    if (!nome.trim()) return setErro('Informe o nome.');
    if (!perfil) return setErro('Escolha o perfil.');
    if (perfil === 'parceiro' && !parceiroId) return setErro('Escolha o parceiro deste usuário.');
    setEnviando(true);
    try {
      await onConvidar({
        nome: nome.trim(),
        email: email.trim(),
        perfil: perfil as Perfil,
        parceiro_id: perfil === 'parceiro' ? parceiroId : null,
      });
      setOk(`Convite enviado para ${email.trim()}.`);
      setNome('');
      setEmail('');
      setPerfil('');
      setParceiroId('');
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      <Campo rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Selecao
        rotulo="Perfil"
        value={perfil}
        onChange={(e) => setPerfil(e.target.value)}
        opcoes={PERFIS.map((p) => ({ valor: p, rotulo: p }))}
      />
      {perfil === 'parceiro' && (
        <Selecao
          rotulo="Parceiro"
          value={parceiroId}
          onChange={(e) => setParceiroId(e.target.value)}
          opcoes={parceiros.map((p) => ({ valor: p.id, rotulo: p.nome }))}
        />
      )}
      <div className="space-y-2 sm:col-span-2">
        <Aviso>{erro}</Aviso>
        <Aviso tipo="ok">{ok}</Aviso>
        <Botao type="submit" disabled={enviando}>
          Enviar convite
        </Botao>
      </div>
    </form>
  );
}
