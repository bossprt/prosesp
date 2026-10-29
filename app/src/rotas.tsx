import type { ReactElement } from 'react';
import { ApoioPage } from './features/apoio/ApoioPage';
import { ParceirosPage } from './features/parceiros/ParceirosPage';
import { PermissoesPage } from './features/usuarios/PermissoesPage';
import { UsuariosPage } from './features/usuarios/UsuariosPage';

// Cada área é registrada aqui conforme é construída.
export const rotasProtegidas: { path: string; element: ReactElement }[] = [
  { path: '/parceiros', element: <ParceirosPage /> },
  { path: '/apoio', element: <ApoioPage /> },
  { path: '/usuarios', element: <UsuariosPage /> },
  { path: '/permissoes', element: <PermissoesPage /> },
];
