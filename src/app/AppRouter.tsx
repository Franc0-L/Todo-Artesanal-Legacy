import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { AdminSectionPage } from "../features/admin/AdminSectionPage";
import { AdminLoginPage } from "../features/auth/AdminLoginPage";
import { useAuth } from "../features/auth/useAuth";
import { AdminShell } from "../features/admin/AdminShell";
import { ClientsPage } from "../features/clientes/ClientsPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { HistoryPage } from "../features/historial/HistoryPage";
import { MenusPage } from "../features/menus/MenusPage";
import { PlatosPage } from "../features/platos/PlatosPage";
import { SemanasPage } from "../features/semanas/SemanasPage";
import { PedidosPage } from "../features/pedidos/PedidosPage";
import { CancelacionesPage } from "../features/cancelaciones/CancelacionesPage";
import { resolveRoute } from "./routes";

function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}
function getLocation() {
  return window.location.pathname;
}
function getServerLocation() {
  return "/";
}

type AdminPath = Extract<
  ReturnType<typeof resolveRoute>,
  { kind: "admin" }
>["path"];

function AdminRoute({ path }: { path: AdminPath }) {
  const { status, error } = useAuth();
  if (status === "loading")
    return <main aria-busy="true">Cargando sesión…</main>;
  if (status === "signed-out") return <AdminLoginPage />;
  if (status === "forbidden" || status === "error")
    return (
      <main>
        <h1>No se puede acceder al área administrativa</h1>
        <p role="alert">
          {error ?? "Ocurrió un error al verificar la sesión."}
        </p>
      </main>
    );

  let content: ReactNode;
  switch (path) {
    case "/admin":
      content = <DashboardPage />;
      break;
    case "/admin/clientes":
      content = <ClientsPage />;
      break;
    case "/admin/platos":
      content = <PlatosPage />;
      break;
    case "/admin/menus":
      content = <MenusPage />;
      break;
    case "/admin/semanas":
      content = <SemanasPage />;
      break;
    case "/admin/pedidos":
      content = <PedidosPage />;
      break;
    case "/admin/cancelaciones":
      content = <CancelacionesPage />;
      break;
    case "/admin/historial":
      content = <HistoryPage />;
      break;
    default:
      content = <AdminSectionPage path={path} />;
  }
  return <AdminShell currentPath={path}>{content}</AdminShell>;
}

export function AppRouter() {
  const pathname = useSyncExternalStore(
    subscribeToLocation,
    getLocation,
    getServerLocation,
  );
  const route = resolveRoute(pathname);
  switch (route.kind) {
    case "admin":
      return <AdminRoute path={route.path} />;
    case "client-menu":
      return <div>Menú del cliente</div>;
    case "home":
      return <div>Todo Artesanal</div>;
    case "not-found":
      return <div>Página no encontrada</div>;
  }
}
