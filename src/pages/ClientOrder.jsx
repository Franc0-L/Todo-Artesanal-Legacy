import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { DIA_LABEL, formatFecha } from "../lib/format";

const OPCIONES = [
  { valor: "general", etiqueta: "General" },
  { valor: "opcional", etiqueta: "Opcional" },
  { valor: "no_come", etiqueta: "No como este día" },
];

const AVISO_CLIMA = {
  calor: "Pensado para los días de calor",
  frio: "Pensado para los días fríos",
};

export default function ClientOrder() {
  const { token } = useParams();
  const [estado, setEstado] = useState("cargando"); // cargando | listo | no_encontrado | error
  const [dias, setDias] = useState([]);
  const [nombre, setNombre] = useState("");
  const [semanaInicio, setSemanaInicio] = useState(null);
  const [guardando, setGuardando] = useState({});
  const [errorGuardado, setErrorGuardado] = useState("");
  const canalRef = useRef(null);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      const { data, error } = await supabase.rpc("get_client_menu", {
        p_token: token,
      });

      if (!activo) return;

      if (error) {
        console.error(error);
        setEstado("error");
        return;
      }

      if (!data || data.length === 0) {
        setEstado("no_encontrado");
        return;
      }

      setNombre(data[0].cliente_nombre);
      setSemanaInicio(data[0].semana_inicio);
      setDias(mapearDias(data));
      setEstado("listo");
    }

    cargar();
    return () => {
      activo = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;

    const canal = supabase
      .channel(`client-menu:${token}`)
      .on("broadcast", { event: "order_changed" }, async () => {
        const { data, error } = await supabase.rpc("get_client_menu", {
          p_token: token,
        });

        if (error || !data?.length) return;

        setNombre(data[0].cliente_nombre);
        setSemanaInicio(data[0].semana_inicio);
        setDias(mapearDias(data));
      });

    canalRef.current = canal;
    canal.subscribe();

    return () => {
      canalRef.current = null;
      supabase.removeChannel(canal);
    };
  }, [token]);

  async function elegir(diaMenuId, tipo) {
    const eleccionAnterior =
      dias.find((d) => d.diaMenuId === diaMenuId)?.eleccion ?? null;
    setErrorGuardado("");
    setGuardando((prev) => ({ ...prev, [diaMenuId]: true }));
    setDias((prev) =>
      prev.map((d) =>
        d.diaMenuId === diaMenuId ? { ...d, eleccion: tipo } : d,
      ),
    );

    const rpcName = tipo === "no_come" ? "cancel_order" : "submit_order";
    const rpcArgs =
      tipo === "no_come"
        ? { p_token: token, p_dia_menu_id: diaMenuId }
        : { p_token: token, p_dia_menu_id: diaMenuId, p_tipo_menu: tipo };
    const { error } = await supabase.rpc(rpcName, rpcArgs);

    if (error) {
      console.error(error);
      setDias((prev) =>
        prev.map((d) =>
          d.diaMenuId === diaMenuId ? { ...d, eleccion: eleccionAnterior } : d,
        ),
      );
      setErrorGuardado(
        "No pudimos guardar tu elección. Revisá tu conexión e intentá de nuevo.",
      );
    }

    if (!error) {
      await canalRef.current?.send({
        type: "broadcast",
        event: "order_changed",
        payload: { diaMenuId, tipo },
      });
    }
    setGuardando((prev) => ({ ...prev, [diaMenuId]: false }));
  }

  if (estado === "cargando") {
    return <Centrado>Cargando tu menú de la semana…</Centrado>;
  }

  if (estado === "no_encontrado") {
    return (
      <Centrado>
        No encontramos tu menú. Si el link no funciona, escribile a Todo
        Artesanal por WhatsApp para que te lo reenvíen.
      </Centrado>
    );
  }

  if (estado === "error") {
    return (
      <Centrado>
        Hubo un problema para cargar el menú. Probá de nuevo en un rato.
      </Centrado>
    );
  }

  return (
    <div className="client-shell">
      <div className="client-card">
        <p className="client-kicker">Semana del {formatFecha(semanaInicio)}</p>
        <h1 className="client-title">Hola, {nombre}</h1>

        {errorGuardado && (
          <p
            role="alert"
            style={{ color: "var(--color-clay-dark)", margin: "0 0 18px" }}
          >
            {errorGuardado}
          </p>
        )}

        {dias.map((dia) => (
          <div key={dia.diaMenuId} className="client-day">
            <p className="client-day-title">{DIA_LABEL[dia.diaSemana]}</p>
            <p className="client-dish">
              General: {dia.platoGeneral}
              {AVISO_CLIMA[dia.platoGeneralClima] && (
                <span className="client-weather">
                  {AVISO_CLIMA[dia.platoGeneralClima]}
                </span>
              )}
            </p>
            <p className="client-dish">
              Opcional: {dia.platoOpcional}
              {AVISO_CLIMA[dia.platoOpcionalClima] && (
                <span className="client-weather">
                  {AVISO_CLIMA[dia.platoOpcionalClima]}
                </span>
              )}
            </p>

            <div className="client-options">
              {OPCIONES.map((op) => {
                const seleccionado = dia.eleccion === op.valor;
                return (
                  <button
                    key={op.valor}
                    onClick={() => elegir(dia.diaMenuId, op.valor)}
                    disabled={guardando[dia.diaMenuId]}
                    className={`client-option${seleccionado ? " client-option-selected" : ""}`}
                  >
                    {seleccionado ? "✓ " : ""}
                    {op.etiqueta}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <p className="client-note">
          Cada elección se guarda sola apenas la tocás. Podés volver a este
          mismo link y cambiarla cuando quieras.
        </p>
      </div>
    </div>
  );
}

function mapearDias(data) {
  return data.map((fila) => ({
    diaMenuId: fila.dia_menu_id,
    diaSemana: fila.dia_semana,
    fecha: fila.fecha,
    platoGeneral: fila.plato_general,
    platoGeneralClima: fila.plato_general_clima,
    platoOpcional: fila.plato_opcional,
    platoOpcionalClima: fila.plato_opcional_clima,
    eleccion: fila.eleccion_actual,
  }));
}

function Centrado({ children }) {
  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
        color: "var(--color-ink-muted)",
        fontSize: 17,
      }}
    >
      <p style={{ maxWidth: 320 }}>{children}</p>
    </div>
  );
}
