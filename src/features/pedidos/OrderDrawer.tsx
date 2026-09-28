import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  createOrder,
  deleteOrder,
  getOrder,
  updateOrder,
} from "./services/orders.service";
import { getActiveWeek } from "../semanas/services/weeks.service";
import { getWeekOffer } from "../semanas/services/week-offer.service";
import { getExpectedClients } from "../semanas/services/week-expected-clients.service";
import { DAY_LABELS } from "../semanas/day-labels";
import {
  formatCurrency,
  formatDate,
  formatDateRange,
} from "../../lib/formatters";
import { useConfirm } from "../../components/ui/useConfirm";
import type { Modality } from "../../types/domain";
import type { CreateOrderInput, UpdateOrderInput } from "./types/order";
import type { OrderDetail } from "./types/order-detail";
import type { WeekDayOption, WeekOffer } from "../semanas/types/week-offer";
import type { WeekExpectedClient } from "../semanas/types/week-expected-clients";
import type { Week } from "../semanas/types/week";

interface OrderDrawerProps {
  mode: "create" | "edit";
  orderId: string | null;
  onClose: () => void;
  onCreated: (order: OrderDetail) => void;
  onSaved: (order: OrderDetail) => void;
  onDeleted: (orderId: string) => void;
}

const MODALITY_LABELS: Record<Modality, string> = {
  general: "General",
  opcional: "Opcional",
  media_vianda: "Media vianda",
};

