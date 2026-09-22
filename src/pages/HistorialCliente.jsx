import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { DIA_LABEL, formatFecha } from "../lib/format";
import AdminLayout, { cardStyle } from "./AdminLayout.jsx";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const ETIQUETA_TIPO = {
  general: "General",
  opcional: "Opcional",
  no_come: "No come este día",
};

export default function HistorialCliente() {
  const [searchParams] = useSearchParams();
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const [diasConSemana, setDiasConSemana] = useState([]);
  const [pedidosCliente, setPedidosCliente] = useState([]);
  const [menusPorId, setMenusPorId] = useState({});
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
      const desdeUrl = searchParams.get("cliente");
      const existe = desdeUrl && data?.some((c) => c.id === desdeUrl);
      if (existe) setClienteId(desdeUrl);
      else if (data?.length) setClienteId(data[0].id);
    }
    cargarInicial();
    // Solo se usa el query param para la preselección inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function cargarHistorialCompleto() {
      const [diasResult, menusResult] = await Promise.all([
        supabase
          .from("dias_menu")
          .select(
            "id, dia_semana, fecha, menu_general_id, menu_opcional_id, semanas(fecha_inicio)",
          )
          .order("fecha", { ascending: false }),
        supabase.from("menus").select("id, nombre"),
      ]);
      if (diasResult.error || menusResult.error) {
        setError("No pudimos cargar el historial. Probá de nuevo.");
        setCargando(false);
        return;
      }
      setDiasConSemana(diasResult.data ?? []);
      setMenusPorId(
        Object.fromEntries(
          (menusResult.data ?? []).map((m) => [m.id, m.nombre]),
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
      .from("vista_pedidos_semana")
      .select("dia_menu_id, tipo_menu, plato, cantidad")
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
        const pedidosDia = pedidosCliente.filter(
          (p) => p.dia_menu_id === dia.id,
        );
        const principal = pedidosDia.find((p) => p.tipo_menu !== "especial");
        const especial = pedidosDia.find((p) => p.tipo_menu === "especial");
        return {
          id: dia.id,
          fecha: dia.fecha,
          diaSemana: dia.dia_semana,
          semanaInicio: dia.semanas?.fecha_inicio,
          eleccion: principal ? ETIQUETA_TIPO[principal.tipo_menu] : "No pidió",
          plato:
            principal?.tipo_menu === "general"
              ? menusPorId[dia.menu_general_id]
              : principal?.tipo_menu === "opcional"
                ? menusPorId[dia.menu_opcional_id]
                : null,
          respondio: Boolean(principal) && principal.tipo_menu !== "no_come",
          especial: especial
            ? `${especial.plato} × ${especial.cantidad}`
            : null,
        };
      }),
    [diasConSemana, pedidosCliente, menusPorId],
  );

  const hoy = hoyISO();

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
                      <th>Especial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr
                        key={f.id}
                        className={f.fecha < hoy ? "day-cell-past" : undefined}
                      >
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
                        <td className="muted-cell">{f.especial ?? "—"}</td>
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
