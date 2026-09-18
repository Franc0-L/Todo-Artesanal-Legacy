import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const NAV_ITEMS = [
  { to: "/admin", label: "Pedidos", end: true },
  { to: "/admin/nueva-semana", label: "Nueva semana" },
  { to: "/admin/platos", label: "Platos" },
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
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [errorAcceso, setErrorAcceso] = useState("");

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

  async function cerrarSesion() {
    await supabase.auth.signOut();
    navigate("/admin/login");
  }

  if (errorAcceso) {
    return (
      <div className="admin-auth-state">
        <p role="alert">{errorAcceso}</p>
        <button onClick={cerrarSesion} style={logoutStyle}>
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
          <nav className="admin-nav" aria-label="Navegación administrativa">
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

const headerStyle = {
  background: "var(--color-surface)",
  borderBottom: "1px solid var(--color-border)",
  position: "sticky",
  top: 0,
  zIndex: 10,
};

const headerInnerStyle = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "14px 20px",
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const brandStyle = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: 19,
  color: "var(--color-clay-dark)",
  marginRight: "auto",
  paddingRight: 12,
};

const navStyle = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
};

function navLinkStyle(isActive) {
  return {
    padding: "7px 14px",
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    color: isActive ? "#fff" : "var(--color-ink-muted)",
    background: isActive ? "var(--color-clay)" : "transparent",
    whiteSpace: "nowrap",
  };
}

const logoutStyle = {
  background: "none",
  border: "none",
  color: "var(--color-ink-muted)",
  fontSize: 13,
  whiteSpace: "nowrap",
  marginLeft: 12,
};
