import { useCallback, useEffect, useState } from "react";
import { CancellationDrawer } from "./CancellationDrawer";
import { deleteCancellation, listCancellations } from "./services/cancellations.service";
import { listWeeks } from "../semanas/services/weeks.service";
import { listWeekDays } from "../semanas/services/week-days.service";
import { formatDate, formatDateRange } from "../../lib/formatters";
import { useConfirm } from "../../components/ui/useConfirm";
import type { WeekDay } from "../semanas/types/week-day";
import type { WeekListItem } from "../semanas/types/week-list";
import type { Cancellation } from "./types/cancellation";
import "./cancelaciones.css";

const PAGE_SIZE = 20;
const DAY_LABELS: Record<number, string> = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes" };
function weekStatusLabel(status: WeekListItem["status"]): string {
  if (status === "active") return "activa";
  if (status === "draft") return "borrador";
  return "cerrada";
}

export function CancelacionesPage() {
  const [weeks, setWeeks] = useState<WeekListItem[]>([]);
  const [weekId, setWeekId] = useState("");
  // Los días se guardan junto a la semana a la que pertenecen, y la selección
  // del día junto a la semana en la que se eligió: así el estado válido se
  // deriva al renderizar al cambiar de semana, sin limpiarlo dentro de un efecto.
  const [weekDays, setWeekDays] = useState<{ weekId: string; days: WeekDay[] }>({ weekId: "", days: [] });
  const [daySelection, setDaySelection] = useState<{ weekId: string; weekDayId: string }>({ weekId: "", weekDayId: "" });
  const days = weekDays.weekId === weekId ? weekDays.days : [];
  const weekDayId = daySelection.weekId === weekId ? daySelection.weekDayId : "";
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [weeksLoading, setWeeksLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  // La lista se guarda junto a la clave de la consulta que la pidió: `items`,
  // `total`, el `loading` y el error del listado se derivan en el render, así
  // el efecto no sincroniza estado antes de pedir los datos y nunca se
  // muestran los de un filtro, página o error anteriores.
  const requestKey = `${weekId}|${weekDayId}|${page}|${reloadToken}`;
  const [result, setResult] = useState<{
    key: string;
    items: Cancellation[];
    total: number;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  // Sin semana elegida no hay consulta que hacer: el render muestra el aviso
  // de "no hay semanas creadas".
  const loading = weekId !== "" && result?.key !== requestKey;
  const items = result?.key === requestKey ? result.items : [];
  const total = result?.key === requestKey ? result.total : 0;
  const listError = failure?.key === requestKey ? failure.message : null;
  // Errores que no son del listado (carga de semanas, borrado).
  const [error, setError] = useState<string | null>(null);
  const visibleError = listError ?? error;
  const { confirm, confirmDialog } = useConfirm();

  // `reload` vuelve a consultar con los mismos filtros: se usa cuando hay que
  // refrescar el listado sin cambiar la clave por otro motivo.
  const reload = useCallback(() => {
    setError(null);
    setReloadToken((current) => current + 1);
  }, []);

  // `weeksLoading` arranca en `true` (estado inicial) y el efecto solo lo baja
  // al terminar la consulta: no hace falta volver a marcarlo al inicio.
  useEffect(() => {
    let cancelled = false;
    void listWeeks({ pageSize: 100 })
      .then((result) => {
        if (cancelled) return;
        setWeeks(result.items);
        setWeekId((current) => current || result.items[0]?.id || "");
      })
      .catch((weeksError: unknown) => {
        if (!cancelled) setError(weeksError instanceof Error ? weeksError.message : "No se pudieron cargar las semanas.");
      })
      .finally(() => {
        if (!cancelled) setWeeksLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!weekId) return;
    let cancelled = false;
    void listWeekDays(weekId)
      .then((result) => {
        if (!cancelled) setWeekDays({ weekId, days: result });
      })
      .catch(() => {
        if (!cancelled) setWeekDays({ weekId, days: [] });
      });
    return () => { cancelled = true; };
  }, [weekId]);

  useEffect(() => {
    if (!weekId) return;

    let cancelled = false;

    void listCancellations({ weekId, weekDayId: weekDayId || undefined, page, pageSize: PAGE_SIZE })
      .then((loaded) => {
        if (cancelled) return;
        setResult({ key: requestKey, items: loaded.items, total: loaded.total });
        setFailure(null);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setResult({ key: requestKey, items: [], total: 0 });
        setFailure({ key: requestKey, message: loadError instanceof Error ? loadError.message : "No se pudieron cargar las cancelaciones." });
      });

    return () => { cancelled = true; };
  }, [page, requestKey, weekDayId, weekId]);

  function handleWeekChange(value: string) { setPage(1); setError(null); setWeekId(value); setDaySelection({ weekId: value, weekDayId: "" }); }
  function handleDayChange(value: string) { setPage(1); setError(null); setDaySelection({ weekId, weekDayId: value }); }
  function handleCreated() { setCreateOpen(false); setPage(1); reload(); }

  async function handleDelete(cancellation: Cancellation) {
    const proceed = await confirm({
      title: "Eliminar cancelación",
      message: `¿Eliminar la cancelación de ${cancellation.client?.name ?? "este cliente"}? El día vuelve a quedar sin respuesta.`,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!proceed) return;
    setRemovingId(cancellation.id);
    setError(null);
    try {
      await deleteCancellation(cancellation.id);
      if (items.length === 1 && page > 1) setPage((current) => current - 1);
      else reload();
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar la cancelación (¿la semana está cerrada?).");
    } finally {
      setRemovingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <section className="cancelaciones-page" aria-labelledby="cancelaciones-title">
      <header className="cancelaciones-page__header">
        <div className="cancelaciones-page__heading-row">
          <div>
            <p className="cancelaciones-page__eyebrow">Administración</p>
            <h1 id="cancelaciones-title">Cancelaciones</h1>
            <p className="cancelaciones-page__description">Una cancelación cuenta como respuesta del cliente para todo el día.</p>
          </div>
          <button className="cancelaciones-primary-action" type="button" onClick={() => setCreateOpen(true)} disabled={weeksLoading}>Nueva cancelación</button>
        </div>
      </header>

      <div className="cancelaciones-toolbar">
        <div className="cancelaciones-filter"><label htmlFor="cancel-week">Semana</label><select id="cancel-week" value={weekId} onChange={(event) => handleWeekChange(event.target.value)} disabled={weeksLoading}>{weeks.length === 0 && <option value="">Sin semanas</option>}{weeks.map((week) => <option key={week.id} value={week.id}>{formatDateRange(week.startDate, week.endDate)} ({weekStatusLabel(week.status)})</option>)}</select></div>
        <div className="cancelaciones-filter"><label htmlFor="cancel-day">Día</label><select id="cancel-day" value={weekDayId} onChange={(event) => handleDayChange(event.target.value)} disabled={days.length === 0}><option value="">Todos</option>{days.map((day) => <option key={day.id} value={day.id}>{DAY_LABELS[day.dayOfWeek]} ({formatDate(day.date)})</option>)}</select></div>
      </div>

      {visibleError && <div className="cancelaciones-feedback cancelaciones-feedback--error" role="alert"><p>{visibleError}</p><button type="button" onClick={reload}>Reintentar</button></div>}

      <div className="cancelaciones-list-wrapper" aria-busy={loading}>
        {!weekId ? <div className="cancelaciones-feedback"><h2>No hay semanas creadas</h2><p>Creá una semana desde la sección Semanas.</p></div> : loading ? <p className="cancelaciones-feedback">Cargando cancelaciones…</p> : items.length === 0 ? <div className="cancelaciones-feedback"><h2>No hay cancelaciones para mostrar</h2><p>Probá cambiar los filtros.</p></div> : <>
          <div className="cancelaciones-list-header" aria-hidden="true"><span>Cliente</span><span>Día</span><span>Registrada</span><span aria-hidden="true"></span></div>
          <ul className="cancelaciones-list" aria-label="Listado de cancelaciones">{items.map((cancellation) => <li key={cancellation.id} className="cancellation-row"><strong>{cancellation.client?.name ?? "Cliente"}</strong><span>{cancellation.weekDay ? `${DAY_LABELS[cancellation.weekDay.dayOfWeek]} (${formatDate(cancellation.weekDay.date)})` : "—"}</span><span>{formatDate(cancellation.createdAt)}</span><button type="button" onClick={() => void handleDelete(cancellation)} disabled={removingId === cancellation.id} aria-label={`Eliminar cancelación de ${cancellation.client?.name ?? "cliente"}`}>{removingId === cancellation.id ? "…" : "Eliminar"}</button></li>)}</ul>
        </>}
      </div>

      {!loading && total > 0 && <nav className="cancelaciones-pagination" aria-label="Paginación de cancelaciones"><span>Página {page} de {totalPages} · {total} cancelación{total === 1 ? "" : "es"}</span><div><button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Siguiente</button></div></nav>}

      <CancellationDrawer key={createOpen ? "open" : "closed"} open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      {confirmDialog}
    </section>
  );
}
