import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Aviso, Botao, Campo } from '../../components/ui';
import { mensagemErro } from '../../lib/erros';
import { supabase } from '../../lib/supabase';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) {
        setErro('E-mail ou senha incorretos.');
        return;
      }
      await supabase.rpc('registrar_acesso', { p_acao: 'login', p_detalhe: {} });
      navigate('/', { replace: true });
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={entrar} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-lg font-semibold">PROSESP — Entrar</h1>
        <Campo rotulo="E-mail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Campo
          rotulo="Senha"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />
        <Aviso>{erro}</Aviso>
        <Botao type="submit" disabled={enviando} className="w-full">
          Entrar
        </Botao>
      </form>
    </main>
  );
}
