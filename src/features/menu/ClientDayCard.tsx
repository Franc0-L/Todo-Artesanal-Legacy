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
import { ClientCatalogPicker } from "./ClientCatalogPicker";
import { ClientOrderLine } from "./ClientOrderLine";
import { getEffectivePrice } from "./services/menu-pricing.service";
import { actionErrorMessage } from "./menu-errors";
import { MODALITY_LABELS } from "./menu-labels";
import { priceKey } from "./types/menu-data";
import type { CatalogItem } from "./services/menu-catalog.service";
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

/**
 * Fuente del producto que se está por pedir:
 *  - `offer`: una opción General/Opcional del día (o su media vianda);
 *  - `catalog`: media vianda libre de cualquier plato/menú del catálogo.
 */
type Composing =
  | { source: "offer"; optionId: string; modality: Modality }
  | { source: "catalog"; item: CatalogItem };

/**
 * Un día de la semana activa para el cliente.
 *
 * Reglas que refleja (y que la DB también hace cumplir):
 *  - la modalidad `general` / `opcional` la determina la opción de oferta;
 *  - `media_vianda` desde la oferta o desde el catálogo solo si el cliente
 *    la tiene habilitada;
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalogPrices, setCatalogPrices] = useState<Record<string, number>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  const weekDayId = day.weekDay.id;

  function startCompose(option: WeekDayOption, modality: Modality) {
    setError(null);
    setQuantity(1);
    setNotes("");
    setComposing({ source: "offer", optionId: option.id, modality });
  }

  /**
   * ¿Ya existe exactamente este pedido (misma opción + misma modalidad)?
   *
   * El dominio solo prohíbe los pedidos idénticos: un cliente sí puede
   * tener **varios** pedidos en un día (por ejemplo, la opción General y
   * una media vianda del catálogo), siempre que no se repitan. Por eso la
   * tarjeta no se cierra al haber un pedido: solo deshabilita lo que ya
   * está pedido.
   */
  function hasOfferOrder(option: WeekDayOption, modality: Modality): boolean {
    return orders.some(
      (order) =>
        order.weekDayOptionId === option.id && order.modality === modality,
    );
  }

  function handlePickCatalog(item: CatalogItem) {
    setError(null);
    setQuantity(1);
    setNotes("");
    setPickerOpen(false);
    setComposing({ source: "catalog", item });

    void getEffectivePrice(
      item.type === "dish"
        ? { dishVersionId: item.versionId, modality: "media_vianda" }
        : { menuVersionId: item.versionId, modality: "media_vianda" },
      client,
    )
      .then((value) =>
        setCatalogPrices((current) => ({
          ...current,
          [item.versionId]: value,
        })),
      )
      .catch(() => {
        // Sin precio la UI muestra "—"; el real lo congela el trigger.
      });
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
    const trimmedNotes = notes.trim() || null;

    void run("create", async () => {
      if (current.source === "offer") {
        await createOrder(
          {
            clientId,
            weekDayId,
            weekDayOptionId: current.optionId,
            modality: current.modality,
            quantity,
            notes: trimmedNotes,
          },
          client,
        );
      } else if (current.item.type === "dish") {
        await createOrder(
          {
            clientId,
            weekDayId,
            dishVersionId: current.item.versionId,
            modality: "media_vianda",
            quantity,
            notes: trimmedNotes,
          },
          client,
        );
      } else {
        await createOrder(
          {
            clientId,
            weekDayId,
            menuVersionId: current.item.versionId,
            modality: "media_vianda",
            quantity,
            notes: trimmedNotes,
          },
          client,
        );
      }
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

  function composePriceLabel(): string {
    if (!composing) return "—";
    if (composing.source === "offer") {
      return priceOf(composing.optionId, composing.modality);
    }
    const value = catalogPrices[composing.item.versionId];
    return value === undefined ? "—" : formatCurrency(value);
  }

  function composeTitle(): string {
    if (!composing) return "";
    if (composing.source === "offer") {
      return `${MODALITY_LABELS[composing.modality]} · ${composePriceLabel()}`;
    }
    return `${composing.item.name} · Media vianda · ${composePriceLabel()}`;
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
      ) : (
        <>
          {orders.length > 0 && (
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
          )}

          {pickerOpen ? (
            <ClientCatalogPicker
              client={client}
              onPick={handlePickCatalog}
              onClose={() => setPickerOpen(false)}
            />
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
                        disabled={
                          isBusy ||
                          composing !== null ||
                          hasOfferOrder(option, option.offerModality)
                        }
                        onClick={() =>
                          startCompose(option, option.offerModality)
                        }
                      >
                        {hasOfferOrder(option, option.offerModality)
                          ? "Ya pediste"
                          : "Pedir"}
                      </button>
                      {allowsHalfPortion && (
                        <button
                          type="button"
                          className="client-option__half"
                          disabled={
                            isBusy ||
                            composing !== null ||
                            hasOfferOrder(option, "media_vianda")
                          }
                          onClick={() => startCompose(option, "media_vianda")}
                        >
                          {hasOfferOrder(option, "media_vianda")
                            ? "Ya pediste"
                            : `Media vianda · ${priceOf(option.id, "media_vianda")}`}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {composing ? (
                <div className="client-day__composer">
                  <p className="client-day__composer-title">{composeTitle()}</p>
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
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={cancelCompose}
                    >
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
              ) : allowsHalfPortion || orders.length === 0 ? (
                <div className="client-day__extras">
                  {allowsHalfPortion && (
                    <button
                      type="button"
                      className="client-day__catalog-btn"
                      disabled={isBusy}
                      onClick={() => setPickerOpen(true)}
                    >
                      Media vianda del catálogo
                    </button>
                  )}
                  {orders.length === 0 && (
                    <button
                      type="button"
                      className="client-day__skip"
                      disabled={isBusy}
                      onClick={() => void cancelDay()}
                    >
                      No quiero ese día
                    </button>
                  )}
                </div>
              ) : null}
            </>
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
