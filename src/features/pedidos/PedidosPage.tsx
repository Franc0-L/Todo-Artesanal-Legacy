import { useCallback, useEffect, useState } from "react";
import { OrderDrawer } from "./OrderDrawer";
import { getOrderTotals, listOrders } from "./services/orders.service";
import { getActiveWeek, listWeeks } from "../semanas/services/weeks.service";
import { listWeekDays } from "../semanas/services/week-days.service";
import {
  formatCurrency,
  formatDate,
  formatDateRange,
} from "../../lib/formatters";
import type { Modality } from "../../types/domain";
import type { WeekDay } from "../semanas/types/week-day";
import type { WeekListItem } from "../semanas/types/week-list";
import type { OrderDetail } from "./types/order-detail";
import type { OrderTotals } from "./types/order-totals";
import "./pedidos.css";
import "./pedido-details.css";

const PAGE_SIZE = 20;
type ModalityFilter = "all" | Modality;

const MODALITY_LABELS: Record<Modality, string> = {
  general: "General",
  opcional: "Opcional",
  media_vianda: "Media vianda",
};

const DAY_LABELS: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
};

function weekStatusLabel(status: WeekListItem["status"]): string {
  if (status === "active") return "activa";
  if (status === "draft") return "borrador";
  return "cerrada";
}

