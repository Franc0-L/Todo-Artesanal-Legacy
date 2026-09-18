import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { DIA_LABEL, formatFecha } from "../lib/format";
import AdminLayout, { cardStyle } from "./AdminLayout.jsx";

export default function Cancelaciones() {
  const [semanas, setSemanas] = useState([]);
  const [semanaId, setSemanaId] = useState("");
  const [dias, setDias] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargarInicial() {
      const { data: semanasData, error: semanasError } = await supabase
        .from("semanas")
        .select("*")
        .order("fecha_inicio", { ascending: false });
      if (semanasError) {
        setError("No pudimos cargar las semanas. Probá de nuevo.");
        setCargando(false);
        return;
      }
      setSemanas(semanasData ?? []);
      const activa = semanasData?.find((s) => s.activa);
      setSemanaId(activa?.id ?? semanasData?.[0]?.id ?? "");
      setCargando(false);
    }
    cargarInicial();
  }, []);

  useEffect(() => {
    if (!semanaId) return;
    let activo = true;
    async function cargarSemana() {
      setError("");
      const [
        { data: diasData, error: diasError },
        { data: clientesData, error: clientesError },
        { data: pedidosData, error: pedidosError },
      ] = await Promise.all([
        supabase
          .from("dias_menu")
          .select("*")
          .eq("semana_id", semanaId)
          .order("fecha"),
        supabase
          .from("clientes")
          .select("id, nombre")
          .eq("activo", true)
          .order("nombre"),
        supabase
          .from("vista_pedidos_semana")
          .select("cliente_id, dia_menu_id, tipo_menu")
          .eq("semana_id", semanaId),
      ]);
      if (!activo) return;
      if (diasError || clientesError || pedidosError) {
        setError("No pudimos cargar esta información. Probá de nuevo.");
        return;
      }
      setDias(diasData ?? []);
      setClientes(clientesData ?? []);
      setPedidos(pedidosData ?? []);
      setCargando(false);
    }
    cargarSemana();
    return () => {
      activo = false;
    };
  }, [semanaId]);

  const filas = useMemo(() => {
    const resultado = [];
    for (const dia of dias) {
      for (const cliente of clientes) {
        const pedido = pedidos.find(
          (p) => p.cliente_id === cliente.id && p.dia_menu_id === dia.id,
        );
        if (!pedido) {
          resultado.push({
            id: `${cliente.id}-${dia.id}`,
            cliente: cliente.nombre,
            dia: dia.dia_semana,
            fecha: dia.fecha,
            motivo: "Sin responder",
          });
        } else if (pedido.tipo_menu === "no_come") {
          resultado.push({
            id: `${cliente.id}-${dia.id}`,
            cliente: cliente.nombre,
            dia: dia.dia_semana,
            fecha: dia.fecha,
            motivo: "No come este día",
          });
        }
      }
    }
    return resultado.sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) || a.cliente.localeCompare(b.cliente),
    );
  }, [dias, clientes, pedidos]);

  return (
    <AdminLayout>
      <div className="page-card" style={cardStyle}>
        <h1 className="page-title">Cancelaciones y sin responder</h1>
        <p className="page-lead">
          Quién no pidió o avisó que no come, día por día, para una semana.
        </p>

        {error && (
          <p role="alert" className="alert-copy">
            {error}
          </p>
        )}

        {cargando && !semanas.length ? (
          <p className="muted-copy">Cargando semanas…</p>
        ) : semanas.length === 0 ? (
          <p className="muted-copy">Todavía no hay ninguna semana cargada.</p>
        ) : (
          <>
            <label className="field selection-field">
              <span className="field-label">Semana</span>
              <select
                value={semanaId}
                onChange={(e) => setSemanaId(e.target.value)}
                className="control"
              >
                {semanas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatFecha(s.fecha_inicio)} {s.activa ? "(activa)" : ""}
                  </option>
                ))}
              </select>
            </label>

            {filas.length === 0 ? (
              <p className="muted-copy">
                Todos respondieron y pidieron algo todos los días. 🎉
              </p>
            ) : (
              <div className="table-scroll">
                <table className="data-table cancellations-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Día</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.id}>
                        <td>{f.cliente}</td>
                        <td className="nowrap-cell">
                          {DIA_LABEL[f.dia]}{" "}
                          <span className="muted-inline">
                            {formatFecha(f.fecha)}
                          </span>
                        </td>
                        <td
                          className={
                            f.motivo === "Sin responder"
                              ? "muted-cell"
                              : "warning-cell"
                          }
                        >
                          {f.motivo}
                        </td>
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