export function OrderDrawer({
  mode,
  orderId,
  onClose,
  onCreated,
  onSaved,
  onDeleted,
}: OrderDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isCreateMode = mode === "create";
  // El drawer está abierto cuando se crea un pedido o hay uno seleccionado.
  const open = isCreateMode || orderId !== null;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [baselineQuantity, setBaselineQuantity] = useState("1");
  const [baselineNotes, setBaselineNotes] = useState("");
  const [activeWeek, setActiveWeek] = useState<Week | null>(null);
  const [offer, setOffer] = useState<WeekOffer | null>(null);
  const [expectedClients, setExpectedClients] = useState<WeekExpectedClient[]>(
    [],
  );
  const [selectedDayId, setSelectedDayId] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  // Media vianda es un flag aparte de la modalidad: General/Opcional las
  // define la oferta elegida, así que el flag se puede marcar antes de
  // elegir opción y la modalidad final se resuelve al enviar.
  const [mediaVianda, setMediaVianda] = useState(false);
  const [createQuantity, setCreateQuantity] = useState("1");
  const [createNotes, setCreateNotes] = useState("");
  // Arranca cargando si el drawer se abre para crear o para ver un pedido: el
  // estado inicial ya es correcto porque el componente se remonta por `key`.
  const [loading, setLoading] = useState(open);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const dirty = isCreateMode
    ? selectedOptionId !== "" || selectedClientId !== "" || mediaVianda
    : quantity !== baselineQuantity || notes !== baselineNotes;

  // El estado del formulario se reinicia por remonte (ver `key` en
  // PedidosPage): el drawer nunca pinta datos del pedido anterior.
  useEffect(() => {
    let cancelled = false;

    if (isCreateMode) {
      void getActiveWeek()
        .then((week) => {
          if (cancelled) return null;
          setActiveWeek(week);
          if (!week) return null;
          return Promise.all([
            getWeekOffer(week.id),
            getExpectedClients(week.id),
          ]);
        })
        .then((result) => {
          if (cancelled || !result) return;
          setOffer(result[0]);
          setExpectedClients(result[1].items);
        })
        .catch((loadError: unknown) => {
          if (!cancelled) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : "No se pudo cargar la semana activa.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else if (orderId) {
      void getOrder(orderId)
        .then((result) => {
          if (cancelled) return;
          setOrder(result);
          setQuantity(String(result.quantity));
          setNotes(result.notes ?? "");
          setBaselineQuantity(String(result.quantity));
          setBaselineNotes(result.notes ?? "");
        })
        .catch((loadError: unknown) => {
          if (!cancelled) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : "No se pudo cargar el pedido.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [orderId, isCreateMode]);

  useEffect(() => {
    if (!isCreateMode && !orderId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [orderId, isCreateMode]);

  const requestClose = useCallback(async () => {
    if (dirty) {
      const proceed = await confirm({
        title: "Cambios sin guardar",
        message:
          "Hay cambios sin guardar en este pedido. Si cerrás ahora, se van a perder.",
        confirmLabel: "Cerrar sin guardar",
        cancelLabel: "Seguir editando",
        tone: "danger",
      });
      if (!proceed) return;
    }
    onClose();
  }, [confirm, dirty, onClose]);

  useEffect(() => {
    if (!isCreateMode && !orderId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") void requestClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [orderId, isCreateMode, requestClose]);

  const selectedDay =
    offer?.days.find((day) => day.weekDay.id === selectedDayId) ?? null;
  const dayOptions: WeekDayOption[] = selectedDay?.options ?? [];
  const selectedOption =
    dayOptions.find((option) => option.id === selectedOptionId) ?? null;
  const offerModality = selectedOption?.offerModality ?? null;
  const selectedClientEntry =
    expectedClients.find((entry) => entry.clientId === selectedClientId) ??
    null;
  // La media vianda la habilita el cliente; la DB lo vuelve a validar al crear.
  const clientAllowsHalfPortion =
    selectedClientEntry?.client?.allowsHalfPortion ?? false;
  const mediaViandaBlocked =
    mediaVianda && selectedClientId !== "" && !clientAllowsHalfPortion;
  // Modalidad final: media_vianda si se marcó, si no la de la oferta elegida.
  const resolvedModality: Modality = mediaVianda
    ? "media_vianda"
    : (offerModality ?? "general");
  const filteredClients = expectedClients.filter((entry) => {
    const query = clientQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      (entry.client?.name ?? "").toLowerCase().includes(query) ||
      (entry.client?.phone ?? "").includes(query)
    );
  });

  function handleOptionChange(optionId: string) {
    setSelectedOptionId(optionId);
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    if (!selectedOptionId) {
      setError("Elegí una opción de oferta.");
      return;
    }
    if (!selectedClientId) {
      setError("Elegí un cliente.");
      return;
    }
    if (mediaVianda && !clientAllowsHalfPortion) {
      setError(
        `${selectedClientEntry?.client?.name ?? "El cliente"} no tiene habilitada la media vianda. Desmarcá la opción o elegí otro cliente.`,
      );
      return;
    }
    const quantityValue = Number(createQuantity);
    if (!Number.isInteger(quantityValue) || quantityValue < 1) {
      setError("La cantidad debe ser un entero mayor o igual a 1.");
      return;
    }
    setSaving(true);
    try {
      const input: CreateOrderInput = {
        clientId: selectedClientId,
        weekDayOptionId: selectedOptionId,
        modality: resolvedModality,
        quantity: quantityValue,
        notes: createNotes || null,
      };
      const created = await createOrder(input);
      onCreated(created);
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : "No se pudo crear el pedido.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !order) return;
    setError(null);
    const quantityValue = Number(quantity);
    if (!Number.isInteger(quantityValue) || quantityValue < 1) {
      setError("La cantidad debe ser un entero mayor o igual a 1.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateOrder(order.id, {
        quantity: quantityValue,
        notes: notes || null,
      } satisfies UpdateOrderInput);
      setOrder(updated);
      setQuantity(String(updated.quantity));
      setNotes(updated.notes ?? "");
      setBaselineQuantity(String(updated.quantity));
      setBaselineNotes(updated.notes ?? "");
      onSaved(updated);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudieron guardar los cambios.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!order || deleting) return;
    const proceed = await confirm({
      title: "Eliminar pedido",
      message: "¿Eliminar este pedido? Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!proceed) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteOrder(order.id);
      onDeleted(order.id);
    } catch (deleteError: unknown) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar el pedido (¿la semana está cerrada?).",
      );
    } finally {
      setDeleting(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="dish-drawer__backdrop"
        onMouseDown={() => void requestClose()}
      >
        <aside
          className="dish-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-drawer-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="dish-drawer__header">
            <div>
              <p className="pedidos-page__eyebrow">
                {isCreateMode ? "Nuevo pedido" : "Ficha de pedido"}
              </p>
              <h2 id="order-drawer-title">
                {isCreateMode
                  ? "Crear pedido"
                  : (order?.client?.name ?? "Pedido")}
              </h2>
            </div>
            <button
              ref={closeButtonRef}
              className="dish-drawer__close"
              type="button"
              onClick={() => void requestClose()}
              aria-label="Cerrar"
            >
              ×
            </button>
          </header>

          <div className="dish-drawer__body">
            {loading && <p className="pedidos-feedback">Cargando…</p>}
            {!loading && error && (
              <div
                className="pedidos-feedback pedidos-feedback--error"
                role="alert"
              >
                <p>{error}</p>
                <button type="button" onClick={() => setError(null)}>
                  Cerrar aviso
                </button>
              </div>
            )}

            {!loading && isCreateMode && !activeWeek && (
              <p className="dish-form__hint">
                No hay una semana activa. Activá una semana desde Semanas para
                poder cargar pedidos.
              </p>
            )}

            {!loading && isCreateMode && activeWeek && offer && (
              <form className="dish-form" onSubmit={handleCreateSubmit}>
                <p className="dish-form__hint">
                  Semana activa:{" "}
                  {formatDateRange(activeWeek.startDate, activeWeek.endDate)}.
                </p>

                <fieldset className="order-modality-toggle">
                  <legend>Modalidad del pedido</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={mediaVianda}
                      onChange={(event) => setMediaVianda(event.target.checked)}
                    />
                    Pedir como media vianda
                  </label>
                  <p>
                    {mediaVianda
                      ? `Se cobra el 50% del precio de la opción elegida${offerModality ? ` (oferta ${MODALITY_LABELS[offerModality]})` : ""}.`
                      : "La modalidad General u Opcional la define la opción de oferta que elijas."}
                  </p>
                  {mediaViandaBlocked && (
                    <p className="order-modality-toggle__warning" role="alert">
                      {selectedClientEntry?.client?.name ?? "El cliente"} no
                      tiene habilitada la media vianda.
                    </p>
                  )}
                </fieldset>

                <div className="dish-form__fields">
                  <label>
                    Día
                    <select
                      value={selectedDayId}
                      onChange={(event) => {
                        setSelectedDayId(event.target.value);
                        setSelectedOptionId("");
                      }}
                      required
                    >
                      <option value="">Elegir día…</option>
                      {offer.days.map((offerDay) => (
                        <option
                          key={offerDay.weekDay.id}
                          value={offerDay.weekDay.id}
                        >
                          {DAY_LABELS[offerDay.weekDay.dayOfWeek]} (
                          {formatDate(offerDay.weekDay.date)})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label
                    className={
                      mediaVianda ? "order-field--highlight" : undefined
                    }
                  >
                    Opción
                    <select
                      value={selectedOptionId}
                      onChange={(event) =>
                        handleOptionChange(event.target.value)
                      }
                      required
                      disabled={!selectedDayId}
                    >
                      <option value="">Elegir opción…</option>
                      {dayOptions.map((option) => {
                        const name =
                          option.optionType === "dish"
                            ? option.dishVersion?.name
                            : option.menuVersion?.name;
                        const price =
                          option.optionType === "dish"
                            ? option.dishVersion?.price
                            : option.menuVersion?.price;
                        return (
                          <option key={option.id} value={option.id}>
                            {option.offerModality === "general"
                              ? "General"
                              : "Opcional"}{" "}
                            · {option.optionType === "dish" ? "Plato" : "Menú"}:{" "}
                            {name} — {formatCurrency(price ?? 0)}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label>
                    Cantidad
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={createQuantity}
                      onChange={(event) =>
                        setCreateQuantity(event.target.value)
                      }
                      required
                    />
                  </label>
                </div>

                <div className="dish-form__fields">
                  <label>
                    Cliente
                    <input
                      type="search"
                      value={clientQuery}
                      onChange={(event) => setClientQuery(event.target.value)}
                      placeholder="Buscar por nombre o teléfono"
                    />
                  </label>
                </div>

                {expectedClients.length === 0 ? (
                  <p className="order-hint">
                    Esta semana todavía no tiene clientes esperados (¿la
                    activaste?).
                  </p>
                ) : (
                  <ul className="order-client-results">
                    {filteredClients.slice(0, 8).map((entry) => (
                      <li
                        key={entry.clientId}
                        className={
                          selectedClientId === entry.clientId
                            ? "is-selected"
                            : undefined
                        }
                      >
                        <span>
                          {entry.client?.name ?? "Cliente"} ·{" "}
                          {entry.client?.phone ?? "sin teléfono"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedClientId(entry.clientId)}
                          disabled={selectedClientId === entry.clientId}
                        >
                          {selectedClientId === entry.clientId
                            ? "Elegido"
                            : "Elegir"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="dish-form__fields">
                  <label>
                    Notas
                    <textarea
                      value={createNotes}
                      onChange={(event) => setCreateNotes(event.target.value)}
                      rows={3}
                      placeholder="Agregá una observación para este pedido…"
                    />
                  </label>
                </div>

                <footer className="dish-form__actions">
                  <button
                    type="button"
                    onClick={() => void requestClose()}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={
                      saving ||
                      !selectedOptionId ||
                      !selectedClientId ||
                      mediaViandaBlocked
                    }
                  >
                    {saving ? "Creando…" : "Crear pedido"}
                  </button>
                </footer>
              </form>
            )}

            {!loading && !isCreateMode && order && (
              <form className="dish-form" onSubmit={handleEditSubmit}>
                <section
                  className="dish-form__summary"
                  aria-label="Contexto del pedido"
                >
                  <div className="dish-form__summary-main">
                    <p>
                      {order.client?.name ?? "Cliente"} ·{" "}
                      {order.client?.phone ?? "sin teléfono"}
                    </p>
                    <p>
                      {order.week
                        ? formatDateRange(
                            order.week.startDate,
                            order.week.endDate,
                          )
                        : "—"}
                      {order.weekDay
                        ? ` · ${DAY_LABELS[order.weekDay.dayOfWeek]} (${formatDate(order.weekDay.date)})`
                        : ""}
                    </p>
                    <p>
                      {order.option?.type === "menu" ? "Menú" : "Plato"}:{" "}
                      {order.option?.name ?? "—"}
                      <span
                        className={`order-modality-chip order-modality-chip--${order.modality}`}
                      >
                        {MODALITY_LABELS[order.modality]}
                      </span>
                    </p>
                    <p>
                      Precio aplicado: {formatCurrency(order.appliedPrice)}{" "}
                      (congelado, no editable)
                    </p>
                  </div>
                </section>

                <p className="order-hint">
                  La modalidad y el precio aplicado quedan congelados al crear
                  el pedido: para corregirlos, eliminá este pedido y creá uno
                  nuevo.
                </p>

                <div className="dish-form__fields">
                  <label>
                    Cantidad
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Notas
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={3}
                      placeholder="Agregá una observación para este pedido…"
                    />
                  </label>
                </div>

                <p className="dish-usage__summary">
                  Total:{" "}
                  {formatCurrency((Number(quantity) || 0) * order.appliedPrice)}
                </p>

                <footer className="dish-form__actions dish-form__actions--split">
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={deleting || saving}
                    className="order-delete-button"
                  >
                    {deleting ? "Eliminando…" : "Eliminar pedido"}
                  </button>
                  <div className="dish-form__actions-group">
                    <button
                      type="button"
                      onClick={() => void requestClose()}
                      disabled={saving || deleting}
                    >
                      Cerrar
                    </button>
                    <button
                      type="submit"
                      disabled={saving || deleting || !dirty}
                    >
                      {saving ? "Guardando…" : "Guardar cambios"}
                    </button>
                  </div>
                </footer>
              </form>
            )}
          </div>
        </aside>
      </div>
      {confirmDialog}
    </>
  );
}