export function PedidosPage() {
  const [weeks, setWeeks] = useState<WeekListItem[]>([]);
  const [weekId, setWeekId] = useState("");
  const [activeWeekId, setActiveWeekId] = useState<string | null>(null);
  const [days, setDays] = useState<WeekDay[]>([]);
  const [weekDayId, setWeekDayId] = useState("");
  const [modalityFilter, setModalityFilter] = useState<ModalityFilter>("all");

  const [items, setItems] = useState<OrderDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totals, setTotals] = useState<OrderTotals | null>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);

  const [weeksLoading, setWeeksLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Semanas para el selector, priorizando la activa como default.
  useEffect(() => {
    let cancelled = false;
    function init() {
      setWeeksLoading(true);
    }
    init();

    void Promise.all([listWeeks({ pageSize: 100 }), getActiveWeek()])
      .then(([weeksResult, active]) => {
        if (cancelled) return;
        setWeeks(weeksResult.items);
        setActiveWeekId(active?.id ?? null);
        setWeekId(
          (current) => current || active?.id || weeksResult.items[0]?.id || "",
        );
      })
      .catch((weeksError: unknown) => {
        if (!cancelled) {
          setError(
            weeksError instanceof Error
              ? weeksError.message
              : "No se pudieron cargar las semanas.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setWeeksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Días de la semana elegida en el filtro.
  useEffect(() => {
    if (!weekId) {
      function resetDays() {
        setDays([]);
        setWeekDayId("");
      }
      resetDays();
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

    return () => {
      cancelled = true;
    };
  }, [weekId]);

  const loadOrders = useCallback(async () => {
    if (!weekId) {
      setItems([]);
      setTotal(0);
      setTotals(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = {
        weekId,
        weekDayId: weekDayId || undefined,
        modality: modalityFilter === "all" ? undefined : modalityFilter,
      };

      const [result, totalsResult] = await Promise.all([
        listOrders({ ...params, page, pageSize: PAGE_SIZE }),
        getOrderTotals(params),
      ]);

      setItems(result.items);
      setTotal(result.total);
      setTotals(totalsResult);
    } catch (loadError) {
      setItems([]);
      setTotal(0);
      setTotals(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar los pedidos.",
      );
    } finally {
      setLoading(false);
    }
  }, [weekId, weekDayId, modalityFilter, page]);

  useEffect(() => {
    function run() {
      void loadOrders();
    }
    run();
  }, [loadOrders]);

  const handleCloseDrawer = useCallback(() => {
    setSelectedOrderId(null);
    setCreateDrawerOpen(false);
  }, []);

  const handleOrderCreated = useCallback(() => {
    setCreateDrawerOpen(false);
    setPage(1);
    void loadOrders();
  }, [loadOrders]);

  const handleOrderSaved = useCallback(() => {
    // La cantidad puede cambiar el total agregado; recargamos en vez de
    // parchear el ítem a mano.
    void loadOrders();
  }, [loadOrders]);

  const handleOrderDeleted = useCallback(() => {
    setSelectedOrderId(null);
    void loadOrders();
  }, [loadOrders]);

  function handleWeekChange(value: string) {
    setPage(1);
    setWeekId(value);
  }

  function handleDayChange(value: string) {
    setPage(1);
    setWeekDayId(value);
  }

  function handleModalityChange(value: ModalityFilter) {
    setPage(1);
    setModalityFilter(value);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="pedidos-page" aria-labelledby="pedidos-title">
      <header className="pedidos-page__header">
        <div className="pedidos-page__heading-row">
          <div>
            <p className="pedidos-page__eyebrow">Administración</p>
            <h1 id="pedidos-title">Pedidos</h1>
            <p className="pedidos-page__description">
              Consultá y ajustá los pedidos de una semana. El precio aplicado
              queda congelado al crear cada pedido.
            </p>
          </div>
          <button
            className="pedidos-primary-action"
            type="button"
            onClick={() => {
              setSelectedOrderId(null);
              setCreateDrawerOpen(true);
            }}
            disabled={weeksLoading || !activeWeekId}
            title={!activeWeekId ? "No hay una semana activa" : undefined}
          >
            Nuevo pedido
          </button>
        </div>
      </header>

      <div className="pedidos-toolbar">
        <div className="pedidos-filter">
          <label htmlFor="order-week">Semana</label>
          <select
            id="order-week"
            value={weekId}
            onChange={(event) => handleWeekChange(event.target.value)}
            disabled={weeksLoading}
          >
            {weeks.length === 0 && <option value="">Sin semanas</option>}
            {weeks.map((week) => (
              <option key={week.id} value={week.id}>
                {formatDateRange(week.startDate, week.endDate)} (
                {weekStatusLabel(week.status)})
              </option>
            ))}
          </select>
        </div>

        <div className="pedidos-filter">
          <label htmlFor="order-day">Día</label>
          <select
            id="order-day"
            value={weekDayId}
            onChange={(event) => handleDayChange(event.target.value)}
            disabled={days.length === 0}
          >
            <option value="">Todos</option>
            {days.map((day) => (
              <option key={day.id} value={day.id}>
                {DAY_LABELS[day.dayOfWeek]} ({formatDate(day.date)})
              </option>
            ))}
          </select>
        </div>

        <div className="pedidos-filter">
          <label htmlFor="order-modality">Modalidad</label>
          <select
            id="order-modality"
            value={modalityFilter}
            onChange={(event) =>
              handleModalityChange(event.target.value as ModalityFilter)
            }
          >
            <option value="all">Todas</option>
            <option value="general">General</option>
            <option value="opcional">Opcional</option>
            <option value="media_vianda">Media vianda</option>
          </select>
        </div>
      </div>

      {totals && (
        <div className="pedidos-summary">
          <div>
            <strong>{totals.orderCount}</strong>
            <span>Pedidos</span>
          </div>
          <div>
            <strong>{totals.totalQuantity}</strong>
            <span>Viandas</span>
          </div>
          <div>
            <strong>{formatCurrency(totals.totalAmount)}</strong>
            <span>Total</span>
          </div>
        </div>
      )}

      {error && (
        <div className="pedidos-feedback pedidos-feedback--error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void loadOrders()}>
            Reintentar
          </button>
        </div>
      )}

      <div className="pedidos-list-wrapper" aria-busy={loading}>
        {!weekId ? (
          <div className="pedidos-feedback">
            <h2>No hay semanas creadas</h2>
            <p>
              Creá una semana desde la sección Semanas para poder cargar
              pedidos.
            </p>
          </div>
        ) : loading ? (
          <p className="pedidos-feedback">Cargando pedidos…</p>
        ) : items.length === 0 ? (
          <div className="pedidos-feedback">
            <h2>No hay pedidos para mostrar</h2>
            <p>Probá cambiar los filtros o cargar un pedido nuevo.</p>
          </div>
        ) : (
          <>
            <div className="pedidos-list-header" aria-hidden="true">
              <span>Cliente</span>
              <span>Día</span>
              <span>Opción</span>
              <span>Modalidad</span>
              <span>Cant.</span>
              <span>Total</span>
            </div>
            <ul className="pedidos-list" aria-label="Listado de pedidos">
              {items.map((order) => (
                <li key={order.id}>
                  <button
                    className="order-row"
                    type="button"
                    onClick={() => setSelectedOrderId(order.id)}
                    aria-label={`Abrir pedido de ${order.client?.name ?? "cliente"}`}
                  >
                    <strong>{order.client?.name ?? "Cliente"}</strong>
                    <span>
                      {order.weekDay
                        ? DAY_LABELS[order.weekDay.dayOfWeek]
                        : "—"}
                    </span>
                    <span>{order.option?.name ?? "—"}</span>
                    <span>{MODALITY_LABELS[order.modality]}</span>
                    <span>{order.quantity}</span>
                    <span>
                      {formatCurrency(order.quantity * order.appliedPrice)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {!loading && total > 0 && (
        <nav className="pedidos-pagination" aria-label="Paginación de pedidos">
          <span>
            Página {page} de {totalPages} · {total} pedido
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

      <OrderDrawer
        mode={createDrawerOpen ? "create" : "edit"}
        orderId={createDrawerOpen ? null : selectedOrderId}
        onClose={handleCloseDrawer}
        onCreated={handleOrderCreated}
        onSaved={handleOrderSaved}
        onDeleted={handleOrderDeleted}
      />
    </section>
  );
}
