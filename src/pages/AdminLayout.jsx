import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const NAV_ITEMS = [
  { to: "/admin", label: "Pedidos", end: true },
  { to: "/admin/nueva-semana", label: "Nueva semana" },
  { to: "/admin/platos", label: "Platos" },
  { to: "/admin/menus", label: "Menús" },
  { to: "/admin/clientes", label: "Clientes" },
  { to: "/admin/historial-semanas", label: "Historial semanas" },
  { to: "/admin/cancelaciones", label: "Cancelaciones" },
  { to: "/admin/historial-cliente", label: "Historial cliente" },
];

export const cardStyle = {
  background: "var(--color-surface)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
  border: "1px solid var(--color-border)",
  padding: "28px 26px",
  marginBottom: 24,
};

export default function AdminLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [errorAcceso, setErrorAcceso] = useState("");
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    let activo = true;

    async function verificarAcceso() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!activo) return;

        if (error || !data.session) {
          navigate("/admin/login", { replace: true });
          return;
        }

        const { data: esAdmin, error: errorAdmin } =
          await supabase.rpc("is_admin");

        if (!activo) return;

        if (errorAdmin || !esAdmin) {
          setErrorAcceso(
            "No pudimos verificar tus permisos. Cerrá sesión y volvé a entrar.",
          );
          return;
        }

        setCargandoSesion(false);
      } catch {
        if (activo) {
          setErrorAcceso(
            "No pudimos verificar tus permisos. Cerrá sesión y volvé a entrar.",
          );
        }
      }
    }

    verificarAcceso();

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        navigate("/admin/login", { replace: true });
      }
    });

    return () => {
      activo = false;
      listener.subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  async function cerrarSesion() {
    await supabase.auth.signOut();
    navigate("/admin/login");
  }

  if (errorAcceso) {
    return (
      <div className="admin-auth-state">
        <p role="alert">{errorAcceso}</p>
        <button onClick={cerrarSesion} className="admin-logout">
          Volver al login
        </button>
      </div>
    );
  }

  if (cargandoSesion) {
    return <div className="admin-auth-state">Verificando permisos…</div>;
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-inner">
          <NavLink className="admin-brand" to="/admin">
            Todo Artesanal
          </NavLink>
          <button
            type="button"
            className="admin-menu-toggle"
            aria-expanded={menuAbierto}
            aria-controls="admin-nav"
            onClick={() => setMenuAbierto((abierto) => !abierto)}
          >
            <span className="sr-only">
              {menuAbierto ? "Cerrar menú" : "Abrir menú"}
            </span>
            <span className="hamburger-icon" aria-hidden="true" />
          </button>
          <nav
            id="admin-nav"
            className={`admin-nav${menuAbierto ? " admin-nav-open" : ""}`}
            aria-label="Navegación administrativa"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `admin-nav-link${isActive ? " admin-nav-link-active" : ""}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button onClick={cerrarSesion} className="admin-logout">
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="admin-main">
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
