import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { DIA_LABEL, formatFecha, formatMonto } from "../lib/format";
import AdminLayout, { cardStyle } from "./AdminLayout.jsx";

const CICLO = [null, "general", "opcional", "no_come"];

const ETIQUETA_CELDA = {
  general: "G",
  opcional: "O",
  no_come: "N",
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminPanel() {
  const [semana, setSemana] = useState(null);
  const [dias, setDias] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [pedidos, setPedidos] = useState({});
  const [copiado, setCopiado] = useState(null);
  const [guardandoCeldas, setGuardandoCeldas] = useState({});
  const [error, setError] = useState("");
  const [cargandoDatos, setCargandoDatos] = useState(true);

  const semanaRef = useRef(null);
  const diasRef = useRef(new Set());
  const pedidoIdAClaveRef = useRef(new Map());
  const cargaIdRef = useRef(0);

  const cambiosLocalesRef = useRef(new Map());

  const cargarDatos = useCallback(async () => {
    const cargaId = ++cargaIdRef.current;

    setError("");
    setCargandoDatos(true);

    const { data: semanaActiva, error: errorSemana } = await supabase
      .from("semanas")
      .select("*")
      .eq("activa", true)
      .maybeSingle();

    if (cargaId !== cargaIdRef.current) {
      return;
    }

    if (errorSemana) {
      setCargandoDatos(false);
      setError(
        "No pudimos cargar los pedidos. Probá de nuevo en unos minutos.",
      );
      return;
    }

    if (!semanaActiva) {
      semanaRef.current = null;

      setSemana(null);
      setDias([]);
      setClientes([]);
      setPedidos({});
      setCargandoDatos(false);
      return;
    }

    const [diasResult, clientesResult, pedidosResult] = await Promise.all([
      supabase
        .from("dias_menu")
        .select("*")
        .eq("semana_id", semanaActiva.id)
        .order("fecha"),

      supabase.from("clientes").select("*").eq("activo", true).order("nombre"),

      supabase
        .from("vista_pedidos_semana")
        .select("*")
        .eq("semana_id", semanaActiva.id),
    ]);

    if (cargaId !== cargaIdRef.current) {
      return;
    }

    if (diasResult.error || clientesResult.error || pedidosResult.error) {
      setCargandoDatos(false);
      setError(
        "No pudimos cargar los pedidos. Probá de nuevo en unos minutos.",
      );
      return;
    }

    const clientesCargados = clientesResult.data ?? [];

    const mapaClientes = Object.fromEntries(
      clientesCargados.map((cliente) => [cliente.id, cliente]),
    );

    const mapaPedidoClave = new Map();
    const mapa = {};

    for (const pedido of pedidosResult.data ?? []) {
      mapaPedidoClave.set(
        pedido.pedido_id,
        `${pedido.cliente_id}:${pedido.dia_menu_id}`,
      );
      const cliente = mapaClientes[pedido.cliente_id];

      if (!cliente) {
        continue;
      }

      if (!mapa[pedido.cliente_id]) {
        mapa[pedido.cliente_id] = {};
      }

      mapa[pedido.cliente_id][pedido.dia_menu_id] = {
        tipo_menu: pedido.tipo_menu,
        monto: Number(pedido.monto ?? 0),
      };
    }

    if (cargaId !== cargaIdRef.current) {
      return;
    }

    semanaRef.current = semanaActiva;
    diasRef.current = new Set((diasResult.data ?? []).map((dia) => dia.id));

    setSemana(semanaActiva);
    setDias(diasResult.data ?? []);
    setClientes(clientesCargados);

    pedidoIdAClaveRef.current = mapaPedidoClave;

    setPedidos(mapa);
    setCargandoDatos(false);
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    function manejarEventoRealtime(tabla, payload) {
      const fila = payload.new ?? payload.old;
      if (!fila) return;

      let clave;
      if (tabla === "pedidos") {
        if (fila.dia_menu_id && !diasRef.current.has(fila.dia_menu_id)) return;
        clave = `${fila.cliente_id}:${fila.dia_menu_id}`;
      } else {
        clave = pedidoIdAClaveRef.current.get(fila.pedido_id);
        if (!clave) {
          cargarDatos();
          return;
        }
      }

      if (cambiosLocalesRef.current.has(clave)) {
        return;
      }

      cargarDatos();
    }

    const canal = supabase
      .channel("pedidos-en-vivo")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        (payload) => manejarEventoRealtime("pedidos", payload),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedido_items" },
        (payload) => manejarEventoRealtime("pedido_items", payload),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [cargarDatos]);

  async function cambiarCelda(cliente, diaMenuId) {
    const clave = `${cliente.id}:${diaMenuId}`;

    if (guardandoCeldas[clave]) {
      return;
    }

    const actual = pedidos[cliente.id]?.[diaMenuId]?.tipo_menu ?? null;

    const indiceActual = CICLO.indexOf(actual);

    const siguiente = CICLO[(indiceActual + 1) % CICLO.length];

    setGuardandoCeldas((prev) => ({ ...prev, [clave]: true }));

    cambiosLocalesRef.current.set(clave, {
      tipo_menu: siguiente,
    });

    const { error: errorGuardado } = await supabase.rpc("admin_set_order", {
      p_cliente_id: cliente.id,
      p_dia_menu_id: diaMenuId,
      p_tipo_menu: siguiente,
    });

    if (errorGuardado) {
      cambiosLocalesRef.current.delete(clave);
      setGuardandoCeldas((prev) => ({ ...prev, [clave]: false }));

      setError("No pudimos guardar el cambio. Volvé a intentarlo.");

      await cargarDatos();
      setGuardandoCeldas((prev) => ({ ...prev, [clave]: false }));
      return;
    }

    await cargarDatos();
    setGuardandoCeldas((prev) => ({ ...prev, [clave]: false }));

    await avisarCliente(cliente.token, { diaMenuId, tipo: siguiente });

    window.setTimeout(() => {
      const cambio = cambiosLocalesRef.current.get(clave);

      if (cambio?.tipo_menu === siguiente) {
        cambiosLocalesRef.current.delete(clave);
      }
    }, 3000);
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

    setTimeout(() => {
      setCopiado(null);
    }, 1500);
  }

  if (cargandoDatos) {
    return (
      <AdminLayout>
        <div className="page-card" style={cardStyle}>
          Cargando pedidos…
        </div>
      </AdminLayout>
    );
  }

  if (!semana) {
    return (
      <AdminLayout>
        <div className="page-card" style={cardStyle}>
          {error && (
            <p role="alert" className="alert-copy">
              {error}
            </p>
          )}

          <h1 className="page-title">Pedidos de la semana</h1>

          <p className="muted-copy page-lead">
            No hay ninguna semana activa todavía.
          </p>

          <Link to="/admin/nueva-semana" className="primary-button panel-link">
            Cargar la primera semana
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const hoy = hoyISO();

  const totalPorCliente = (clienteId) =>
    Object.values(pedidos[clienteId] ?? {}).reduce(
      (acc, pedido) => acc + Number(pedido.monto ?? 0),
      0,
    );

  const totalRacionesPorDia = (diaMenuId, tipo) =>
    clientes.filter(
      (cliente) => pedidos[cliente.id]?.[diaMenuId]?.tipo_menu === tipo,
    ).length;

  const sinResponderPorDia = (diaMenuId) => {
    const general = totalRacionesPorDia(diaMenuId, "general");
    const opcional = totalRacionesPorDia(diaMenuId, "opcional");
    const noCome = totalRacionesPorDia(diaMenuId, "no_come");
    return Math.max(clientes.length - general - opcional - noCome, 0);
  };

  const totalSemana = clientes.reduce(
    (acc, cliente) => acc + totalPorCliente(cliente.id),
    0,
  );

  return (
    <AdminLayout>
      <div className="page-card" style={cardStyle}>
        {error && (
          <p role="alert" className="alert-copy">
            {error}
          </p>
        )}

        <p className="client-kicker">
          Semana del {formatFecha(semana.fecha_inicio)}
        </p>

        <h1 className="page-title">Pedidos de la semana</h1>

        <div className="table-scroll">
          <table className="data-table admin-orders-table">
            <thead>
              <tr>
                <th>Cliente</th>

                {dias.map((dia) => {
                  const esHoy = dia.fecha === hoy;
                  const esPasado = dia.fecha < hoy;
                  return (
                    <th
                      key={dia.id}
                      className={`align-center${esHoy ? " day-header-today" : ""}${esPasado ? " day-header-past" : ""}`}
                    >
                      {DIA_LABEL[dia.dia_semana].slice(0, 3)}
                    </th>
                  );
                })}

                <th className="align-right">Total</th>

                <th></th>
              </tr>
            </thead>

            <tbody>
              {clientes.map((cliente) => (
                <tr key={cliente.id}>
                  <td className="nowrap-cell">{cliente.nombre}</td>

                  {dias.map((dia) => {
                    const tipo =
                      pedidos[cliente.id]?.[dia.id]?.tipo_menu ?? null;
                    const esPasado = dia.fecha < hoy;

                    return (
                      <td
                        key={dia.id}
                        className={`align-center${esPasado ? " day-cell-past" : ""}`}
                      >
                        <button
                          onClick={() => cambiarCelda(cliente, dia.id)}
                          aria-label={`${cliente.nombre}, ${DIA_LABEL[dia.dia_semana]}: ${tipo ? ETIQUETA_CELDA[tipo] : "sin responder"}`}
                          disabled={guardandoCeldas[`${cliente.id}:${dia.id}`]}
                          className={`order-cell order-cell-${tipo ?? "empty"}`}
                        >
                          {tipo ? ETIQUETA_CELDA[tipo] : "–"}
                        </button>
                      </td>
                    );
                  })}

                  <td className="align-right strong-cell">
                    {formatMonto(totalPorCliente(cliente.id))}
                  </td>

                  <td>
                    <button
                      onClick={() => copiarLink(cliente)}
                      className="secondary-button panel-copy-link"
                    >
                      {copiado === cliente.id ? "¡Copiado!" : "Copiar enlace"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <td className="muted-cell">Raciones a cocinar</td>

                {dias.map((dia) => (
                  <td key={dia.id} className="align-center muted-cell">
                    {totalRacionesPorDia(dia.id, "general")}
                    {" G / "}
                    {totalRacionesPorDia(dia.id, "opcional")}
                    {" O"}
                  </td>
                ))}

                <td className="align-right strong-cell">
                  {formatMonto(totalSemana)}
                </td>

                <td></td>
              </tr>
              <tr>
                <td className="muted-cell">Sin responder</td>

                {dias.map((dia) => {
                  const sinResponder = sinResponderPorDia(dia.id);
                  return (
                    <td
                      key={dia.id}
                      className={`align-center${sinResponder > 0 ? " warning-cell" : " muted-cell"}`}
                    >
                      {sinResponder}
                    </td>
                  );
                })}

                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="panel-legend">
          <Leyenda color="var(--color-sage-bg)" texto="G / O confirmado" />

          <Leyenda color="var(--color-muted-bg)" texto="N no come" />

          <Leyenda color="transparent" borde texto="– sin responder" />
        </div>
      </div>
    </AdminLayout>
  );
}

async function avisarCliente(token, payload) {
  const canal = supabase.channel(`client-menu:${token}`);

  await new Promise((resolve) => {
    canal.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await canal.send({
          type: "broadcast",
          event: "order_changed",
          payload,
        });
        resolve();
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        resolve();
      }
    });
  });

  await supabase.removeChannel(canal);
}

function Leyenda({ color, texto, borde }) {
  return (
    <span className="legend-item">
      <span
        className="legend-swatch"
        style={{
          "--legend-color": color,
          "--legend-border": borde ? "1px solid var(--color-border)" : "none",
        }}
      />

      {texto}
    </span>
  );
}
