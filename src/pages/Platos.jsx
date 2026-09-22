import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import AdminLayout, { cardStyle } from "./AdminLayout.jsx";

const CLIMAS = [
  { valor: "cualquiera", etiqueta: "Cualquiera" },
  { valor: "frio", etiqueta: "Frío" },
  { valor: "templado", etiqueta: "Templado" },
  { valor: "calor", etiqueta: "Calor" },
];

function formatUltimaVez(fechaISO) {
  if (!fechaISO) return "Nunca usado";
  const dias = Math.round(
    (Date.now() - new Date(`${fechaISO}T00:00:00`)) / 86400000,
  );
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 0) return "Programado";
  return `Hace ${dias} días`;
}

export default function Platos() {
  const [platos, setPlatos] = useState([]);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroActivo, setFiltroActivo] = useState("todos");

  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [nuevoClima, setNuevoClima] = useState("cualquiera");
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  const cargarPlatos = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("vista_uso_platos")
      .select("*")
      .order("nombre");
    if (fetchError) {
      setError(
        "No pudimos cargar el catálogo de platos. Probá de nuevo en unos minutos.",
      );
      return;
    }
    setError("");
    setPlatos(data ?? []);
  }, []);

  useEffect(() => {
    cargarPlatos();
  }, [cargarPlatos]);

  async function agregarPlato(e) {
    e.preventDefault();
    if (!nuevoNombre.trim()) return;

    setGuardandoNuevo(true);
    const { error: insertError } = await supabase.from("platos").insert({
      nombre: nuevoNombre.trim(),
      categoria: nuevaCategoria.trim() || null,
      clima: nuevoClima,
    });
    setGuardandoNuevo(false);

    if (insertError) {
      setError("No pudimos agregar el plato. Probá de nuevo.");
      return;
    }
    setNuevoNombre("");
    setNuevaCategoria("");
    setNuevoClima("cualquiera");
    cargarPlatos();
  }

  async function actualizarCampo(plato, campo, valor) {
    setPlatos((prev) =>
      prev.map((p) => (p.id === plato.id ? { ...p, [campo]: valor } : p)),
    );
    const { error: updateError } = await supabase
      .from("platos")
      .update({ [campo]: valor })
      .eq("id", plato.id);
    if (updateError) {
      setError(
        `No pudimos guardar el cambio en "${plato.nombre}". Probá de nuevo.`,
      );
      cargarPlatos();
    }
  }

  const platosFiltrados = platos.filter((p) => {
    if (filtroActivo === "activos" && !p.activo) return false;
    if (filtroActivo === "inactivos" && p.activo) return false;

    const termino = busqueda.trim().toLowerCase();
    if (!termino) return true;
    return (
      p.nombre.toLowerCase().includes(termino) ||
      (p.categoria ?? "").toLowerCase().includes(termino)
    );
  });

  return (
    <AdminLayout>
      <div className="page-card" style={cardStyle}>
        <h1 className="page-title">Catálogo de platos</h1>

        {error && (
          <p role="alert" className="alert-copy">
            {error}
          </p>
        )}

        {platos.length > 0 && (
          <div className="form-grid week-settings">
            <label className="field week-weather-field">
              <span className="field-label">Buscar plato</span>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre o categoría…"
                className="control"
              />
            </label>
            <label className="field week-weather-field">
              <span className="field-label">Estado</span>
              <select
                value={filtroActivo}
                onChange={(e) => setFiltroActivo(e.target.value)}
                className="control"
              >
                <option value="todos">Todos</option>
                <option value="activos">Solo activos</option>
                <option value="inactivos">Solo inactivos</option>
              </select>
            </label>
          </div>
        )}

        <form onSubmit={agregarPlato} className="form-grid form-divider">
          <label className="field field-care">
            <span className="field-label">Plato nuevo</span>
            <input
              id="nuevo-plato-nombre"
              name="nuevo-plato-nombre"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              placeholder="Ej: Guiso de lentejas"
              className="control"
            />
          </label>
          <label className="field field-phone">
            <span className="field-label">Categoría</span>
            <input
              id="nuevo-plato-categoria"
              name="nuevo-plato-categoria"
              value={nuevaCategoria}
              onChange={(e) => setNuevaCategoria(e.target.value)}
              placeholder="Ej: guiso"
              className="control"
            />
          </label>
          <label className="field field-phone">
            <span className="field-label">Clima</span>
            <select
              id="nuevo-plato-clima"
              name="nuevo-plato-clima"
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
            disabled={guardandoNuevo || !nuevoNombre.trim()}
            className="primary-button"
          >
            Agregar
          </button>
        </form>

        {platos.length === 0 ? (
          <p className="muted-copy">Todavía no cargaste ningún plato.</p>
        ) : platosFiltrados.length === 0 ? (
          <p className="muted-copy">
            Ningún plato coincide con los filtros elegidos.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table data-table-dishes">
              <thead>
                <tr>
                  <th>Plato</th>
                  <th>Categoría</th>
                  <th>Clima</th>
                  <th>Última vez usado</th>
                  <th className="align-center">Activo</th>
                </tr>
              </thead>
              <tbody>
                {platosFiltrados.map((plato) => (
                  <tr key={plato.id}>
                    <td>
                      <input
                        defaultValue={plato.nombre}
                        onBlur={(e) =>
                          e.target.value.trim() &&
                          e.target.value !== plato.nombre &&
                          actualizarCampo(
                            plato,
                            "nombre",
                            e.target.value.trim(),
                          )
                        }
                        className="cell-control"
                      />
                    </td>
                    <td>
                      <input
                        defaultValue={plato.categoria ?? ""}
                        onBlur={(e) =>
                          e.target.value.trim() !== (plato.categoria ?? "") &&
                          actualizarCampo(
                            plato,
                            "categoria",
                            e.target.value.trim() || null,
                          )
                        }
                        className="cell-control"
                      />
                    </td>
                    <td>
                      <select
                        value={plato.clima}
                        onChange={(e) =>
                          actualizarCampo(plato, "clima", e.target.value)
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
                    <td className="muted-cell">
                      {formatUltimaVez(plato.ultima_vez_usado)}
                    </td>
                    <td className="align-center">
                      <input
                        type="checkbox"
                        checked={plato.activo}
                        onChange={(e) =>
                          actualizarCampo(plato, "activo", e.target.checked)
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
          Los cambios se guardan solos. Destildar "Activo" oculta el plato al
          armar una semana nueva, sin borrar su historial de uso.
        </p>
      </div>
    </AdminLayout>
  );
}
