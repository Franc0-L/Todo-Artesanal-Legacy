import { useState } from "react";
import { formatCurrency, formatDate } from "../../lib/formatters";
import { useConfirm } from "../../components/ui/useConfirm";
import { DAY_LABELS } from "../semanas/day-labels";
import {
  createOrder,
  deleteOrder,
  updateOrder,
} from "../pedidos/services/orders.service";
import {
  createCancellation,
  deleteCancellation,
} from "../cancelaciones/services/cancellations.service";
import { ClientOrderLine } from "./ClientOrderLine";
import { actionErrorMessage } from "./menu-errors";
import { MODALITY_LABELS } from "./menu-labels";
import { priceKey } from "./types/menu-data";
import type { Modality } from "../../types/domain";
import type { MenuClient } from "./types/client-session";
import type { WeekDayOption, WeekOfferDay } from "../semanas/types/week-offer";
import type { OrderDetail } from "../pedidos/types/order-detail";
import type { Cancellation } from "../cancelaciones/types/cancellation";

interface ClientDayCardProps {
  day: WeekOfferDay;
  orders: OrderDetail[];
  cancellation: Cancellation | null;
  prices: Record<string, number>;
  allowsHalfPortion: boolean;
  clientId: string;
  client: MenuClient;
  /** Vuelve a cargar toda la semana (`reload()` del hook). */
  onChanged: () => void;
}

interface Composing {
  optionId: string;
  modality: Modality;
}

/**
 * Un día de la semana activa para el cliente.
 *
 * Reglas que refleja (y que la DB también hace cumplir):
 *  - la modalidad `general` / `opcional` la determina la opción de oferta;
 *  - `media_vianda` desde la oferta solo si el cliente la tiene habilitada;
 *  - no puede haber pedido y cancelación el mismo día, así que cuando hay
 *    un pedido no se ofrece cancelar, y cuando hay cancelación no se pide.
 */
