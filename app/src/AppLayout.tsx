import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { Botao } from './components/ui';
import { useSessao } from './features/auth/sessao';
import { itensMenu } from './lib/permissoes';
import { supabase } from './lib/supabase';

export function AppLayout() {
  const { sessao, carregando, acesso, pode, ehParceiro } = useSessao();
  if (carregando) return <p className="p-6 text-sm">Carregando…</p>;
  if (!sessao) return <Navigate to="/login" replace />;
  if (!acesso) {
    return (
      <main className="space-y-3 p-6">
        <p>Seu acesso está desativado ou ainda não foi liberado. Fale com o administrador.</p>
        <Botao variante="secundario" onClick={() => supabase.auth.signOut()}>
          Sair
        </Botao>
      </main>
    );
  }
  const itens = itensMenu(pode, ehParceiro);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav className="border-b border-slate-200 bg-white md:w-56 md:border-b-0 md:border-r">
        <div className="px-4 py-3 font-semibold text-sky-800">PROSESP</div>
        <ul className="flex flex-wrap gap-1 px-2 pb-2 md:flex-col">
          {itens.map((i) => (
            <li key={i.rota}>
              <NavLink
                to={i.rota}
                className={({ isActive }) =>
                  `block rounded px-3 py-1.5 text-sm ${isActive ? 'bg-sky-100 text-sky-900' : 'hover:bg-slate-100'}`
                }
              >
                {i.rotulo}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex-1">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm">
          <span>
            {acesso.nome} · <span className="text-slate-500">{acesso.perfil}</span>
          </span>
          <Botao variante="secundario" onClick={() => supabase.auth.signOut()}>
            Sair
          </Botao>
        </header>
        <main className="p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Página inicial: leva para o primeiro item do menu. */
export function Inicio() {
  const { pode, ehParceiro } = useSessao();
  const primeiro = itensMenu(pode, ehParceiro)[0];
  return primeiro ? <Navigate to={primeiro.rota} replace /> : <p>Nenhuma área liberada para o seu perfil.</p>;
}
