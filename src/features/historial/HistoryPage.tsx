import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  getUnansweredClients,
  listHistoricalWeeks,
} from "./services/history.service";
import { getHistoricalWeekDetail } from "./services/historical-week-detail.service";
import { EmptyState } from "../../components/ui/EmptyState";
import type { HistoricalWeek } from "./types/historical-week";
import type { UnansweredClient } from "./types/unanswered";
import type { HistoricalWeekDetail } from "./services/historical-week-detail.service";
import "./history.css";

const PAGE_SIZE = 10;
const UNANSWERED_PAGE_SIZE = 50;

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatModality(value: string): string {
  if (value === "general") return "General";
  if (value === "opcional") return "Opcional";
  if (value === "media_vianda") return "Media vianda";
  return value;
}

function formatOptionType(value: string): string {
  return value === "menu" ? "Menú" : "Plato";
}

export function HistoryPage() {
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  // Los resultados se guardan junto a la clave de la consulta que los pidió:
  // `items`, `total`, `loading` y `error` se derivan en el render. Así el
  // efecto no sincroniza estado antes de pedir los datos y nunca se muestra
  // el listado de un filtro, página o error anteriores.
  const requestKey = `${fromDate}|${toDate}|${page}|${reloadToken}`;
  const [result, setResult] = useState<{
    key: string;
    items: HistoricalWeek[];
    total: number;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const loading = result?.key !== requestKey;
  const items = result?.key === requestKey ? result.items : [];
  const total = result?.key === requestKey ? result.total : 0;
  const error = failure?.key === requestKey ? failure.message : null;
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [weekDetail, setWeekDetail] = useState<HistoricalWeekDetail | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [unanswered, setUnanswered] = useState<UnansweredClient[]>([]);
  const [unansweredLoading, setUnansweredLoading] = useState(false);
  const [unansweredError, setUnansweredError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);

  // `reload` vuelve a consultar con los mismos filtros: se usa cuando hay que
  // refrescar el listado sin cambiar la clave por otro motivo.
  const reload = useCallback(() => setReloadToken((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    void listHistoricalWeeks({
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((loaded) => {
        if (cancelled) return;
        setResult({ key: requestKey, items: loaded.items, total: loaded.total });
        setFailure(null);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setResult({ key: requestKey, items: [], total: 0 });
        setFailure({
          key: requestKey,
          message:
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar el historial.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [fromDate, page, requestKey, toDate]);

  const openWeekDetail = useCallback(async (week: HistoricalWeek) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;

    setSelectedWeekId(week.id);
    setWeekDetail(null);
    setDetailError(null);
    setUnanswered([]);
    setUnansweredError(null);
    setDetailLoading(true);
    setUnansweredLoading(week.unansweredClientCount > 0);

    try {
      const detailPromise = getHistoricalWeekDetail(week.id);
      const unansweredPromise =
        week.unansweredClientCount > 0
          ? getUnansweredClients(week.id, {
              page: 1,
              pageSize: UNANSWERED_PAGE_SIZE,
            })
          : Promise.resolve(null);

      const [detailResult, unansweredResult] = await Promise.allSettled([
        detailPromise,
        unansweredPromise,
      ]);

      if (detailRequestRef.current !== requestId) return;

      if (detailResult.status === "fulfilled") {
        setWeekDetail(detailResult.value);
      } else {
        setDetailError(
          detailResult.reason instanceof Error
            ? detailResult.reason.message
            : "No se pudo cargar el detalle de la semana.",
        );
      }

      if (unansweredResult.status === "fulfilled") {
        setUnanswered(unansweredResult.value?.items ?? []);
      } else {
        setUnansweredError(
          unansweredResult.reason instanceof Error
            ? unansweredResult.reason.message
            : "No se pudieron cargar los clientes sin responder.",
        );
      }
    } finally {
      if (detailRequestRef.current === requestId) {
        setDetailLoading(false);
        setUnansweredLoading(false);
      }
    }
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedWeek = items.find((week) => week.id === selectedWeekId) ?? null;

  function handleFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
  }

  function closeDrawer() {
    detailRequestRef.current += 1;
    setSelectedWeekId(null);
    setWeekDetail(null);
    setDetailLoading(false);
    setUnansweredLoading(false);
  }

  return (
    <section className="history-page" aria-labelledby="history-title">
      <header className="history-page__header">
        <div>
          <p className="history-page__eyebrow">Administración</p>
          <h1 id="history-title">Historial</h1>
          <p className="history-page__description">
            Consultá las semanas cerradas y sus resultados históricos.
          </p>
        </div>
      </header>

      <form className="history-filters" onSubmit={handleFiltersSubmit}>
        <div>
          <label htmlFor="history-from">Desde</label>
          <input
            id="history-from"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="history-to">Hasta</label>
          <input
            id="history-to"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>
        <button type="submit">Aplicar filtros</button>
      </form>

      {error && (
        <div className="history-feedback history-feedback--error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}

      <div className="history-list" aria-busy={loading}>
        {loading ? (
          <p className="history-feedback">Cargando historial…</p>
        ) : items.length === 0 ? (
          <EmptyState
            mascot="degustacion"
            title="No hay semanas históricas"
            description="Las semanas aparecen acá una vez que fueron cerradas."
          />
        ) : (
          <>
            <div className="history-list__header" aria-hidden="true">
              <span>Semana</span>
              <span>Pedidos</span>
              <span>Viandas</span>
              <span>Total</span>
              <span>Cancelaciones</span>
              <span>Sin responder</span>
            </div>
            <ul aria-label="Semanas históricas">
              {items.map((week) => (
                <li key={week.id}>
                  <button
                    type="button"
                    className="history-week-row"
                    onClick={() => void openWeekDetail(week)}
                    aria-label={`Abrir detalle de la semana ${formatDate(week.startDate)} a ${formatDate(week.endDate)}`}
                  >
                    <div>
                      <strong>
                        {formatDate(week.startDate)} —{" "}
                        {formatDate(week.endDate)}
                      </strong>
                      <span>{week.expectedClientCount} clientes esperados</span>
                    </div>
                    <span>{week.orderCount}</span>
                    <span>{week.totalQuantity}</span>
                    <strong>{formatAmount(week.totalAmount)}</strong>
                    <span>{week.cancellationCount}</span>
                    <span
                      className={
                        week.unansweredClientCount > 0
                          ? "history-unanswered-button"
                          : "history-unanswered-button history-unanswered-button--empty"
                      }
                    >
                      {week.unansweredClientCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {!loading && total > 0 && (
        <nav
          className="history-pagination"
          aria-label="Paginación del historial"
        >
          <span>
            Página {page} de {totalPages} · {total} semana
            {total === 1 ? "" : "s"}
          </span>
          <div>
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Siguiente
            </button>
          </div>
        </nav>
      )}

      {selectedWeek && (
        <div className="history-overlay" role="presentation">
          <aside
            className="history-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-drawer-title"
          >
            <header>
              <div>
                <p>Semana cerrada</p>
                <h2 id="history-drawer-title">
                  {formatDate(selectedWeek.startDate)} —{" "}
                  {formatDate(selectedWeek.endDate)}
                </h2>
              </div>
              <button type="button" onClick={closeDrawer} aria-label="Cerrar">
                ×
              </button>
            </header>

            <dl className="history-summary">
              <div>
                <dt>Pedidos</dt>
                <dd>{selectedWeek.orderCount}</dd>
              </div>
              <div>
                <dt>Viandas</dt>
                <dd>{selectedWeek.totalQuantity}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{formatAmount(selectedWeek.totalAmount)}</dd>
              </div>
              <div>
                <dt>Cancelaciones</dt>
                <dd>{selectedWeek.cancellationCount}</dd>
              </div>
            </dl>

            {detailLoading ? (
              <p className="history-feedback">Cargando detalle…</p>
            ) : detailError ? (
              <p
                className="history-feedback history-feedback--error"
                role="alert"
              >
                {detailError}
              </p>
            ) : (
              <>
                <section aria-labelledby="history-orders-title">
                  <div className="history-section-heading">
                    <h3 id="history-orders-title">Pedidos</h3>
                    <span>{weekDetail?.orders.length ?? 0}</span>
                  </div>
                  {weekDetail?.orders.length ? (
                    <ul className="history-event-list">
                      {weekDetail.orders.map((order) => (
                        <li key={order.id}>
                          <div>
                            <strong>
                              {order.client?.name ?? "Cliente sin nombre"}
                            </strong>
                            <span>
                              {order.weekDay
                                ? formatDate(order.weekDay.date)
                                : "Día no disponible"}
                              {" · "}
                              {order.option?.name ?? "Opción no disponible"}
                            </span>
                          </div>
                          <div className="history-event-list__meta">
                            <span>
                              {formatOptionType(order.option?.type ?? "dish")} ·{" "}
                              {formatModality(order.modality)}
                            </span>
                            <strong>
                              {order.quantity} ×{" "}
                              {formatAmount(order.appliedPrice)}
                            </strong>
                            {order.notes && <small>{order.notes}</small>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="history-feedback">
                      No hubo pedidos en esta semana.
                    </p>
                  )}
                </section>

                <section aria-labelledby="history-cancellations-title">
                  <div className="history-section-heading">
                    <h3 id="history-cancellations-title">Cancelaciones</h3>
                    <span>{weekDetail?.cancellations.length ?? 0}</span>
                  </div>
                  {weekDetail?.cancellations.length ? (
                    <ul className="history-event-list">
                      {weekDetail.cancellations.map((cancellation) => (
                        <li key={cancellation.id}>
                          <div>
                            <strong>
                              {cancellation.client?.name ??
                                "Cliente sin nombre"}
                            </strong>
                            <span>
                              {cancellation.weekDay
                                ? formatDate(cancellation.weekDay.date)
                                : "Día no disponible"}
                            </span>
                          </div>
                          <span className="history-event-list__status">
                            Canceló
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="history-feedback">
                      No hubo cancelaciones en esta semana.
                    </p>
                  )}
                </section>
              </>
            )}

            <section aria-labelledby="history-unanswered-title">
              <div className="history-section-heading">
                <h3 id="history-unanswered-title">Clientes sin responder</h3>
                <span>{selectedWeek.unansweredClientCount}</span>
              </div>
              {unansweredLoading ? (
                <p className="history-feedback">Cargando…</p>
              ) : unansweredError ? (
                <p
                  className="history-feedback history-feedback--error"
                  role="alert"
                >
                  {unansweredError}
                </p>
              ) : unanswered.length === 0 ? (
                <p className="history-feedback">
                  Todos los clientes esperados respondieron.
                </p>
              ) : (
                <ul className="history-unanswered-list">
                  {unanswered.map((client) => (
                    <li key={client.clientId}>
                      <strong>
                        {client.client?.name ?? "Cliente sin nombre"}
                      </strong>
                      <span>{client.client?.phone ?? "Sin teléfono"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}
