import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout, Inicio } from './AppLayout';
import { LoginPage } from './features/auth/LoginPage';
import { RedefinirSenhaPage } from './features/auth/RedefinirSenhaPage';
import { rotasProtegidas } from './rotas';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<Inicio />} />
          {rotasProtegidas.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
          <Route path="*" element={<p>Página não encontrada.</p>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
