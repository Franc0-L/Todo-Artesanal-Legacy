import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import AdminLayout, { cardStyle } from "./AdminLayout.jsx";

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState(null);
  const [rotando, setRotando] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroActivo, setFiltroActivo] = useState("todos");

  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoTelefono, setNuevoTelefono] = useState("");
  const [nuevosCuidados, setNuevosCuidados] = useState("");
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  const cargarClientes = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("clientes")
      .select("*")
      .order("nombre");
    if (fetchError) {
      setError(
        "No pudimos cargar los clientes. Probá de nuevo en unos minutos.",
      );
      return;
    }
    setError("");
    setClientes(data ?? []);
  }, []);

  useEffect(() => {
    cargarClientes();
  }, [cargarClientes]);

  async function agregarCliente(e) {
    e.preventDefault();
    if (!nuevoNombre.trim()) return;

    setGuardandoNuevo(true);
    const { error: insertError } = await supabase.from("clientes").insert({
      nombre: nuevoNombre.trim(),
      telefono: nuevoTelefono.trim() || null,
      cuidados_alimentarios: nuevosCuidados.trim() || null,
    });
    setGuardandoNuevo(false);

    if (insertError) {
      setError("No pudimos agregar el cliente. Probá de nuevo.");
      return;
    }
    setNuevoNombre("");
    setNuevoTelefono("");
    setNuevosCuidados("");
    await cargarClientes();
  }

  async function actualizarCampo(cliente, campo, valor) {
    setClientes((prev) =>
      prev.map((c) => (c.id === cliente.id ? { ...c, [campo]: valor } : c)),
    );
    const { error: updateError } = await supabase
      .from("clientes")
      .update({ [campo]: valor })
      .eq("id", cliente.id);
    if (updateError) {
      setError(
        `No pudimos guardar el cambio en "${cliente.nombre}". Probá de nuevo.`,
      );
      cargarClientes();
    }
  }

  async function copiarLink(cliente) {
    const url = `${window.location.origin}/menu/${cliente.token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setError(
        "No pudimos copiar el enlace. Copialo manualmente desde la barra del navegador.",
      );
      return;
    }
    setCopiado(cliente.id);
    setTimeout(() => setCopiado(null), 1500);
  }

  async function rotarToken(cliente) {
    if (
      !window.confirm("El enlace anterior dejará de funcionar. ¿Rotar enlace?")
    ) {
      return;
    }

    setRotando(cliente.id);
    const { data: nuevoToken, error: rotateError } = await supabase.rpc(
      "rotate_client_token",
      { p_cliente_id: cliente.id },
    );
    setRotando(null);

    if (rotateError) {
      setError("No pudimos rotar el enlace. Probá de nuevo.");
      return;
    }

    setClientes((prev) =>
      prev.map((item) =>
        item.id === cliente.id ? { ...item, token: nuevoToken } : item,
      ),
    );
    setError("");
  }

  const clientesFiltrados = clientes.filter((c) => {
    if (filtroActivo === "activos" && !c.activo) return false;
    if (filtroActivo === "inactivos" && c.activo) return false;

    const termino = busqueda.trim().toLowerCase();
    if (!termino) return true;
    return (
      c.nombre.toLowerCase().includes(termino) ||
      (c.telefono ?? "").toLowerCase().includes(termino)
    );
  });

  return (
    <AdminLayout>
      <div className="page-card" style={cardStyle}>
        <h1 className="page-title">Clientes</h1>
        <p className="page-lead">
          Ningún cliente necesita registrarse — al agregarlo acá se le genera su
          link personal solo.
        </p>

        {error && (
          <p role="alert" className="alert-copy">
            {error}
          </p>
        )}

        {clientes.length > 0 && (
          <div className="form-grid week-settings">
            <label className="field week-weather-field">
              <span className="field-label">Buscar cliente</span>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre o teléfono…"
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

        <form onSubmit={agregarCliente} className="form-grid form-divider">
          <label className="field field-name">
            <span className="field-label">Nombre</span>
            <input
              id="nuevo-cliente-nombre"
              name="nuevo-cliente-nombre"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              placeholder="Ej: Ana Gómez"
              className="control"
            />
          </label>
          <label className="field field-phone">
            <span className="field-label">Teléfono</span>
            <input
              id="nuevo-cliente-telefono"
              name="nuevo-cliente-telefono"
              value={nuevoTelefono}
              onChange={(e) => setNuevoTelefono(e.target.value)}
              placeholder="Opcional"
              className="control"
            />
          </label>
          <label className="field field-care">
            <span className="field-label">Cuidado especial</span>
            <input
              id="nuevo-cliente-cuidados"
              name="nuevo-cliente-cuidados"
              value={nuevosCuidados}
              onChange={(e) => setNuevosCuidados(e.target.value)}
              placeholder="Ej: sin sal, diabético…"
              className="control"
            />
          </label>
          <button
            type="submit"
            disabled={guardandoNuevo || !nuevoNombre.trim()}
            className="primary-button"
          >
            Agregar
          </button>
        </form>

        {clientes.length === 0 ? (
          <p className="muted-copy">Todavía no cargaste ningún cliente.</p>
        ) : clientesFiltrados.length === 0 ? (
          <p className="muted-copy">
            Ningún cliente coincide con los filtros elegidos.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table data-table-clients">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Cuidado especial</th>
                  <th>Precio general esp.</th>
                  <th>Precio opcional esp.</th>
                  <th className="align-center">Activo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map((cliente) => (
                  <tr key={cliente.id}>
                    <td>
                      <input
                        defaultValue={cliente.nombre}
                        onBlur={(e) =>
                          e.target.value.trim() &&
                          e.target.value !== cliente.nombre &&
                          actualizarCampo(
                            cliente,
                            "nombre",
                            e.target.value.trim(),
                          )
                        }
                        className="cell-control"
                      />
                    </td>
                    <td>
                      <input
                        defaultValue={cliente.telefono ?? ""}
                        onBlur={(e) =>
                          e.target.value.trim() !== (cliente.telefono ?? "") &&
                          actualizarCampo(
                            cliente,
                            "telefono",
                            e.target.value.trim() || null,
                          )
                        }
                        className="cell-control"
                      />
                    </td>
                    <td>
                      <input
                        defaultValue={cliente.cuidados_alimentarios ?? ""}
                        onBlur={(e) =>
                          e.target.value.trim() !==
                            (cliente.cuidados_alimentarios ?? "") &&
                          actualizarCampo(
                            cliente,
                            "cuidados_alimentarios",
                            e.target.value.trim() || null,
                          )
                        }
                        className="cell-control"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        placeholder="—"
                        defaultValue={cliente.precio_general_especial ?? ""}
                        onBlur={(e) => {
                          const valor =
                            e.target.value === ""
                              ? null
                              : Number(e.target.value);
                          if (
                            valor !== (cliente.precio_general_especial ?? null)
                          )
                            actualizarCampo(
                              cliente,
                              "precio_general_especial",
                              valor,
                            );
                        }}
                        className="cell-control cell-control-price"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        placeholder="—"
                        defaultValue={cliente.precio_opcional_especial ?? ""}
                        onBlur={(e) => {
                          const valor =
                            e.target.value === ""
                              ? null
                              : Number(e.target.value);
                          if (
                            valor !== (cliente.precio_opcional_especial ?? null)
                          )
                            actualizarCampo(
                              cliente,
                              "precio_opcional_especial",
                              valor,
                            );
                        }}
                        className="cell-control cell-control-price"
                      />
                    </td>
                    <td className="align-center">
                      <input
                        type="checkbox"
                        checked={cliente.activo}
                        onChange={(e) =>
                          actualizarCampo(cliente, "activo", e.target.checked)
                        }
                      />
                    </td>
                    <td>
                      <div className="inline-actions">
                        <Link
                          to={`/admin/clientes/${cliente.id}`}
                          className="secondary-button"
                        >
                          Ver ficha
                        </Link>
                        <button
                          onClick={() => copiarLink(cliente)}
                          className="secondary-button"
                        >
                          {copiado === cliente.id
                            ? "¡Copiado!"
                            : "Copiar enlace"}
                        </button>
                        <button
                          onClick={() => rotarToken(cliente)}
                          disabled={rotando === cliente.id}
                          className="secondary-button"
                        >
                          {rotando === cliente.id ? "Rotando…" : "Rotar enlace"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="muted-copy page-footnote">
          "Precio esp." es opcional — solo para clientes con una tarifa
          negociada aparte. Dejalo vacío para que use el precio de la semana.
        </p>
      </div>
    </AdminLayout>
  );
}
