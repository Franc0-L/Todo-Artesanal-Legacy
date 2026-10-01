import { useEffect, useState } from "react";
import { getClientHistory } from "../historial/services/history.service";
import type { ClientHistoryEntry } from "../historial/types/client-history";
import type { Modality, WeekStatus } from "../../types/domain";

interface ClientHistorySectionProps {
  clientId: string;
}

const PAGE_SIZE = 5;

const MODALITY_LABELS: Record<Modality, string> = {
  general: "General",
  opcional: "Opcional",
  media_vianda: "Media vianda",
};

const WEEK_STATUS_LABELS: Record<WeekStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  closed: "Cerrada",
};

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(value);
}

function dayLabel(dayOfWeek: number): string {
  const labels = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  return labels[dayOfWeek] ?? `Día ${dayOfWeek}`;
}

function optionLabel(entry: ClientHistoryEntry["orders"][number]): string {
  return entry.option?.name ?? "Opción no disponible";
}

function HistoryWeek({ entry }: { entry: ClientHistoryEntry }) {
  return (
    <article className="client-history__week">
      <header className="client-history__week-header">
        <div>
          <h4>
            {formatDate(entry.week.startDate)} —{" "}
            {formatDate(entry.week.endDate)}
          </h4>
          <span className="client-history__status">
            {WEEK_STATUS_LABELS[entry.week.status]}
          </span>
        </div>
        <strong>{formatCurrency(entry.totalAmount)}</strong>
      </header>

      {entry.orders.length > 0 && (
        <div className="client-history__group">
          <h5>Pedidos</h5>
          <ul>
            {entry.orders.map((order) => (
              <li key={order.id}>
                <div>
                  <strong>{dayLabel(order.weekDay?.dayOfWeek ?? 0)}</strong>
                  <span>
                    {order.option?.type === "menu" ? "Menú" : "Plato"}:{" "}
                    {optionLabel(order)}
                  </span>
                </div>
                <div className="client-history__order-meta">
                  <span>
                    {MODALITY_LABELS[order.modality]} · {order.quantity} ×{" "}
                    {formatCurrency(order.appliedPrice)}
                  </span>
                  {order.notes && <small>{order.notes}</small>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.cancellations.length > 0 && (
        <div className="client-history__group">
          <h5>Cancelaciones</h5>
          <ul>
            {entry.cancellations.map((cancellation) => (
              <li key={cancellation.id}>
                <strong>
                  {dayLabel(cancellation.weekDay?.dayOfWeek ?? 0)}
                </strong>
                <span>
                  {cancellation.weekDay
                    ? formatDate(cancellation.weekDay.date)
                    : "Fecha no disponible"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.orders.length === 0 && entry.cancellations.length === 0 && (
        <p className="client-history__empty-week">
          No hay movimientos registrados.
        </p>
      )}
    </article>
  );
}

export function ClientHistorySection({ clientId }: ClientHistorySectionProps) {
  const [entries, setEntries] = useState<ClientHistoryEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // El historial se reinicia por remonte (el drawer que lo contiene se remonta
  // al cambiar de cliente): `page` arranca en 1 y `loading` en `true`, así que
  // el efecto solo pide los datos y no sincroniza estado antes del `await`.
  useEffect(() => {
    let cancelled = false;

    void getClientHistory(clientId, { page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setEntries(result.entries);
        setTotal(result.total);
      })
      .catch((historyError: unknown) => {
        if (!cancelled) {
          setError(
            historyError instanceof Error
              ? historyError.message
              : "No se pudo cargar el historial del cliente.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, page, reloadToken]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="client-history" aria-labelledby="client-history-title">
      <div className="client-drawer__section-heading">
        <div>
          <h3 id="client-history-title">Historial</h3>
          <p>Pedidos y cancelaciones agrupados por semana.</p>
        </div>
        {total > 0 && (
          <span className="client-link-status">{total} semanas</span>
        )}
      </div>

      {loading && (
        <p className="client-history__feedback">Cargando historial…</p>
      )}

      {!loading && error && (
        <div
          className="client-history__feedback client-history__feedback--error"
          role="alert"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setReloadToken((current) => current + 1)}
          >
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="client-history__feedback">
          Este cliente todavía no tiene historial registrado.
        </p>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="client-history__list">
          {entries.map((entry) => (
            <HistoryWeek key={entry.week.id} entry={entry} />
          ))}
        </div>
      )}

      {!loading && !error && totalPages > 1 && (
        <nav
          className="client-history__pagination"
          aria-label="Paginación del historial"
        >
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
          >
            Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            disabled={page === totalPages}
          >
            Siguiente
          </button>
        </nav>
      )}
    </section>
  );
}
