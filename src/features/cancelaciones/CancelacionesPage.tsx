import { useCallback, useEffect, useRef, useState } from "react";
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
  const [days, setDays] = useState<WeekDay[]>([]);
  const [weekDayId, setWeekDayId] = useState("");
  const [items, setItems] = useState<Cancellation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [weeksLoading, setWeeksLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const { confirm, confirmDialog } = useConfirm();

  useEffect(() => {
    let cancelled = false;
    setWeeksLoading(true);
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
    if (!weekId) {
      setDays([]);
      setWeekDayId("");
      return;
    }
    let cancelled = false;
    void listWeekDays(weekId)
      .then((result) => {
        if (!cancelled) {
          setDays(result);
          setWeekDayId("");
        }
      })
      .catch(() => {
        if (!cancelled) setDays([]);
      });
    return () => { cancelled = true; };
  }, [weekId]);

  const loadCancellations = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!weekId) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listCancellations({ weekId, weekDayId: weekDayId || undefined, page, pageSize: PAGE_SIZE });
      if (requestId !== requestIdRef.current) return;
      setItems(result.items);
      setTotal(result.total);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setItems([]);
      setTotal(0);
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las cancelaciones.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [weekId, weekDayId, page]);

  useEffect(() => { void loadCancellations(); }, [loadCancellations]);

  function handleWeekChange(value: string) { setPage(1); setWeekId(value); }
  function handleDayChange(value: string) { setPage(1); setWeekDayId(value); }
  function handleCreated() { setCreateOpen(false); if (page !== 1) setPage(1); else void loadCancellations(); }

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
      else void loadCancellations();
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

      {error && <div className="cancelaciones-feedback cancelaciones-feedback--error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadCancellations()}>Reintentar</button></div>}

      <div className="cancelaciones-list-wrapper" aria-busy={loading}>
        {!weekId ? <div className="cancelaciones-feedback"><h2>No hay semanas creadas</h2><p>Creá una semana desde la sección Semanas.</p></div> : loading ? <p className="cancelaciones-feedback">Cargando cancelaciones…</p> : items.length === 0 ? <div className="cancelaciones-feedback"><h2>No hay cancelaciones para mostrar</h2><p>Probá cambiar los filtros.</p></div> : <>
          <div className="cancelaciones-list-header" aria-hidden="true"><span>Cliente</span><span>Día</span><span>Registrada</span><span aria-hidden="true"></span></div>
          <ul className="cancelaciones-list" aria-label="Listado de cancelaciones">{items.map((cancellation) => <li key={cancellation.id} className="cancellation-row"><strong>{cancellation.client?.name ?? "Cliente"}</strong><span>{cancellation.weekDay ? `${DAY_LABELS[cancellation.weekDay.dayOfWeek]} (${formatDate(cancellation.weekDay.date)})` : "—"}</span><span>{formatDate(cancellation.createdAt)}</span><button type="button" onClick={() => void handleDelete(cancellation)} disabled={removingId === cancellation.id} aria-label={`Eliminar cancelación de ${cancellation.client?.name ?? "cliente"}`}>{removingId === cancellation.id ? "…" : "Eliminar"}</button></li>)}</ul>
        </>}
      </div>

      {!loading && total > 0 && <nav className="cancelaciones-pagination" aria-label="Paginación de cancelaciones"><span>Página {page} de {totalPages} · {total} cancelación{total === 1 ? "" : "es"}</span><div><button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Siguiente</button></div></nav>}

      <CancellationDrawer open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      {confirmDialog}
    </section>
  );
}
