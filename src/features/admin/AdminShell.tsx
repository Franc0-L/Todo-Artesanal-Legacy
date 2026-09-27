import type { ReactNode } from "react";
import { useAuth } from "../auth/useAuth";
import { AdminNavigation } from "./AdminNavigation";
import { navigate, type AdminRoutePath } from "../../app/routes";
import { useTheme } from "../../lib/theme";
import "./admin-shell.css";

export function AdminShell({
  children,
  currentPath,
}: {
  children: ReactNode;
  currentPath: AdminRoutePath;
}) {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      console.error("No se pudo cerrar sesión:", error);
    }
  }

  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : "A";

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <div className="admin-shell__header-inner">
          <button
            type="button"
            className="admin-shell__brand"
            onClick={() => navigate("/admin")}
            aria-label="Ir al panel de inicio"
          >
            <img
              src="/mascot/icon_chef.png"
              alt="Mascota Todo Artesanal"
              className="admin-shell__brand-logo-img"
              width="34"
              height="34"
            />
            <div className="admin-shell__brand-text">
              <strong className="admin-shell__brand-name">
                Todo Artesanal
              </strong>
              <span className="admin-shell__brand-badge">Admin</span>
            </div>
          </button>

          <div className="admin-shell__user">
            <button
              type="button"
              className="admin-shell__theme-btn"
              onClick={toggleTheme}
              aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
              title={`Modo ${theme === "dark" ? "claro" : "oscuro"}`}
            >
              <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
            </button>

            <div
              className="admin-shell__user-info"
              title={user?.email ?? undefined}
            >
              <div className="admin-shell__user-avatar" aria-hidden="true">
                {userInitial}
              </div>
              <span>{user?.email ?? "Administrador"}</span>
            </div>

            <button
              type="button"
              className="admin-shell__signout-btn"
              onClick={handleSignOut}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <AdminNavigation currentPath={currentPath} />
      <main className="admin-shell__main">{children}</main>
    </div>
  );
}
