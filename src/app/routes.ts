export type AdminRoutePath =
  | "/admin"
  | "/admin/clientes"
  | "/admin/platos"
  | "/admin/menus"
  | "/admin/semanas"
  | "/admin/pedidos"
  | "/admin/cancelaciones"
  | "/admin/historial";

export type AppRoute =
  | { kind: "admin"; path: AdminRoutePath }
  | { kind: "client-menu"; path: "/menu/:token"; token: string }
  | { kind: "home"; path: "/" }
  | { kind: "not-found"; path: string };

export function resolveRoute(pathname: string): AppRoute {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  if (normalizedPath === "/") return { kind: "home", path: "/" };

  const adminPaths: AdminRoutePath[] = [
    "/admin",
    "/admin/clientes",
    "/admin/platos",
    "/admin/menus",
    "/admin/semanas",
    "/admin/pedidos",
    "/admin/cancelaciones",
    "/admin/historial",
  ];

  if (adminPaths.includes(normalizedPath as AdminRoutePath)) {
    return { kind: "admin", path: normalizedPath as AdminRoutePath };
  }

  const menuMatch = normalizedPath.match(/^\/menu\/([^/]+)$/);
  if (menuMatch) {
    return {
      kind: "client-menu",
      path: "/menu/:token",
      token: menuMatch[1],
    };
  }

  return { kind: "not-found", path: normalizedPath };
}

export function navigate(path: string): void {
  if (path === window.location.pathname) return;

  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
