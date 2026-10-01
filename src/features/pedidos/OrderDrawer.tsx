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
import { listDishes } from "../platos/services/dishes.service";
import { listDishVersions } from "../platos/services/dish-versions.service";
import { listMenus } from "../menus/services/menus.service";
import { getLatestMenuVersion } from "../menus/services/menu-versions.service";
import {
  formatCurrency,
  formatDate,
  formatDateRange,
} from "../../lib/formatters";
import { useConfirm } from "../../components/ui/useConfirm";
import type { Modality, OptionType } from "../../types/domain";
import type { CreateOrderInput, UpdateOrderInput } from "./types/order";
import type { OrderDetail } from "./types/order-detail";
import type { WeekDayOption, WeekOffer } from "../semanas/types/week-offer";
import type { WeekExpectedClient } from "../semanas/types/week-expected-clients";
import type { Week } from "../semanas/types/week";
import type { DishListItem } from "../platos/types/dish-list";
import type { MenuListItem } from "../menus/types/menu-list";

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

/** Búsqueda del catálogo para la media vianda libre. */
const CATALOG_SEARCH_DEBOUNCE_MS = 350;
const CATALOG_SEARCH_PAGE_SIZE = 6;

/** Producto de catálogo elegido para una media vianda, con versión resuelta. */
interface CatalogSelection {
  type: OptionType;
  productId: string;
  versionId: string;
  name: string;
  price: number;
}

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
  // Selector de catálogo: con media vianda marcada el producto sale de todo
  // el catálogo de platos/menús, no solo de la oferta de ese día.
  const [catalogType, setCatalogType] = useState<OptionType>("dish");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogDishes, setCatalogDishes] = useState<DishListItem[]>([]);
  const [catalogMenus, setCatalogMenus] = useState<MenuListItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedCatalog, setSelectedCatalog] =
    useState<CatalogSelection | null>(null);
  const [resolvingCatalogId, setResolvingCatalogId] = useState<string | null>(
    null,
  );
  const catalogDebounceRef = useRef<number | null>(null);
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
    ? selectedOptionId !== "" ||
      selectedClientId !== "" ||
      mediaVianda ||
      selectedCatalog !== null
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

  // Búsqueda en el catálogo: se activa con media vianda marcada y sin
  // producto elegido. El estado de carga lo marcan los eventos que cambian la
  // búsqueda; el efecto solo programa la consulta y resuelve sus resultados.
  useEffect(() => {
    if (!isCreateMode || !mediaVianda || selectedCatalog) return;

    if (catalogDebounceRef.current !== null) {
      window.clearTimeout(catalogDebounceRef.current);
    }

    const trimmed = catalogQuery.trim();
    const delay = trimmed ? CATALOG_SEARCH_DEBOUNCE_MS : 0;
    let cancelled = false;

    catalogDebounceRef.current = window.setTimeout(() => {
      const request =
        catalogType === "dish"
          ? listDishes({
              search: trimmed || undefined,
              active: true,
              pageSize: CATALOG_SEARCH_PAGE_SIZE,
            }).then((result) => {
              if (cancelled) return;
              setCatalogDishes(result.items);
              setCatalogMenus([]);
            })
          : listMenus({
              search: trimmed || undefined,
              active: true,
              pageSize: CATALOG_SEARCH_PAGE_SIZE,
            }).then((result) => {
              if (cancelled) return;
              setCatalogMenus(result.items);
              setCatalogDishes([]);
            });

      request
        .catch((searchErr: unknown) => {
          if (cancelled) return;
          setCatalogDishes([]);
          setCatalogMenus([]);
          setCatalogError(
            searchErr instanceof Error
              ? searchErr.message
              : "No se pudo buscar en el catálogo.",
          );
        })
        .finally(() => {
          if (!cancelled) setCatalogLoading(false);
        });
    }, delay);

    return () => {
      cancelled = true;
      if (catalogDebounceRef.current !== null) {
        window.clearTimeout(catalogDebounceRef.current);
      }
    };
  }, [catalogQuery, catalogType, isCreateMode, mediaVianda, selectedCatalog]);

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

  function beginCatalogSearch() {
    setCatalogLoading(true);
    setCatalogError(null);
  }

  function handleCatalogTypeChange(next: OptionType) {
    beginCatalogSearch();
    setCatalogType(next);
    setCatalogQuery("");
  }

  function handleCatalogQueryChange(value: string) {
    beginCatalogSearch();
    setCatalogQuery(value);
  }

  /**
   * Marcar/desmarcar media vianda cambia la fuente del producto: la opción
   * de oferta y el producto de catálogo no son intercambiables, así que se
   * limpia lo elegido para no enviar el producto equivocado.
   */
  function handleMediaViandaToggle(enabled: boolean) {
    setMediaVianda(enabled);
    setSelectedOptionId("");
    setSelectedCatalog(null);
    beginCatalogSearch();
  }

  async function handlePickDish(dish: DishListItem) {
    setCatalogError(null);
    setResolvingCatalogId(dish.id);

    try {
      const versions = await listDishVersions(dish.id);
      const latest = versions[0];

      if (!latest) {
        setCatalogError(
          `${dish.name ?? "El plato"} no tiene versiones cargadas.`,
        );
        return;
      }

      setSelectedCatalog({
        type: "dish",
        productId: dish.id,
        versionId: latest.id,
        name: latest.name,
        price: latest.price,
      });
    } catch (pickError: unknown) {
      setCatalogError(
        pickError instanceof Error
          ? pickError.message
          : "No se pudo elegir el plato.",
      );
    } finally {
      setResolvingCatalogId(null);
    }
  }

  async function handlePickMenu(menu: MenuListItem) {
    setCatalogError(null);
    setResolvingCatalogId(menu.id);

    try {
      const latest = await getLatestMenuVersion(menu.id);

      if (!latest) {
        setCatalogError(
          `${menu.name ?? "El menú"} no tiene versiones cargadas.`,
        );
        return;
      }

      setSelectedCatalog({
        type: "menu",
        productId: menu.id,
        versionId: latest.id,
        name: latest.name,
        price: latest.price,
      });
    } catch (pickError: unknown) {
      setCatalogError(
        pickError instanceof Error
          ? pickError.message
          : "No se pudo elegir el menú.",
      );
    } finally {
      setResolvingCatalogId(null);
    }
  }

  function handleClearCatalog() {
    setSelectedCatalog(null);
    beginCatalogSearch();
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    if (!selectedDayId) {
      setError("Elegí un día.");
      return;
    }
    if (mediaVianda && !selectedCatalog) {
      setError("Elegí un plato o menú del catálogo.");
      return;
    }
    if (!mediaVianda && !selectedOptionId) {
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
      const notesValue = createNotes || null;
      // Dos fuentes posibles: la opción de oferta del día o un producto del
      // catálogo (solo media vianda). Son excluyentes por CHECK en la DB.
      const input: CreateOrderInput =
        mediaVianda && selectedCatalog
          ? selectedCatalog.type === "dish"
            ? {
                clientId: selectedClientId,
                weekDayId: selectedDayId,
                dishVersionId: selectedCatalog.versionId,
                modality: "media_vianda",
                quantity: quantityValue,
                notes: notesValue,
              }
            : {
                clientId: selectedClientId,
                weekDayId: selectedDayId,
                menuVersionId: selectedCatalog.versionId,
                modality: "media_vianda",
                quantity: quantityValue,
                notes: notesValue,
              }
          : {
              clientId: selectedClientId,
              weekDayId: selectedDayId,
              weekDayOptionId: selectedOptionId,
              modality: resolvedModality,
              quantity: quantityValue,
              notes: notesValue,
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
                      onChange={(event) =>
                        handleMediaViandaToggle(event.target.checked)
                      }
                    />
                    Pedir como media vianda
                  </label>
                  <p>
                    {mediaVianda
                      ? "Se cobra el 50% del precio del plato o menú que elijas del catálogo."
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

                  {!mediaVianda && (
                    <label>
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
                              ·{" "}
                              {option.optionType === "dish" ? "Plato" : "Menú"}:{" "}
                              {name} — {formatCurrency(price ?? 0)}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  )}

                  {mediaVianda && (
                    <div className="order-catalog-field">
                      <span className="order-catalog-field__label">
                        Producto del catálogo
                      </span>
                      {selectedCatalog ? (
                        <div className="order-catalog-selected">
                          <span className="order-catalog-selected__name">
                            <span
                              className={`order-option-chip order-option-chip--${selectedCatalog.type}`}
                            >
                              {selectedCatalog.type === "dish"
                                ? "Plato"
                                : "Menú"}
                            </span>
                            {selectedCatalog.name}
                          </span>
                          <span className="order-catalog-selected__price">
                            {formatCurrency(selectedCatalog.price)}
                          </span>
                          <button type="button" onClick={handleClearCatalog}>
                            Cambiar
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="order-catalog-toggle">
                            <button
                              type="button"
                              className={
                                catalogType === "dish" ? "is-active" : ""
                              }
                              onClick={() => handleCatalogTypeChange("dish")}
                            >
                              Platos
                            </button>
                            <button
                              type="button"
                              className={
                                catalogType === "menu" ? "is-active" : ""
                              }
                              onClick={() => handleCatalogTypeChange("menu")}
                            >
                              Menús
                            </button>
                          </div>

                          <input
                            type="search"
                            value={catalogQuery}
                            onChange={(event) =>
                              handleCatalogQueryChange(event.target.value)
                            }
                            placeholder={
                              catalogType === "dish"
                                ? "Buscar plato en el catálogo"
                                : "Buscar menú en el catálogo"
                            }
                          />
                          {catalogLoading && (
                            <p className="order-hint">Buscando…</p>
                          )}
                          {!catalogLoading && catalogError && (
                            <p className="order-hint order-hint--error">
                              {catalogError}
                            </p>
                          )}
                          {!catalogLoading &&
                            !catalogError &&
                            catalogType === "dish" &&
                            catalogDishes.length === 0 && (
                              <p className="order-hint">
                                {catalogQuery.trim()
                                  ? "Sin resultados."
                                  : "No hay platos activos."}
                              </p>
                            )}
                          {!catalogLoading &&
                            !catalogError &&
                            catalogType === "menu" &&
                            catalogMenus.length === 0 && (
                              <p className="order-hint">
                                {catalogQuery.trim()
                                  ? "Sin resultados."
                                  : "No hay menús activos."}
                              </p>
                            )}

                          {!catalogLoading &&
                            catalogType === "dish" &&
                            catalogDishes.length > 0 && (
                              <ul className="order-catalog-results">
                                {catalogDishes.map((dish) => (
                                  <li key={dish.id}>
                                    <span>{dish.name ?? "Sin nombre"}</span>
                                    <button
                                      type="button"
                                      onClick={() => void handlePickDish(dish)}
                                      disabled={resolvingCatalogId === dish.id}
                                    >
                                      {resolvingCatalogId === dish.id
                                        ? "…"
                                        : "Elegir"}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}

                          {!catalogLoading &&
                            catalogType === "menu" &&
                            catalogMenus.length > 0 && (
                              <ul className="order-catalog-results">
                                {catalogMenus.map((menu) => (
                                  <li key={menu.id}>
                                    <span>{menu.name ?? "Sin nombre"}</span>
                                    <button
                                      type="button"
                                      onClick={() => void handlePickMenu(menu)}
                                      disabled={resolvingCatalogId === menu.id}
                                    >
                                      {resolvingCatalogId === menu.id
                                        ? "…"
                                        : "Elegir"}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                        </>
                      )}
                    </div>
                  )}

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
                      !selectedDayId ||
                      !selectedClientId ||
                      mediaViandaBlocked ||
                      (mediaVianda ? !selectedCatalog : !selectedOptionId)
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
