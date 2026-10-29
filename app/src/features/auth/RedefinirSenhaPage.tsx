import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Aviso, Botao, Campo } from '../../components/ui';
import { mensagemErro } from '../../lib/erros';
import { supabase } from '../../lib/supabase';

/** Destino do link de convite: a própria pessoa define a senha. */
export function RedefinirSenhaPage() {
  const navigate = useNavigate();
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [erro, setErro] = useState('');

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (senha !== confirmar) return setErro('As duas senhas não são iguais.');
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) return setErro(mensagemErro(error));
    navigate('/', { replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={salvar} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-lg font-semibold">Defina a sua senha</h1>
        <Campo rotulo="Nova senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        <Campo
          rotulo="Repita a senha"
          type="password"
          autoComplete="new-password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
        />
        <Aviso>{erro}</Aviso>
        <Botao type="submit" className="w-full">
          Salvar senha
        </Botao>
      </form>
    </main>
  );
}