export function ClientDayCard({
  day,
  orders,
  cancellation,
  prices,
  allowsHalfPortion,
  clientId,
  client,
  onChanged,
}: ClientDayCardProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState<Composing | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  const weekDayId = day.weekDay.id;

  function startCompose(option: WeekDayOption, modality: Modality) {
    setError(null);
    setQuantity(1);
    setNotes("");
    setComposing({ optionId: option.id, modality });
  }

  function cancelCompose() {
    setComposing(null);
  }

  async function run(action: string, operation: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await operation();
      onChanged();
    } catch (err: unknown) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function confirmOrder() {
    if (!composing) return;
    const current = composing;
    void run("create", async () => {
      await createOrder(
        {
          clientId,
          weekDayId,
          weekDayOptionId: current.optionId,
          modality: current.modality,
          quantity,
          notes: notes.trim() || null,
        },
        client,
      );
      setComposing(null);
    });
  }

  function changeQuantity(order: OrderDetail, nextQuantity: number) {
    void run(`qty:${order.id}`, () =>
      updateOrder(order.id, { quantity: nextQuantity }, client),
    );
  }

  function saveNotes(order: OrderDetail, nextNotes: string | null) {
    void run(`notes:${order.id}`, () =>
      updateOrder(order.id, { notes: nextNotes }, client),
    );
  }

  async function removeOrder(order: OrderDetail) {
    const proceed = await confirm({
      title: "Quitar pedido",
      message: `¿Quitar "${order.option?.name ?? "tu pedido"}" del ${DAY_LABELS[day.weekDay.dayOfWeek].toLowerCase()}?`,
      confirmLabel: "Quitar",
      tone: "danger",
    });
    if (!proceed) return;
    void run(`remove:${order.id}`, () => deleteOrder(order.id, client));
  }

  async function cancelDay() {
    const proceed = await confirm({
      message: `¿Avisar que no vas a recibir vianda el ${DAY_LABELS[day.weekDay.dayOfWeek].toLowerCase()}?`,
      confirmLabel: "No quiero ese día",
    });
    if (!proceed) return;
    void run("cancel", () => createCancellation({ clientId, weekDayId }, client));
  }

  function undoCancel() {
    if (!cancellation) return;
    void run("uncancel", () => deleteCancellation(cancellation.id, client));
  }

  function priceOf(optionId: string, modality: Modality): string {
    const value = prices[priceKey(optionId, modality)];
    return value === undefined ? "—" : formatCurrency(value);
  }

  const isBusy = busy !== null;

  return (
    <article className="client-day" aria-labelledby={`day-${weekDayId}`}>
      <header className="client-day__header">
        <h3 id={`day-${weekDayId}`}>{DAY_LABELS[day.weekDay.dayOfWeek]}</h3>
        <span className="client-day__date">{formatDate(day.weekDay.date)}</span>
      </header>

      {error && (
        <div className="client-day__error" role="alert">
          {error}
        </div>
      )}

      {cancellation && orders.length === 0 ? (
        <div className="client-day__cancelled">
          <p>Avisaste que no vas a recibir vianda este día.</p>
          <button type="button" disabled={isBusy} onClick={undoCancel}>
            {busy === "uncancel" ? "Reactivando…" : "Volver a pedir"}
          </button>
        </div>
      ) : orders.length > 0 ? (
        <ul className="client-day__orders">
          {orders.map((order) => (
            <ClientOrderLine
              key={`${order.id}:${order.updatedAt}`}
              order={order}
              busy={isBusy}
              onChangeQuantity={(next) => changeQuantity(order, next)}
              onSaveNotes={(next) => saveNotes(order, next)}
              onRemove={() => void removeOrder(order)}
            />
          ))}
        </ul>
      ) : (
        <>
          <ul className="client-day__options">
            {day.options.map((option) => (
              <li key={option.id} className="client-option">
                <div className="client-option__info">
                  <span className="client-option__name">
                    {optionName(option)}
                  </span>
                  <span className="client-menu__chip">
                    {MODALITY_LABELS[option.offerModality]}
                  </span>
                </div>
                <div className="client-option__actions">
                  <span className="client-option__price">
                    {priceOf(option.id, option.offerModality)}
                  </span>
                  <button
                    type="button"
                    disabled={isBusy || composing !== null}
                    onClick={() => startCompose(option, option.offerModality)}
                  >
                    Pedir
                  </button>
                  {allowsHalfPortion && (
                    <button
                      type="button"
                      className="client-option__half"
                      disabled={isBusy || composing !== null}
                      onClick={() => startCompose(option, "media_vianda")}
                    >
                      Media vianda · {priceOf(option.id, "media_vianda")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {composing && (
            <div className="client-day__composer">
              <p className="client-day__composer-title">
                {MODALITY_LABELS[composing.modality]} ·{" "}
                {priceOf(composing.optionId, composing.modality)}
              </p>
              <label className="client-day__composer-field">
                <span>Cantidad</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(clampQuantity(event.target.value))
                  }
                />
              </label>
              <label className="client-day__composer-field">
                <span>Notas (opcional)</span>
                <input
                  type="text"
                  maxLength={200}
                  value={notes}
                  placeholder="Sin cebolla, porción grande…"
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              <div className="client-day__composer-actions">
                <button type="button" disabled={isBusy} onClick={cancelCompose}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="client-day__confirm"
                  disabled={isBusy}
                  onClick={confirmOrder}
                >
                  {busy === "create" ? "Guardando…" : "Confirmar pedido"}
                </button>
              </div>
            </div>
          )}

          {!composing && (
            <button
              type="button"
              className="client-day__skip"
              disabled={isBusy}
              onClick={() => void cancelDay()}
            >
              No quiero ese día
            </button>
          )}
        </>
      )}

      {confirmDialog}
    </article>
  );
}

function optionName(option: WeekDayOption): string {
  return option.dishVersion?.name ?? option.menuVersion?.name ?? "Opción";
}

function clampQuantity(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), 99);
}
