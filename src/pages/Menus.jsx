import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import AdminLayout, { cardStyle } from "./AdminLayout.jsx";

const CLIMAS = [
  { valor: "cualquiera", etiqueta: "Cualquiera" },
  { valor: "frio", etiqueta: "Frío" },
  { valor: "templado", etiqueta: "Templado" },
  { valor: "calor", etiqueta: "Calor" },
];

export default function Menus() {
  const [menus, setMenus] = useState([]);
  const [platos, setPlatos] = useState([]);
  const [error, setError] = useState("");

  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoClima, setNuevoClima] = useState("cualquiera");
  const [nuevoPrincipal, setNuevoPrincipal] = useState("");
  const [nuevaGuarnicion, setNuevaGuarnicion] = useState("");
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  const cargarDatos = useCallback(async () => {
    const [menusResult, platosResult] = await Promise.all([
      supabase.from("vista_menus_compuestos").select("*").order("nombre"),
      supabase
        .from("platos")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre"),
    ]);
    if (menusResult.error || platosResult.error) {
      setError("No pudimos cargar los menús. Probá de nuevo en unos minutos.");
      return;
    }
    setError("");
    setMenus(menusResult.data ?? []);
    setPlatos(platosResult.data ?? []);
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  async function actualizarCampo(menu, campo, valor) {
    setMenus((prev) =>
      prev.map((m) => (m.id === menu.id ? { ...m, [campo]: valor } : m)),
    );
    const { error: updateError } = await supabase
      .from("menus")
      .update({ [campo]: valor })
      .eq("id", menu.id);
    if (updateError) {
      setError(
        `No pudimos guardar el cambio en "${menu.nombre}". Probá de nuevo.`,
      );
      cargarDatos();
    }
  }

  function sugerirNombre(principalId, guarnicionId) {
    if (nuevoNombre.trim()) return;
    const principal = platos.find((p) => p.id === principalId)?.nombre;
    const guarnicion = platos.find((p) => p.id === guarnicionId)?.nombre;
    if (principal && guarnicion) {
      setNuevoNombre(`${principal} con ${guarnicion}`);
    }
  }

  async function crearMenu(e) {
    e.preventDefault();
    if (!nuevoNombre.trim() || !nuevoPrincipal || !nuevaGuarnicion) return;

    setGuardandoNuevo(true);
    const { error: rpcError } = await supabase.rpc("crear_menu_compuesto", {
      p_nombre: nuevoNombre.trim(),
      p_clima: nuevoClima,
      p_principal_id: nuevoPrincipal,
      p_guarnicion_id: nuevaGuarnicion,
    });
    setGuardandoNuevo(false);

    if (rpcError) {
      console.error(rpcError);
      setError(
        "No pudimos crear el menú. Revisá que principal y guarnición sean platos activos y distintos.",
      );
      return;
    }
    setNuevoNombre("");
    setNuevoClima("cualquiera");
    setNuevoPrincipal("");
    setNuevaGuarnicion("");
    cargarDatos();
  }

  return (
    <AdminLayout>
      <div className="page-card" style={cardStyle}>
        <h1 className="page-title">Menús compuestos</h1>
        <p className="page-lead">
          Un menú combina un plato principal con una guarnición — es lo que se
          va a poder ofrecer como general u opcional al armar una semana.
        </p>

        {error && (
          <p role="alert" className="alert-copy">
            {error}
          </p>
        )}

        {platos.length < 2 ? (
          <p className="notice-copy">
            Necesitás al menos 2 platos activos en el catálogo para armar un
            menú compuesto.
          </p>
        ) : (
          <form onSubmit={crearMenu} className="form-grid form-divider">
            <label className="field field-phone">
              <span className="field-label">Principal</span>
              <select
                value={nuevoPrincipal}
                onChange={(e) => {
                  setNuevoPrincipal(e.target.value);
                  sugerirNombre(e.target.value, nuevaGuarnicion);
                }}
                className="control"
              >
                <option value="">Elegí el plato principal…</option>
                {platos.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={p.id === nuevaGuarnicion}
                  >
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-phone">
              <span className="field-label">Guarnición</span>
              <select
                value={nuevaGuarnicion}
                onChange={(e) => {
                  setNuevaGuarnicion(e.target.value);
                  sugerirNombre(nuevoPrincipal, e.target.value);
                }}
                className="control"
              >
                <option value="">Elegí la guarnición…</option>
                {platos.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={p.id === nuevoPrincipal}
                  >
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-care">
              <span className="field-label">Nombre del menú</span>
              <input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Ej: Milanesa con puré"
                className="control"
              />
            </label>
            <label className="field field-phone">
              <span className="field-label">Clima</span>
              <select
                value={nuevoClima}
                onChange={(e) => setNuevoClima(e.target.value)}
                className="control"
              >
                {CLIMAS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={
                guardandoNuevo ||
                !nuevoNombre.trim() ||
                !nuevoPrincipal ||
                !nuevaGuarnicion
              }
              className="primary-button"
            >
              Crear menú
            </button>
          </form>
        )}

        {menus.length === 0 ? (
          <p className="muted-copy">
            Todavía no armaste ningún menú compuesto.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table data-table-dishes">
              <thead>
                <tr>
                  <th>Menú</th>
                  <th>Principal</th>
                  <th>Guarnición</th>
                  <th>Clima</th>
                  <th className="align-center">Activo</th>
                </tr>
              </thead>
              <tbody>
                {menus.map((menu) => (
                  <tr key={menu.id}>
                    <td>
                      <input
                        defaultValue={menu.nombre}
                        onBlur={(e) =>
                          e.target.value.trim() &&
                          e.target.value !== menu.nombre &&
                          actualizarCampo(menu, "nombre", e.target.value.trim())
                        }
                        className="cell-control"
                      />
                    </td>
                    <td className="muted-cell">
                      {menu.principal_nombre ?? "—"}
                    </td>
                    <td className="muted-cell">
                      {menu.guarnicion_nombre ?? "—"}
                    </td>
                    <td>
                      <select
                        value={menu.clima}
                        onChange={(e) =>
                          actualizarCampo(menu, "clima", e.target.value)
                        }
                        className="cell-control"
                      >
                        {CLIMAS.map((c) => (
                          <option key={c.valor} value={c.valor}>
                            {c.etiqueta}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="align-center">
                      <input
                        type="checkbox"
                        checked={menu.activo}
                        onChange={(e) =>
                          actualizarCampo(menu, "activo", e.target.checked)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="muted-copy page-footnote">
          Los menús compuestos activos todavía no aparecen en "Cargar semana
          nueva" — esa pantalla sigue trabajando con platos sueltos por ahora.
          Falta conectar ese paso.
        </p>
      </div>
    </AdminLayout>
  );
}
