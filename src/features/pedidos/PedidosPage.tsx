import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderDrawer } from "./OrderDrawer";
import { EmptyState } from "../../components/ui/EmptyState";
import { getOrderTotals, listAllOrders } from "./services/orders.service";
import { getActiveWeek, listWeeks } from "../semanas/services/weeks.service";
import { listWeekDays } from "../semanas/services/week-days.service";
import { DAY_LABELS } from "../semanas/day-labels";
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

type ModalityFilter = "all" | Modality;

const MODALITY_LABELS: Record<Modality, string> = {
  general: "General",
  opcional: "Opcional",
  media_vianda: "Media vianda",
};

/** Pedidos de un cliente, con sus subtotales, para el listado agrupado. */
interface ClientOrderGroup {
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  orders: OrderDetail[];
  quantity: number;
  amount: number;
}

function weekStatusLabel(status: WeekListItem["status"]): string {
  if (status === "active") return "activa";
  if (status === "draft") return "borrador";
  return "cerrada";
}

/** Ordena los pedidos de un cliente por día de la semana (lunes → viernes). */
function compareOrdersByDay(a: OrderDetail, b: OrderDetail): number {
  const dayA = a.weekDay?.dayOfWeek ?? 0;
  const dayB = b.weekDay?.dayOfWeek ?? 0;

  if (dayA !== dayB) return dayA - dayB;

  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * Agrupa los pedidos por cliente.
 *
 * El listado muestra una tarjeta por cliente con sus pedidos adentro, así el
 * nombre no se repite fila por fila y los pedidos de un mismo cliente dejan de
 * quedar dispersos. Dentro de cada grupo los pedidos van por día (lunes
 * primero) y los grupos en orden alfabético.
 */
function groupOrdersByClient(orders: OrderDetail[]): ClientOrderGroup[] {
  const byClient = new Map<string, ClientOrderGroup>();

  for (const order of orders) {
    const current = byClient.get(order.clientId);
    const lineAmount = order.quantity * order.appliedPrice;

    if (current) {
      current.orders.push(order);
      current.quantity += order.quantity;
      current.amount += lineAmount;
      continue;
    }

    byClient.set(order.clientId, {
      clientId: order.clientId,
      clientName: order.client?.name ?? "Cliente",
      clientPhone: order.client?.phone ?? null,
      orders: [order],
      quantity: order.quantity,
      amount: lineAmount,
    });
  }

  return [...byClient.values()]
    .map((group) => ({
      ...group,
      amount: Math.round(group.amount * 100) / 100,
      orders: [...group.orders].sort(compareOrdersByDay),
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName, "es"));
}

export function PedidosPage() {
  const [weeks, setWeeks] = useState<WeekListItem[]>([]);
  const [weekId, setWeekId] = useState("");
  const [activeWeekId, setActiveWeekId] = useState<string | null>(null);
  // Los días se guardan junto a la semana a la que pertenecen, y la selección
  // del día junto a la semana en la que se eligió: así el estado válido se
  // deriva al renderizar al cambiar de semana, sin limpiarlo dentro de un efecto.
  const [weekDays, setWeekDays] = useState<{ weekId: string; days: WeekDay[] }>(
    {
      weekId: "",
      days: [],
    },
  );
  const [daySelection, setDaySelection] = useState<{
    weekId: string;
    weekDayId: string;
  }>({ weekId: "", weekDayId: "" });
  const days = weekDays.weekId === weekId ? weekDays.days : [];
  const weekDayId =
    daySelection.weekId === weekId ? daySelection.weekDayId : "";
  const [modalityFilter, setModalityFilter] = useState<ModalityFilter>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [weeksLoading, setWeeksLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  // Los pedidos se guardan junto a la clave de la consulta que los pidió: los
  // grupos, los totales, el `loading` y el error se derivan en el render, así
  // el efecto no sincroniza estado antes de pedir los datos y nunca se muestran
  // los de un filtro o error anteriores.
  const requestKey = `${weekId}|${weekDayId}|${modalityFilter}|${reloadToken}`;
  const [result, setResult] = useState<{
    key: string;
    orders: OrderDetail[];
    totals: OrderTotals | null;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  // Sin semana elegida no hay consulta que hacer: el render muestra el aviso
  // de "no hay semanas creadas".
  const loading = weekId !== "" && result?.key !== requestKey;
  const totals = result?.key === requestKey ? result.totals : null;
  const listError = failure?.key === requestKey ? failure.message : null;
  // Errores que no son del listado (carga de semanas).
  const [error, setError] = useState<string | null>(null);
  const visibleError = listError ?? error;

  // La agrupación se deriva de los pedidos ya cargados: si la respuesta no
  // corresponde a la consulta vigente, el listado queda vacío.
  const groups = useMemo(
    () => groupOrdersByClient(result?.key === requestKey ? result.orders : []),
    [requestKey, result],
  );

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

  useEffect(() => {
    if (!weekId) return;
    let cancelled = false;
    void listWeekDays(weekId)
      .then((daysResult) => {
        if (!cancelled) setWeekDays({ weekId, days: daysResult });
      })
      .catch(() => {
        if (!cancelled) setWeekDays({ weekId, days: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [weekId]);

  useEffect(() => {
    if (!weekId) return;

    let cancelled = false;
    const params = {
      weekId,
      weekDayId: weekDayId || undefined,
      modality: modalityFilter === "all" ? undefined : modalityFilter,
    };

    void Promise.all([listAllOrders(params), getOrderTotals(params)])
      .then(([loaded, totalsResult]) => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          orders: loaded.items,
          totals: totalsResult,
        });
        setFailure(null);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setResult({ key: requestKey, orders: [], totals: null });
        setFailure({
          key: requestKey,
          message:
            loadError instanceof Error
              ? loadError.message
              : "No se pudieron cargar los pedidos.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [modalityFilter, requestKey, weekDayId, weekId]);

  const handleCloseDrawer = useCallback(() => {
    setSelectedOrderId(null);
    setCreateDrawerOpen(false);
  }, []);

  const handleOrderCreated = useCallback(() => {
    setCreateDrawerOpen(false);
    reload();
  }, [reload]);

  const handleOrderSaved = useCallback(() => {
    reload();
  }, [reload]);

  const handleOrderDeleted = useCallback(() => {
    setSelectedOrderId(null);
    reload();
  }, [reload]);

  function handleWeekChange(value: string) {
    setError(null);
    setWeekId(value);
    setDaySelection({ weekId: value, weekDayId: "" });
  }

  function handleDayChange(value: string) {
    setError(null);
    setDaySelection({ weekId, weekDayId: value });
  }

  function handleModalityChange(value: ModalityFilter) {
    setError(null);
    setModalityFilter(value);
  }

  // Remonta el drawer al cambiar de pedido o de modo: el formulario arranca
  // limpio (estado inicial correcto) sin limpiar estado dentro de un efecto.
  const drawerKey = createDrawerOpen
    ? "create"
    : `edit:${selectedOrderId ?? "closed"}`;

  return (
    <section className="pedidos-page" aria-labelledby="pedidos-title">
      <header className="pedidos-page__header">
        <div className="pedidos-page__heading-row">
          <div>
            <p className="pedidos-page__eyebrow">Administración</p>
            <h1 id="pedidos-title">Pedidos</h1>
            <p className="pedidos-page__description">
              Consultá y ajustá los pedidos de una semana, agrupados por
              cliente. El precio aplicado queda congelado al crear cada pedido.
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
          <div>
            <strong>{groups.length}</strong>
            <span>Clientes</span>
          </div>
        </div>
      )}

      {visibleError && (
        <div className="pedidos-feedback pedidos-feedback--error" role="alert">
          <p>{visibleError}</p>
          <button type="button" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}

      <div className="pedidos-list-wrapper" aria-busy={loading}>
        {!weekId ? (
          <EmptyState
            mascot="preparacion"
            title="No hay semanas creadas"
            description="Creá una semana desde la sección Semanas para poder cargar pedidos."
          />
        ) : loading ? (
          <p className="pedidos-feedback">Cargando pedidos…</p>
        ) : groups.length === 0 ? (
          <EmptyState
            mascot="icon_pedir"
            title="No hay pedidos para mostrar"
            description="Probá cambiar los filtros o cargar un pedido nuevo."
          />
        ) : (
          <ul
            className="pedidos-groups"
            aria-label="Pedidos agrupados por cliente"
          >
            {groups.map((group) => (
              <li key={group.clientId} className="pedido-group">
                <header className="pedido-group__header">
                  <div className="pedido-group__client">
                    <strong>{group.clientName}</strong>
                    <span>{group.clientPhone ?? "sin teléfono"}</span>
                  </div>
                  <div className="pedido-group__totals">
                    <span className="pedido-group__count">
                      {group.quantity} vianda{group.quantity === 1 ? "" : "s"}
                    </span>
                    <span className="pedido-group__amount">
                      {formatCurrency(group.amount)}
                    </span>
                  </div>
                </header>

                <div className="pedido-group__columns" aria-hidden="true">
                  <span>Día</span>
                  <span>Opción</span>
                  <span>Modalidad</span>
                  <span>Cant.</span>
                  <span>Total</span>
                </div>

                <ul className="pedido-group__orders">
                  {group.orders.map((order) => (
                    <li key={order.id}>
                      <button
                        className="order-row"
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        aria-label={`Abrir pedido de ${group.clientName} del ${
                          order.weekDay
                            ? DAY_LABELS[order.weekDay.dayOfWeek]
                            : "día sin fecha"
                        }`}
                      >
                        <span className="order-row__day">
                          {order.weekDay
                            ? DAY_LABELS[order.weekDay.dayOfWeek]
                            : "—"}
                        </span>
                        <span className="order-row__option">
                          <span
                            className={`order-option-chip order-option-chip--${
                              order.option?.type ?? "dish"
                            }`}
                          >
                            {order.option?.type === "menu" ? "Menú" : "Plato"}
                          </span>
                          {order.option?.name ?? "—"}
                        </span>
                        <span
                          className={`order-modality-chip order-modality-chip--${order.modality}`}
                        >
                          {MODALITY_LABELS[order.modality]}
                        </span>
                        <span className="order-row__quantity">
                          {order.quantity}
                        </span>
                        <span className="order-row__total">
                          {formatCurrency(order.quantity * order.appliedPrice)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      <OrderDrawer
        key={drawerKey}
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
