import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { DIA_LABEL, formatFecha } from "../lib/format";
import AdminLayout, { cardStyle } from "./AdminLayout.jsx";

const DIAS_SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes"];

function proximoLunes() {
  const hoy = new Date();
  const diff = (8 - hoy.getDay()) % 7 || 7;
  hoy.setDate(hoy.getDate() + diff);
  return hoy.toISOString().slice(0, 10);
}

function sumarDias(fechaISO, n) {
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function diaVacio() {
  return { menu_general_id: "", menu_opcional_id: "", menu_especial_id: "" };
}

function elegirSiguiente(
  candidatos,
  usadosSemana,
  excluirId,
  excluirCategoria,
) {
  const filtros = [
    (c) =>
      !usadosSemana.has(c.id) &&
      c.id !== excluirId &&
      (!excluirCategoria || c.categoria_principal !== excluirCategoria),
    (c) => !usadosSemana.has(c.id) && c.id !== excluirId,
    (c) => c.id !== excluirId,
    () => true,
  ];

  for (const filtro of filtros) {
    const pool = candidatos.filter(filtro);
    if (pool.length > 0) {
      const topK = pool.slice(0, Math.min(3, pool.length));
      const elegido = topK[Math.floor(Math.random() * topK.length)];
      usadosSemana.add(elegido.id);
      return elegido.id;
    }
  }
  return candidatos[0]?.id;
}

export default function NuevaSemana() {
  const navigate = useNavigate();
  const [semanaActivaActual, setSemanaActivaActual] = useState(null);
  const [semanasAnteriores, setSemanasAnteriores] = useState([]);
  const [menus, setMenus] = useState([]);
  const [especiales, setEspeciales] = useState([]);
  const [cargandoMenus, setCargandoMenus] = useState(true);

  const [fechaInicio, setFechaInicio] = useState(proximoLunes());
  const [precioGeneral, setPrecioGeneral] = useState("");
  const [precioOpcional, setPrecioOpcional] = useState("");
  const [dias, setDias] = useState(
    Object.fromEntries(DIAS_SEMANA.map((d) => [d, diaVacio()])),
  );
  const [climaSemana, setClimaSemana] = useState("cualquiera");
  const [duplicando, setDuplicando] = useState(false);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;

    async function cargarDatos() {
      const [
        semanaResult,
        semanasAnterioresResult,
        menusResult,
        especialesResult,
      ] = await Promise.all([
        supabase
          .from("semanas")
          .select("fecha_inicio")
          .eq("activa", true)
          .maybeSingle(),
        supabase
          .from("semanas")
          .select("id, fecha_inicio")
          .order("fecha_inicio", { ascending: false })
          .limit(15),
        supabase
          .from("vista_uso_menus")
          .select("*")
          .eq("activo", true)
          .order("nombre"),
        supabase
          .from("menus")
          .select("id, nombre")
          .eq("tipo", "especial")
          .eq("activo", true)
          .order("nombre"),
      ]);

      if (!activo) return;

      if (
        semanaResult.error ||
        semanasAnterioresResult.error ||
        menusResult.error ||
        especialesResult.error
      ) {
        setError("No pudimos cargar los datos. Probá de nuevo.");
      }

      setSemanaActivaActual(semanaResult.data ?? null);
      setSemanasAnteriores(semanasAnterioresResult.data ?? []);
      setMenus(menusResult.data ?? []);
      setEspeciales(especialesResult.data ?? []);
      setCargandoMenus(false);
    }

    cargarDatos();

    return () => {
      activo = false;
    };
  }, []);

  function actualizarDia(dia, campo, valor) {
    setDias((prev) => ({ ...prev, [dia]: { ...prev[dia], [campo]: valor } }));
  }

  function menuUsadoEnOtroSlot(menuId, diaActual, campoActual) {
    if (!menuId) return false;
    return DIAS_SEMANA.some((dia) =>
      ["menu_general_id", "menu_opcional_id"].some(
        (campo) =>
          !(dia === diaActual && campo === campoActual) &&
          dias[dia][campo] === menuId,
      ),
    );
  }

  function sugerirMenus() {
    const aptos = menus.filter(
      (m) => m.clima === climaSemana || m.clima === "cualquiera",
    );
    const candidatos = (aptos.length ? aptos : menus).slice().sort((a, b) => {
      if (!a.ultima_vez_usado && !b.ultima_vez_usado) return 0;
      if (!a.ultima_vez_usado) return -1;
      if (!b.ultima_vez_usado) return 1;
      return a.ultima_vez_usado.localeCompare(b.ultima_vez_usado);
    });

    if (candidatos.length === 0) return;

    const usadosSemana = new Set();
    const nuevos = {};

    for (const dia of DIAS_SEMANA) {
      const general = elegirSiguiente(candidatos, usadosSemana, null, null);
      const categoriaGeneral = candidatos.find(
        (c) => c.id === general,
      )?.categoria_principal;
      const opcional = elegirSiguiente(
        candidatos,
        usadosSemana,
        general,
        categoriaGeneral,
      );
      nuevos[dia] = {
        menu_general_id: general,
        menu_opcional_id: opcional,
        menu_especial_id: dias[dia].menu_especial_id,
      };
    }
    setDias(nuevos);
  }

  async function duplicarSemana(semanaId) {
    if (!semanaId) return;

    setDuplicando(true);
    setError("");
    const { data, error: fetchError } = await supabase
      .from("dias_menu")
      .select("dia_semana, menu_general_id, menu_opcional_id, menu_especial_id")
      .eq("semana_id", semanaId);
    setDuplicando(false);

    if (fetchError) {
      setError("No pudimos duplicar esa semana. Probá de nuevo.");
      return;
    }

    const idsActivos = new Set(menus.map((m) => m.id));
    const idsEspecialesActivos = new Set(especiales.map((e) => e.id));
    const nuevos = Object.fromEntries(DIAS_SEMANA.map((d) => [d, diaVacio()]));
    let huboOmitidos = false;

    for (const fila of data ?? []) {
      if (!DIAS_SEMANA.includes(fila.dia_semana)) continue;
      const general = idsActivos.has(fila.menu_general_id)
        ? fila.menu_general_id
        : "";
      const opcional = idsActivos.has(fila.menu_opcional_id)
        ? fila.menu_opcional_id
        : "";
      const especial = idsEspecialesActivos.has(fila.menu_especial_id)
        ? fila.menu_especial_id
        : "";
      if (!general || !opcional) huboOmitidos = true;
      nuevos[fila.dia_semana] = {
        menu_general_id: general,
        menu_opcional_id: opcional,
        menu_especial_id: especial,
      };
    }

    setDias(nuevos);
    if (huboOmitidos) {
      setError(
        "Se duplicó la semana, pero algún menú usado ahí ya no está activo — revisá los días con selección vacía.",
      );
    }
  }

  async function guardar(e) {
    e.preventDefault();
    setError("");

    if (!fechaInicio || !precioGeneral || !precioOpcional) {
      setError("Completá la fecha de inicio y los dos precios.");
      return;
    }

    const faltante = DIAS_SEMANA.find(
      (d) => !dias[d].menu_general_id || !dias[d].menu_opcional_id,
    );
    if (faltante) {
      setError(
        `Falta elegir el menú general u opcional de ${DIA_LABEL[faltante]}.`,
      );
      return;
    }

    const repetido = DIAS_SEMANA.find(
      (d) => dias[d].menu_general_id === dias[d].menu_opcional_id,
    );
    if (repetido) {
      setError(
        `El menú general y el opcional de ${DIA_LABEL[repetido]} no pueden ser el mismo.`,
      );
      return;
    }

    const p_dias = DIAS_SEMANA.map((d) => ({
      dia_semana: d,
      fecha: sumarDias(fechaInicio, DIAS_SEMANA.indexOf(d)),
      menu_general_id: dias[d].menu_general_id,
      menu_opcional_id: dias[d].menu_opcional_id,
      menu_especial_id: dias[d].menu_especial_id || null,
    }));

    setGuardando(true);
    const { error: rpcError } = await supabase.rpc("crear_semana", {
      p_fecha_inicio: fechaInicio,
      p_precio_general: Number(precioGeneral),
      p_precio_opcional: Number(precioOpcional),
      p_dias,
    });
    setGuardando(false);

    if (rpcError) {
      console.error(rpcError);
      setError(
        "No pudimos crear la semana. Revisá los datos e intentá de nuevo.",
      );
      return;
    }

    navigate("/admin");
  }

  if (cargandoMenus) {
    return (
      <AdminLayout>
        <div className="page-card" style={cardStyle}>
          Cargando datos de la semana…
        </div>
      </AdminLayout>
    );
  }

  if (menus.length === 0) {
    return (
      <AdminLayout>
        <div className="page-card" style={cardStyle}>
          <h1 className="page-title">Cargar semana nueva</h1>
          {error && (
            <p role="alert" style={{ color: "var(--color-clay-dark)" }}>
              {error}
            </p>
          )}
          <p className="muted-copy">
            Todavía no hay menús disponibles. Un plato solo no alcanza — armá
            combos de principal+guarnición en{" "}
            <Link to="/admin/menus">Menús compuestos</Link> (primero cargá
            platos en <Link to="/admin/platos">Catálogo de platos</Link> si
            todavía no tenés con qué combinar) y volvé acá.
          </p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="page-card" style={cardStyle}>
        <h1 className="page-title">Cargar semana nueva</h1>

        {semanaActivaActual && (
          <p className="notice-copy">
            Ya hay una semana activa (del{" "}
            {formatFecha(semanaActivaActual.fecha_inicio)}). Al crear esta, esa
            deja de estar activa automáticamente — no se borra, solo pasa a ser
            historial.
          </p>
        )}

        {semanasAnteriores.length > 0 && (
          <div className="form-grid week-settings">
            <label className="field week-weather-field">
              <span className="field-label">Duplicar semana anterior</span>
              <select
                className="control"
                value=""
                disabled={duplicando}
                onChange={(e) => duplicarSemana(e.target.value)}
              >
                <option value="">
                  {duplicando
                    ? "Duplicando…"
                    : "Elegí una semana para copiar sus menús…"}
                </option>
                {semanasAnteriores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatFecha(s.fecha_inicio)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <p className="form-hint">
          Copia el menú general y opcional de cada día de esa semana. No copia
          precios ni fecha — esos los definís acá abajo para la semana nueva.
        </p>

        <div className="form-grid week-settings">
          <label className="field week-weather-field">
            <span className="field-label">Clima esperado esta semana</span>
            <select
              id="clima-semana"
              name="clima-semana"
              value={climaSemana}
              onChange={(e) => setClimaSemana(e.target.value)}
              className="control"
            >
              <option value="cualquiera">Cualquiera</option>
              <option value="frio">Frío</option>
              <option value="templado">Templado</option>
              <option value="calor">Calor</option>
            </select>
          </label>
          <button
            type="button"
            onClick={sugerirMenus}
            className="secondary-button"
          >
            Sugerir menús
          </button>
        </div>
        {menus.length < 10 && (
          <p className="notice-copy">
            Tenés {menus.length}{" "}
            {menus.length === 1 ? "menú activo" : "menús activos"} disponibles.
            Para armar una semana completa sin repetir ninguno necesitás al
            menos 10 — armá más combos en{" "}
            <Link to="/admin/menus">Menús compuestos</Link> (cargá más platos en{" "}
            <Link to="/admin/platos">Catálogo de platos</Link> si te faltan con
            qué combinarlos).
          </p>
        )}
        <p className="form-hint">
          Prioriza los menús que hace más tiempo no se usan y van bien con ese
          clima, evita repetir la categoría del principal entre el general y el
          opcional de un mismo día, y no repite menú en toda la semana. Volvé a
          tocar "Sugerir menús" para ver otra combinación. Revisá y cambiá lo
          que quieras antes de confirmar.
        </p>

        <form onSubmit={guardar}>
          <div className="form-grid week-pricing">
            <label className="field">
              <span className="field-label">Fecha de inicio (lunes)</span>
              <input
                type="date"
                id="fecha-inicio"
                name="fecha-inicio"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="control"
              />
            </label>
            <label className="field">
              <span className="field-label">Precio general</span>
              <input
                type="number"
                id="precio-general"
                name="precio-general"
                min="0"
                inputMode="decimal"
                value={precioGeneral}
                onChange={(e) => setPrecioGeneral(e.target.value)}
                className="control"
              />
            </label>
            <label className="field">
              <span className="field-label">Precio opcional</span>
              <input
                type="number"
                id="precio-opcional"
                name="precio-opcional"
                min="0"
                inputMode="decimal"
                value={precioOpcional}
                onChange={(e) => setPrecioOpcional(e.target.value)}
                className="control"
              />
            </label>
          </div>

          {DIAS_SEMANA.map((dia) => (
            <div key={dia} className="week-day">
              <p className="week-day-title">{DIA_LABEL[dia]}</p>
              <div className="week-day-controls">
                <select
                  id={`${dia}-general`}
                  name={`${dia}-general`}
                  value={dias[dia].menu_general_id}
                  onChange={(e) =>
                    actualizarDia(dia, "menu_general_id", e.target.value)
                  }
                  className="control"
                >
                  <option value="">Elegí el menú general…</option>
                  {menus.map((m) => {
                    const yaUsado = menuUsadoEnOtroSlot(
                      m.id,
                      dia,
                      "menu_general_id",
                    );
                    return (
                      <option key={m.id} value={m.id} disabled={yaUsado}>
                        {m.nombre}
                        {yaUsado ? " (ya en la semana)" : ""}
                      </option>
                    );
                  })}
                </select>
                <select
                  id={`${dia}-opcional`}
                  name={`${dia}-opcional`}
                  value={dias[dia].menu_opcional_id}
                  onChange={(e) =>
                    actualizarDia(dia, "menu_opcional_id", e.target.value)
                  }
                  className="control"
                >
                  <option value="">Elegí el menú opcional…</option>
                  {menus.map((m) => {
                    const yaUsado = menuUsadoEnOtroSlot(
                      m.id,
                      dia,
                      "menu_opcional_id",
                    );
                    return (
                      <option key={m.id} value={m.id} disabled={yaUsado}>
                        {m.nombre}
                        {yaUsado ? " (ya en la semana)" : ""}
                      </option>
                    );
                  })}
                </select>
                <select
                  id={`${dia}-especial`}
                  name={`${dia}-especial`}
                  value={dias[dia].menu_especial_id}
                  onChange={(e) =>
                    actualizarDia(dia, "menu_especial_id", e.target.value)
                  }
                  className="control"
                >
                  <option value="">Sin especial ese día</option>
                  {especiales.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}

          {error && (
            <p role="alert" className="alert-copy">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="primary-button week-submit"
          >
            {guardando ? "Creando semana…" : "Crear y activar esta semana"}
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}
