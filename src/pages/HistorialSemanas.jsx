import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { DIA_LABEL, formatFecha, formatMonto } from "../lib/format";
import AdminLayout, { cardStyle } from "./AdminLayout.jsx";

export default function HistorialSemanas() {
  const [semanas, setSemanas] = useState([]);
  const [semanaId, setSemanaId] = useState("");
  const [dias, setDias] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [totalClientesActivos, setTotalClientesActivos] = useState(0);
  const [menusPorId, setMenusPorId] = useState({});
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargarInicial() {
      const [semanasResult, menusResult, clientesResult] = await Promise.all([
        supabase
          .from("semanas")
          .select("*")
          .order("fecha_inicio", { ascending: false }),
        supabase.from("menus").select("id, nombre"),
        supabase
          .from("clientes")
          .select("id", { count: "exact", head: true })
          .eq("activo", true),
      ]);
      if (semanasResult.error || menusResult.error || clientesResult.error) {
        setError("No pudimos cargar el historial. Probá de nuevo.");
        setCargando(false);
        return;
      }
      const semanasData = semanasResult.data;
      const menusData = menusResult.data;
      setSemanas(semanasData ?? []);
      setMenusPorId(
        Object.fromEntries((menusData ?? []).map((m) => [m.id, m.nombre])),
      );
      setTotalClientesActivos(clientesResult.count ?? 0);
      if (semanasData?.length) setSemanaId(semanasData[0].id);
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
        { data: pedidosData, error: pedidosError },
      ] = await Promise.all([
        supabase
          .from("dias_menu")
          .select("*")
          .eq("semana_id", semanaId)
          .order("fecha"),
        supabase
          .from("vista_pedidos_semana")
          .select("*")
          .eq("semana_id", semanaId),
      ]);
      if (!activo) return;
      if (diasError || pedidosError) {
        setError("No pudimos cargar el detalle de esa semana. Probá de nuevo.");
        return;
      }
      setDias(diasData ?? []);
      setPedidos(pedidosData ?? []);
    }
    cargarSemana();
    return () => {
      activo = false;
    };
  }, [semanaId]);

  const filas = useMemo(
    () =>
      dias.map((dia) => {
        const pedidosDia = pedidos.filter((p) => p.dia_menu_id === dia.id);
        const general = pedidosDia.filter(
          (p) => p.tipo_menu === "general",
        ).length;
        const opcional = pedidosDia.filter(
          (p) => p.tipo_menu === "opcional",
        ).length;
        const noCome = pedidosDia.filter(
          (p) => p.tipo_menu === "no_come",
        ).length;
        const sinResponder = Math.max(
          totalClientesActivos - general - opcional - noCome,
          0,
        );
        const total = pedidosDia.reduce(
          (acc, p) => acc + Number(p.monto ?? 0),
          0,
        );
        return {
          id: dia.id,
          diaSemana: dia.dia_semana,
          fecha: dia.fecha,
          general: menusPorId[dia.menu_general_id] ?? "—",
          opcional: menusPorId[dia.menu_opcional_id] ?? "—",
          countGeneral: general,
          countOpcional: opcional,
          countNoCome: noCome,
          countSinResponder: sinResponder,
          total,
        };
      }),
    [dias, pedidos, totalClientesActivos, menusPorId],
  );

  const totalSemana = filas.reduce((acc, f) => acc + f.total, 0);
  const semanaActual = semanas.find((s) => s.id === semanaId);

  return (
    <AdminLayout>
      <div className="page-card" style={cardStyle}>
        <h1 className="page-title">Historial de semanas</h1>
        <p className="page-lead">
          Elegí una semana para ver cuántos pidieron cada día y cuánto se
          facturó.
        </p>

        {error && (
          <p role="alert" className="alert-copy">
            {error}
          </p>
        )}

        {cargando ? (
          <p className="muted-copy">Cargando historial…</p>
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

            {semanaActual && (
              <p className="pricing-note">
                Precio general: {formatMonto(semanaActual.precio_general)} ·
                Precio opcional: {formatMonto(semanaActual.precio_opcional)}
              </p>
            )}

            <div className="table-scroll">
              <table className="data-table history-week-table">
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>General</th>
                    <th>Opcional</th>
                    <th className="align-center">G</th>
                    <th className="align-center">O</th>
                    <th className="align-center">No come</th>
                    <th className="align-center">Sin responder</th>
                    <th className="align-right">Total</th>
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
                      <td>{f.general}</td>
                      <td>{f.opcional}</td>
                      <td className="align-center">{f.countGeneral}</td>
                      <td className="align-center">{f.countOpcional}</td>
                      <td className="align-center">{f.countNoCome}</td>
                      <td className="align-center muted-cell">
                        {f.countSinResponder}
                      </td>
                      <td className="align-right strong-cell">
                        {formatMonto(f.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={7} className="align-right strong-cell">
                      Total semana
                    </td>
                    <td className="align-right strong-cell">
                      {formatMonto(totalSemana)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
