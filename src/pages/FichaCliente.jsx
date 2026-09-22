import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { formatMonto } from "../lib/format";
import AdminLayout, { cardStyle } from "./AdminLayout.jsx";

export default function FichaCliente() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState(null);
  const [especiales, setEspeciales] = useState([]);
  const [preciosEspeciales, setPreciosEspeciales] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [rotando, setRotando] = useState(false);

  const cargarDatos = useCallback(async () => {
    setError("");
    const [clienteResult, especialesResult, preciosResult] =
      await Promise.all([
        supabase.from("clientes").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("menus")
          .select("id, nombre, precio_base")
          .eq("tipo", "especial")
          .eq("activo", true)
          .order("nombre"),
        supabase
          .from("precios_especiales_cliente")
          .select("menu_id, precio")
          .eq("cliente_id", id),
      ]);

    if (
      clienteResult.error ||
      especialesResult.error ||
      preciosResult.error
    ) {
      setError("No pudimos cargar la ficha del cliente. Probá de nuevo.");
      setCargando(false);
      return;
    }

    setCliente(clienteResult.data ?? null);
    setEspeciales(especialesResult.data ?? []);
    setPreciosEspeciales(
      Object.fromEntries(
        (preciosResult.data ?? []).map((p) => [p.menu_id, p.precio]),
      ),
    );
    setCargando(false);
  }, [id]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  async function actualizarCampo(campo, valor) {
    setCliente((prev) => ({ ...prev, [campo]: valor }));
    const { error: updateError } = await supabase
      .from("clientes")
      .update({ [campo]: valor })
      .eq("id", id);
    if (updateError) {
      setError(`No pudimos guardar el cambio en "${campo}". Probá de nuevo.`);
      cargarDatos();
    }
  }

  async function actualizarPrecioEspecial(menuId, valorTexto) {
    const anterior = preciosEspeciales[menuId] ?? null;
    const valor = valorTexto.trim() === "" ? null : Number(valorTexto);

    if (valor === anterior) return;

    setPreciosEspeciales((prev) => {
      const copia = { ...prev };
      if (valor === null) delete copia[menuId];
      else copia[menuId] = valor;
      return copia;
    });

    if (valor === null) {
      const { error: deleteError } = await supabase
        .from("precios_especiales_cliente")
        .delete()
        .eq("cliente_id", id)
        .eq("menu_id", menuId);
      if (deleteError) {
        setError("No pudimos quitar el precio especial. Probá de nuevo.");
        cargarDatos();
      }
      return;
    }

    const { error: upsertError } = await supabase
      .from("precios_especiales_cliente")
      .upsert(
        { cliente_id: id, menu_id: menuId, precio: valor },
        { onConflict: "cliente_id,menu_id" },
      );
    if (upsertError) {
      setError("No pudimos guardar el precio especial. Probá de nuevo.");
      cargarDatos();
    }
  }

  async function copiarLink() {
    const url = `${window.location.origin}/menu/${cliente.token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setError(
        "No pudimos copiar el enlace. Copialo manualmente desde la barra del navegador.",
      );
      return;
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  async function rotarToken() {
    if (
      !window.confirm("El enlace anterior dejará de funcionar. ¿Rotar enlace?")
    ) {
      return;
    }
    setRotando(true);
    const { data: nuevoToken, error: rotateError } = await supabase.rpc(
      "rotate_client_token",
      { p_cliente_id: id },
    );
    setRotando(false);
    if (rotateError) {
      setError("No pudimos rotar el enlace. Probá de nuevo.");
      return;
    }
    setCliente((prev) => ({ ...prev, token: nuevoToken }));
  }

  if (cargando) {
    return (
      <AdminLayout>
        <div className="page-card" style={cardStyle}>
          Cargando ficha…
        </div>
      </AdminLayout>
    );
  }

  if (!cliente) {
    return (
      <AdminLayout>
        <div className="page-card" style={cardStyle}>
          {error && (
            <p role="alert" className="alert-copy">
              {error}
            </p>
          )}
          <p className="muted-copy">
            No encontramos ese cliente. Volvé a{" "}
            <Link to="/admin/clientes">Clientes</Link>.
          </p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="page-card" style={cardStyle}>
        <button
          type="button"
          onClick={() => navigate("/admin/clientes")}
          className="secondary-button"
          style={{ marginBottom: 16 }}
        >
          ← Volver a clientes
        </button>

        {error && (
          <p role="alert" className="alert-copy">
            {error}
          </p>
        )}

        <div className="form-grid week-settings" style={{ alignItems: "flex-end" }}>
          <label className="field field-name" style={{ flex: "1 1 260px" }}>
            <span className="field-label">Nombre</span>
            <input
              defaultValue={cliente.nombre}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== cliente.nombre &&
                actualizarCampo("nombre", e.target.value.trim())
              }
              className="control"
            />
          </label>
          <label className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={cliente.activo}
              onChange={(e) => actualizarCampo("activo", e.target.checked)}
            />
            <span>Activo</span>
          </label>
        </div>

        <div className="form-grid week-settings">
          <button
            type="button"
            onClick={copiarLink}
            className="secondary-button"
          >
            {copiado ? "¡Copiado!" : "Copiar enlace personal"}
          </button>
          <button
            type="button"
            onClick={rotarToken}
            disabled={rotando}
            className="secondary-button"
          >
            {rotando ? "Rotando…" : "Rotar enlace"}
          </button>
          <Link
            to={`/admin/historial-cliente?cliente=${id}`}
            className="secondary-button panel-link"
          >
            Ver historial completo →
          </Link>
        </div>

        <h2 className="page-title" style={{ marginTop: 28 }}>
          Datos
        </h2>
        <div className="form-grid form-divider">
          <label className="field field-phone">
            <span className="field-label">Teléfono</span>
            <input
              defaultValue={cliente.telefono ?? ""}
              onBlur={(e) =>
                e.target.value.trim() !== (cliente.telefono ?? "") &&
                actualizarCampo("telefono", e.target.value.trim() || null)
              }
              className="control"
            />
          </label>
          <label className="field field-care">
            <span className="field-label">Dirección</span>
            <input
              defaultValue={cliente.direccion ?? ""}
              onBlur={(e) =>
                e.target.value.trim() !== (cliente.direccion ?? "") &&
                actualizarCampo("direccion", e.target.value.trim() || null)
              }
              className="control"
            />
          </label>
          <label className="field field-care">
            <span className="field-label">Cuidado especial</span>
            <input
              defaultValue={cliente.cuidados_alimentarios ?? ""}
              onBlur={(e) =>
                e.target.value.trim() !==
                  (cliente.cuidados_alimentarios ?? "") &&
                actualizarCampo(
                  "cuidados_alimentarios",
                  e.target.value.trim() || null,
                )
              }
              className="control"
            />
          </label>
          <label className="field field-care" style={{ flex: "1 1 100%" }}>
            <span className="field-label">Observaciones</span>
            <input
              defaultValue={cliente.observaciones ?? ""}
              onBlur={(e) =>
                e.target.value.trim() !== (cliente.observaciones ?? "") &&
                actualizarCampo(
                  "observaciones",
                  e.target.value.trim() || null,
                )
              }
              placeholder="Notas internas: horarios de entrega, referencias, etc."
              className="control"
            />
          </label>
        </div>

        <h2 className="page-title">Precios especiales</h2>
        <p className="page-lead">
          Dejalo vacío para que use el precio de la semana (general/opcional)
          o el precio base del especial.
        </p>
        <div className="form-grid form-divider">
          <label className="field field-phone">
            <span className="field-label">Precio general esp.</span>
            <input
              type="number"
              min="0"
              placeholder="—"
              defaultValue={cliente.precio_general_especial ?? ""}
              onBlur={(e) => {
                const valor =
                  e.target.value === "" ? null : Number(e.target.value);
                if (valor !== (cliente.precio_general_especial ?? null))
                  actualizarCampo("precio_general_especial", valor);
              }}
              className="control"
            />
          </label>
          <label className="field field-phone">
            <span className="field-label">Precio opcional esp.</span>
            <input
              type="number"
              min="0"
              placeholder="—"
              defaultValue={cliente.precio_opcional_especial ?? ""}
              onBlur={(e) => {
                const valor =
                  e.target.value === "" ? null : Number(e.target.value);
                if (valor !== (cliente.precio_opcional_especial ?? null))
                  actualizarCampo("precio_opcional_especial", valor);
              }}
              className="control"
            />
          </label>
        </div>

        {especiales.length > 0 && (
          <>
            <p className="form-hint" style={{ marginTop: -12 }}>
              Precio especial por producto (empanadas, tarta…):
            </p>
            <div className="table-scroll">
              <table className="data-table data-table-dishes">
                <thead>
                  <tr>
                    <th>Especial</th>
                    <th>Precio base</th>
                    <th>Precio para este cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {especiales.map((especial) => (
                    <tr key={especial.id}>
                      <td>{especial.nombre}</td>
                      <td className="muted-cell">
                        {formatMonto(especial.precio_base)}
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          placeholder="—"
                          defaultValue={
                            preciosEspeciales[especial.id] ?? ""
                          }
                          onBlur={(e) =>
                            actualizarPrecioEspecial(
                              especial.id,
                              e.target.value,
                            )
                          }
                          className="cell-control cell-control-price"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
