import type { ReactElement } from 'react';
import { ApoioPage } from './features/apoio/ApoioPage';
import { AprovacoesPage } from './features/aprovacoes/AprovacoesPage';
import { AuditoriaPage } from './features/auditoria/AuditoriaPage';
import { ClienteEquipePage, ClientesPage } from './features/clientes/ClientesPage';
import { ConveniosPage } from './features/convenios/ConveniosPage';
import { ParceiroClientePage, ParceiroClientesPage } from './features/parceiro/ParceiroClientesPage';
import { ParceirosPage } from './features/parceiros/ParceirosPage';
import { SimuladorPage } from './features/simulador/SimuladorPage';
import { TabelasPage } from './features/tabelas/TabelasPage';
import { PermissoesPage } from './features/usuarios/PermissoesPage';
import { UsuariosPage } from './features/usuarios/UsuariosPage';

// Cada área é registrada aqui conforme é construída. O que cada um vê é decidido pelo banco (RLS).
export const rotasProtegidas: { path: string; element: ReactElement }[] = [
  { path: '/simulador', element: <SimuladorPage /> },
  { path: '/clientes', element: <ClientesPage /> },
  { path: '/clientes/:id', element: <ClienteEquipePage /> },
  { path: '/parceiro/clientes', element: <ParceiroClientesPage /> },
  { path: '/parceiro/clientes/:id', element: <ParceiroClientePage /> },
  { path: '/convenios', element: <ConveniosPage /> },
  { path: '/tabelas', element: <TabelasPage /> },
  { path: '/parceiros', element: <ParceirosPage /> },
  { path: '/apoio', element: <ApoioPage /> },
  { path: '/aprovacoes', element: <AprovacoesPage /> },
  { path: '/usuarios', element: <UsuariosPage /> },
  { path: '/permissoes', element: <PermissoesPage /> },
  { path: '/auditoria', element: <AuditoriaPage /> },
];
