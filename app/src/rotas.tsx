import type { ReactElement } from 'react';
import { ApoioPage } from './features/apoio/ApoioPage';
import { ConveniosPage } from './features/convenios/ConveniosPage';
import { ParceirosPage } from './features/parceiros/ParceirosPage';
import { SimuladorPage } from './features/simulador/SimuladorPage';
import { TabelasPage } from './features/tabelas/TabelasPage';
import { PermissoesPage } from './features/usuarios/PermissoesPage';
import { UsuariosPage } from './features/usuarios/UsuariosPage';

// Cada área é registrada aqui conforme é construída.
export const rotasProtegidas: { path: string; element: ReactElement }[] = [
  { path: '/simulador', element: <SimuladorPage /> },
  { path: '/convenios', element: <ConveniosPage /> },
  { path: '/tabelas', element: <TabelasPage /> },
  { path: '/parceiros', element: <ParceirosPage /> },
  { path: '/apoio', element: <ApoioPage /> },
  { path: '/usuarios', element: <UsuariosPage /> },
  { path: '/permissoes', element: <PermissoesPage /> },
];
