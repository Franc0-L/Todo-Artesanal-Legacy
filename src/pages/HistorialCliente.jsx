import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { DIA_LABEL, formatFecha } from "../lib/format";
import AdminLayout, { cardStyle } from "./AdminLayout.jsx";

const ETIQUETA_TIPO = {
  general: "General",
  opcional: "Opcional",
  no_come: "No come este día",
};

export default function HistorialCliente() {
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const [diasConSemana, setDiasConSemana] = useState([]);
  const [pedidosCliente, setPedidosCliente] = useState([]);
  const [platosPorId, setPlatosPorId] = useState({});
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargarInicial() {
      const { data, error: clientesError } = await supabase
        .from("clientes")
        .select("id, nombre")
        .order("nombre");
      if (clientesError) {
        setError("No pudimos cargar los clientes. Probá de nuevo.");
        setCargando(false);
        return;
      }
      setClientes(data ?? []);
      if (data?.length) setClienteId(data[0].id);
    }
    cargarInicial();
  }, []);

  useEffect(() => {
    async function cargarHistorialCompleto() {
      const [diasResult, platosResult] = await Promise.all([
        supabase
          .from("dias_menu")
          .select(
            "id, dia_semana, fecha, plato_general_id, plato_opcional_id, semanas(fecha_inicio)",
          )
          .order("fecha", { ascending: false }),
        supabase.from("platos").select("id, nombre"),
      ]);
      if (diasResult.error || platosResult.error) {
        setError("No pudimos cargar el historial. Probá de nuevo.");
        setCargando(false);
        return;
      }
      setDiasConSemana(diasResult.data ?? []);
      setPlatosPorId(
        Object.fromEntries(
          (platosResult.data ?? []).map((p) => [p.id, p.nombre]),
        ),
      );
      setCargando(false);
    }
    cargarHistorialCompleto();
  }, []);

  useEffect(() => {
    if (!clienteId) return;
    let activo = true;
    supabase
      .from("pedidos")
      .select("dia_menu_id, tipo_menu")
      .eq("cliente_id", clienteId)
      .then(({ data, error: pedidosError }) => {
        if (!activo) return;
        if (pedidosError) {
          setError("No pudimos cargar los pedidos del cliente.");
          return;
        }
        setPedidosCliente(data ?? []);
      });
    return () => {
      activo = false;
    };
  }, [clienteId]);

  const filas = useMemo(
    () =>
      diasConSemana.map((dia) => {
        const pedido = pedidosCliente.find((p) => p.dia_menu_id === dia.id);
        return {
          id: dia.id,
          fecha: dia.fecha,
          diaSemana: dia.dia_semana,
          semanaInicio: dia.semanas?.fecha_inicio,
          eleccion: pedido ? ETIQUETA_TIPO[pedido.tipo_menu] : "No pidió",
          plato:
            pedido?.tipo_menu === "general"
              ? platosPorId[dia.plato_general_id]
              : pedido?.tipo_menu === "opcional"
                ? platosPorId[dia.plato_opcional_id]
                : null,
          respondio: Boolean(pedido) && pedido.tipo_menu !== "no_come",
        };
      }),
    [diasConSemana, pedidosCliente, platosPorId],
  );

  return (
    <AdminLayout>
      <div className="page-card" style={cardStyle}>
        <h1 className="page-title">Historial por cliente</h1>
        <p className="page-lead">
          Qué pidió (o no) un cliente, semana por semana.
        </p>

        {error && (
          <p role="alert" className="alert-copy">
            {error}
          </p>
        )}

        {cargando ? (
          <p className="muted-copy">Cargando historial…</p>
        ) : clientes.length === 0 ? (
          <p className="muted-copy">Todavía no cargaste ningún cliente.</p>
        ) : (
          <>
            <label className="field selection-field">
              <span className="field-label">Cliente</span>
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="control"
              >
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>

            {filas.length === 0 ? (
              <p className="muted-copy">
                Todavía no hay ninguna semana cargada.
              </p>
            ) : (
              <div className="table-scroll">
                <table className="data-table history-client-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Semana</th>
                      <th>Eligió</th>
                      <th>Plato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.id}>
                        <td className="nowrap-cell">
                          {DIA_LABEL[f.diaSemana]}{" "}
                          <span className="muted-inline">
                            {formatFecha(f.fecha)}
                          </span>
                        </td>
                        <td className="muted-cell">
                          {f.semanaInicio ? formatFecha(f.semanaInicio) : "—"}
                        </td>
                        <td className={f.respondio ? "" : "muted-cell"}>
                          {f.eleccion}
                        </td>
                        <td>{f.plato ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
