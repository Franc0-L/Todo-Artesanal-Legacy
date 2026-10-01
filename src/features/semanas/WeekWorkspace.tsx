import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  activateWeek,
  closeWeek,
  createWeek,
  deleteWeek,
  getWeek,
  updateWeek,
} from "./services/weeks.service";
import {
  addDayOption,
  getWeekOffer,
  removeDayOption,
} from "./services/week-offer.service";
import { updateWeekDayCutoff } from "./services/week-days.service";
import { getExpectedClientCount } from "./services/week-expected-clients.service";
import { listDishes } from "../platos/services/dishes.service";
import { listDishVersions } from "../platos/services/dish-versions.service";
import { getDishSuggestions } from "../platos/services/dish-usage.service";
import { listMenus } from "../menus/services/menus.service";
import { getLatestMenuVersion } from "../menus/services/menu-versions.service";
import { DAY_LABELS } from "./day-labels";
import {
  collectUsedDishIds,
  missingOfferModalities,
  pickDishes,
  sortDayOptions,
  weekSuggestionSignature,
  type SuggestionDish,
} from "./week-suggest";
import {
  formatCurrency,
  formatDate,
  formatDateRange,
  formatDateTime,
  toDateTimeLocalValue,
} from "../../lib/formatters";
import { useConfirm } from "../../components/ui/useConfirm";
import { isAppError } from "../../lib/errors";
import type { WeekStatus } from "../../types/domain";
import type { Week } from "./types/week";
import type { WeekDay } from "./types/week-day";
import type {
  OfferModality,
  WeekDayOption,
  WeekOffer,
} from "./types/week-offer";
import type { DishListItem } from "../platos/types/dish-list";
import type { MenuListItem } from "../menus/types/menu-list";

interface WeekWorkspaceProps {
  mode: "create" | "edit";
  weekId: string | null;
  onClose: () => void;
  onCreated: (week: Week) => void;
  onSaved: (week: Week) => void;
  /** Se dispara cuando la semana se eliminó definitivamente. */
  onDeleted: (weekId: string) => void;
  /**
   * Reporta si hay cambios sin guardar (fechas tocadas sin persistir). La
   * página lo usa para confirmar antes de cerrar o cambiar de vista.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

interface DateFormState {
  startDate: string;
  endDate: string;
}

const EMPTY_DATE_FORM: DateFormState = { startDate: "", endDate: "" };

const WEEK_STATUS_LABELS: Record<WeekStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  closed: "Cerrada",
};

const OFFER_MODALITY_LABELS: Record<OfferModality, string> = {
  general: "General",
  opcional: "Opcional",
};

/** Feedback de la última corrida del sugeridor, por día o de la semana. */
interface SuggestionState {
  runningScope: "day" | "week" | null;
  dayId: string | null;
  error: string | null;
  message: string | null;
}

const IDLE_SUGGESTION: SuggestionState = {
  runningScope: null,
  dayId: null,
  error: null,
  message: null,
};

export function WeekWorkspace({
  mode,
  weekId,
  onClose,
  onCreated,
  onSaved,
  onDeleted,
  onDirtyChange,
}: WeekWorkspaceProps) {
  const isCreateMode = mode === "create";
  // En modo edición el taller arranca cargando la semana: el estado inicial
  // ya representa ese "cargando" y el efecto no sincroniza estado.
  const isEditMode = !isCreateMode && weekId !== null;
  const [week, setWeek] = useState<Week | null>(null);
  const [offer, setOffer] = useState<WeekOffer | null>(null);
  const [expectedCount, setExpectedCount] = useState<number | null>(null);

  const [createForm, setCreateForm] = useState<DateFormState>(EMPTY_DATE_FORM);
  const [datesForm, setDatesForm] = useState<DateFormState>(EMPTY_DATE_FORM);
  const [baselineDatesForm, setBaselineDatesForm] =
    useState<DateFormState>(EMPTY_DATE_FORM);

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [datesSaving, setDatesSaving] = useState(false);
  const [lifecycleSaving, setLifecycleSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datesError, setDatesError] = useState<string | null>(null);
  const [datesMessage, setDatesMessage] = useState<string | null>(null);
  const [suggestion, setSuggestion] =
    useState<SuggestionState>(IDLE_SUGGESTION);

  // El pool de platos para sugerir se cachea por apertura del taller; las
  // versiones se resuelven recién al aplicar cada sugerencia.
  const suggestionPoolRef = useRef<SuggestionDish[] | null>(null);
  const previousSuggestionRef = useRef<string | null>(null);

  const { confirm, confirmDialog } = useConfirm();

  const dirty = isCreateMode
    ? createForm.startDate !== "" || createForm.endDate !== ""
    : datesForm.startDate !== baselineDatesForm.startDate ||
      datesForm.endDate !== baselineDatesForm.endDate;

  // Avisa a la página (vía ref, sin re-render) cuando cambia lo sucio del
  // formulario. `onDirtyChange` es estable (useCallback con [] en la página).
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const reloadOffer = useCallback(async () => {
    if (!weekId) {
      return;
    }

    try {
      const result = await getWeekOffer(weekId);
      setOffer(result);
    } catch (offerError: unknown) {
      setError(
        offerError instanceof Error
          ? offerError.message
          : "No se pudo cargar la oferta de la semana.",
      );
    }
  }, [weekId]);

  // La semana se reinicia por remonte (ver `key` en SemanasPage): el estado
  // inicial ya es el correcto y el efecto solo resuelve el fetch, sin
  // sincronizar estado antes del primer `await`.
  useEffect(() => {
    if (!isEditMode || !weekId) return;

    let cancelled = false;

    void Promise.all([getWeek(weekId), getWeekOffer(weekId)])
      .then(([weekResult, offerResult]) => {
        if (cancelled) return;

        setWeek(weekResult);
        setOffer(offerResult);

        const form: DateFormState = {
          startDate: weekResult.startDate,
          endDate: weekResult.endDate,
        };
        setDatesForm(form);
        setBaselineDatesForm(form);

        if (weekResult.status !== "draft") {
          return getExpectedClientCount(weekId).then((count) => {
            if (!cancelled) setExpectedCount(count);
          });
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar la semana.",
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
  }, [isEditMode, weekId]);

  const requestClose = useCallback(async () => {
    if (dirty) {
      const proceed = await confirm({
        title: "Cambios sin guardar",
        message:
          "Hay cambios sin guardar en esta ficha. Si cerrás ahora, se van a perder.",
        confirmLabel: "Cerrar sin guardar",
        cancelLabel: "Seguir editando",
        tone: "danger",
      });

      if (!proceed) {
        return;
      }
    }

    onClose();
  }, [confirm, dirty, onClose]);

  // El taller es un panel dentro de la página (no un modal): no bloquea el
  // scroll ni se cierra con Escape, así la tecla no compite con los campos
  // de búsqueda de cada día.
  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    setError(null);

    if (!createForm.startDate || !createForm.endDate) {
      setError("Las fechas de inicio y fin son obligatorias.");
      return;
    }

    setSaving(true);

    try {
      const created = await createWeek({
        startDate: createForm.startDate,
        endDate: createForm.endDate,
      });
      onCreated(created);
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : "No se pudo crear la semana.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDates() {
    if (!week || datesSaving) {
      return;
    }

    setDatesError(null);
    setDatesMessage(null);

    if (!datesForm.startDate || !datesForm.endDate) {
      setDatesError("Las fechas de inicio y fin son obligatorias.");
      return;
    }

    const proceed = await confirm({
      title: "Cambiar fechas de la semana",
      message:
        "Si la semana ya tiene opciones de oferta cargadas, cambiar las fechas las elimina y hay que volver a cargarlas. ¿Continuar?",
      confirmLabel: "Cambiar fechas",
      tone: "danger",
    });

    if (!proceed) {
      return;
    }

    setDatesSaving(true);

    try {
      const updated = await updateWeek(week.id, {
        startDate: datesForm.startDate,
        endDate: datesForm.endDate,
      });

      setWeek(updated);
      const form: DateFormState = {
        startDate: updated.startDate,
        endDate: updated.endDate,
      };
      setDatesForm(form);
      setBaselineDatesForm(form);
      setDatesMessage("Fechas actualizadas.");
      onSaved(updated);
      void reloadOffer();
    } catch (datesSaveError: unknown) {
      setDatesError(
        datesSaveError instanceof Error
          ? datesSaveError.message
          : "No se pudieron actualizar las fechas.",
      );
    } finally {
      setDatesSaving(false);
    }
  }

  async function handleActivate() {
    if (!week || lifecycleSaving) {
      return;
    }

    const proceed = await confirm({
      title: "Activar semana",
      message:
        "Se congela la población de clientes esperados con los clientes activos en este momento, y la semana queda disponible para pedidos. Cada día necesita al menos una opción cargada.",
      confirmLabel: "Activar semana",
      tone: "default",
    });

    if (!proceed) {
      return;
    }

    setLifecycleSaving(true);
    setError(null);

    try {
      await activateWeek(week.id);
      const refreshed = await getWeek(week.id);
      setWeek(refreshed);
      onSaved(refreshed);
      const count = await getExpectedClientCount(week.id);
      setExpectedCount(count);
    } catch (activateError: unknown) {
      setError(
        activateError instanceof Error
          ? activateError.message
          : "No se pudo activar la semana.",
      );
    } finally {
      setLifecycleSaving(false);
    }
  }

  async function handleCloseWeek() {
    if (!week || lifecycleSaving) {
      return;
    }

    const proceed = await confirm({
      title: "Cerrar semana",
      message:
        "Cerrar la semana es definitivo: pasa a ser histórica y no se puede volver a abrir ni modificar. ¿Continuar?",
      confirmLabel: "Cerrar semana",
      tone: "danger",
    });

    if (!proceed) {
      return;
    }

    setLifecycleSaving(true);
    setError(null);

    try {
      await closeWeek(week.id);
      const refreshed = await getWeek(week.id);
      setWeek(refreshed);
      onSaved(refreshed);
    } catch (closeError: unknown) {
      setError(
        closeError instanceof Error
          ? closeError.message
          : "No se pudo cerrar la semana.",
      );
    } finally {
      setLifecycleSaving(false);
    }
  }

  /**
   * Borrado definitivo. Solo se ofrece en borradores: si la semana tiene
   * pedidos, cancelaciones u opciones ya ofrecidas, la DB lo rechaza y se
   * muestra un mensaje accionable en lugar de un error crudo.
   */
  async function handleDelete() {
    if (!week || deleting || lifecycleSaving) {
      return;
    }

    const proceed = await confirm({
      title: "Eliminar semana",
      message:
        "Esta acción elimina la semana de borrador de forma definitiva, junto con sus días y la oferta cargada. No se puede deshacer. Si la semana tiene pedidos o cancelaciones, no se podrá eliminar.",
      confirmLabel: "Eliminar definitivamente",
      cancelLabel: "Cancelar",
      tone: "danger",
    });

    if (!proceed) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      await deleteWeek(week.id);
      onDeleted(week.id);
    } catch (deleteError: unknown) {
      setError(
        isAppError(deleteError) && deleteError.code === "CONFLICT"
          ? "No se pudo eliminar: la semana tiene pedidos o cancelaciones asociados. Para conservar el historial, usá el ciclo de vida (activar / cerrar) en vez de eliminarla."
          : deleteError instanceof Error
            ? deleteError.message
            : "No se pudo eliminar la semana.",
      );
    } finally {
      setDeleting(false);
    }
  }

  /**
   * Pool de platos activos para sugerir, cacheado por apertura del taller.
   * Se filtra por nombre no vacío porque la sugerencia se muestra tal cual.
   */
  async function loadSuggestionPool(): Promise<SuggestionDish[]> {
    if (!suggestionPoolRef.current) {
      const suggestions = await getDishSuggestions({ limit: 100 });
      suggestionPoolRef.current = suggestions
        .filter((item) => item.name.trim() !== "")
        .map((item) => ({
          dishId: item.dishId,
          name: item.name,
          uses: item.uses,
        }));
    }

    return suggestionPoolRef.current;
  }

  /**
   * Agrega una sugerencia a un día: resuelve la última versión del plato y
   * la carga en la modalidad libre indicada.
   */
  async function addSuggestedDish(
    weekDayId: string,
    slot: OfferModality,
    dish: SuggestionDish,
  ): Promise<void> {
    const versions = await listDishVersions(dish.dishId);
    const latest = versions[0];

    if (!latest) {
      throw new Error(`${dish.name} no tiene versiones cargadas.`);
    }

    await addDayOption({
      weekDayId,
      offerModality: slot,
      optionType: "dish",
      dishVersionId: latest.id,
    });
  }

  async function handleSuggestDay(targetDayId: string) {
    if (!offer || suggestion.runningScope !== null) {
      return;
    }

    const offerDay = offer.days.find((day) => day.weekDay.id === targetDayId);
    const slots = offerDay ? missingOfferModalities(offerDay.options) : [];

    if (!offerDay || slots.length === 0) {
      return;
    }

    setSuggestion({
      runningScope: "day",
      dayId: targetDayId,
      error: null,
      message: null,
    });

    const added: OfferModality[] = [];

    try {
      const pool = await loadSuggestionPool();
      const picked = pickDishes(
        pool,
        collectUsedDishIds(offer),
        slots.length,
        previousSuggestionRef.current,
      );

      if (!picked || picked.length === 0) {
        setSuggestion({
          runningScope: null,
          dayId: targetDayId,
          error:
            "No hay platos activos libres para sugerir en este día. Cargá más platos o agregá la opción a mano.",
          message: null,
        });
        return;
      }

      for (let index = 0; index < picked.length; index += 1) {
        await addSuggestedDish(targetDayId, slots[index], picked[index]);
        added.push(slots[index]);
      }

      previousSuggestionRef.current = weekSuggestionSignature(
        picked.map((dish) => dish.dishId),
      );
      setSuggestion({
        runningScope: null,
        dayId: targetDayId,
        error: null,
        message: `Se agregaron ${added.length} opción${
          added.length === 1 ? "" : "es"
        }: ${added.map((slot) => OFFER_MODALITY_LABELS[slot]).join(" y ")}.`,
      });
    } catch (suggestError: unknown) {
      const baseMessage =
        suggestError instanceof Error
          ? suggestError.message
          : "No se pudieron sugerir opciones.";
      const partialNote =
        added.length > 0
          ? ` Se agregaron ${added.length} de ${slots.length} opciones.`
          : "";

      setSuggestion({
        runningScope: null,
        dayId: targetDayId,
        error: `${baseMessage}${partialNote}`,
        message: null,
      });
    } finally {
      await reloadOffer();
    }
  }

  async function handleSuggestWeek() {
    if (!offer || suggestion.runningScope !== null) {
      return;
    }

    const pendingDays = offer.days
      .map((offerDay) => ({
        offerDay,
        slots: missingOfferModalities(offerDay.options),
      }))
      .filter((entry) => entry.slots.length > 0);

    if (pendingDays.length === 0) {
      return;
    }

    const totalSlots = pendingDays.reduce(
      (total, entry) => total + entry.slots.length,
      0,
    );

    setSuggestion({
      runningScope: "week",
      dayId: null,
      error: null,
      message: null,
    });

    const suggestedIds: string[] = [];
    const failures: string[] = [];

    try {
      const pool = await loadSuggestionPool();
      const usedDishIds = collectUsedDishIds(offer);

      for (const { offerDay, slots } of pendingDays) {
        const picked = pickDishes(
          pool,
          usedDishIds,
          slots.length,
          previousSuggestionRef.current,
        );
        const dayLabel = DAY_LABELS[offerDay.weekDay.dayOfWeek];

        if (!picked || picked.length === 0) {
          failures.push(`${dayLabel}: sin platos libres.`);
          continue;
        }

        for (let index = 0; index < picked.length; index += 1) {
          try {
            await addSuggestedDish(
              offerDay.weekDay.id,
              slots[index],
              picked[index],
            );
            usedDishIds.add(picked[index].dishId);
            suggestedIds.push(picked[index].dishId);
          } catch (dayError: unknown) {
            failures.push(
              `${dayLabel}: ${
                dayError instanceof Error
                  ? dayError.message
                  : "no se pudo agregar la opción."
              }`,
            );
          }
        }
      }

      if (suggestedIds.length > 0) {
        previousSuggestionRef.current = weekSuggestionSignature(suggestedIds);
      }

      setSuggestion({
        runningScope: null,
        dayId: null,
        message:
          failures.length === 0
            ? `Se agregaron ${suggestedIds.length} de ${totalSlots} opciones en la semana.`
            : null,
        error:
          failures.length === 0
            ? null
            : `Se agregaron ${suggestedIds.length} de ${totalSlots} opciones. ${failures.join(" ")}`,
      });
    } catch (suggestError: unknown) {
      setSuggestion({
        runningScope: null,
        dayId: null,
        message: null,
        error:
          suggestError instanceof Error
            ? suggestError.message
            : "No se pudieron armar las sugerencias de la semana.",
      });
    } finally {
      await reloadOffer();
    }
  }

  const missingSlotsTotal = offer
    ? offer.days.reduce(
        (total, day) => total + missingOfferModalities(day.options).length,
        0,
      )
    : 0;

  const open = isCreateMode || weekId !== null;

  if (!open) {
    return null;
  }

  return (
    <>
      <section
        id="week-workspace"
        className="week-workspace"
        aria-labelledby="week-workspace-title"
      >
        <div className="week-workspace__surface">
          <header className="dish-drawer__header week-workspace__header">
            <div>
              <p className="semanas-page__eyebrow">
                {isCreateMode ? "Nueva semana" : "Semana en la página"}
              </p>
              <h2 id="week-workspace-title">
                {isCreateMode
                  ? "Crear semana"
                  : week
                    ? formatDateRange(week.startDate, week.endDate)
                    : "Semana"}
              </h2>
            </div>
            <button
              className="dish-drawer__close"
              type="button"
              onClick={() => void requestClose()}
              aria-label={
                isCreateMode
                  ? "Cerrar creación de semana"
                  : "Cerrar el taller de la semana"
              }
            >
              ×
            </button>
          </header>

          <div className="dish-drawer__body week-workspace__body">
            {loading && <p className="semanas-feedback">Cargando ficha…</p>}

            {!loading && error && (
              <div
                className="semanas-feedback semanas-feedback--error"
                role="alert"
              >
                <p>{error}</p>
                <button type="button" onClick={() => setError(null)}>
                  Cerrar aviso
                </button>
              </div>
            )}

            {!loading && isCreateMode && (
              <form className="dish-form" onSubmit={handleCreateSubmit}>
                <p className="dish-form__hint">
                  La semana debe empezar un lunes y terminar un viernes. Los 5
                  días se crean automáticamente y la oferta se carga a
                  continuación en este mismo panel.
                </p>
                <div className="dish-form__fields">
                  <label>
                    Fecha de inicio (lunes)
                    <input
                      type="date"
                      value={createForm.startDate}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          startDate: event.target.value,
                        }))
                      }
                      required
                      autoFocus
                    />
                  </label>
                  <label>
                    Fecha de fin (viernes)
                    <input
                      type="date"
                      value={createForm.endDate}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          endDate: event.target.value,
                        }))
                      }
                      required
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
                  <button type="submit" disabled={saving || !dirty}>
                    {saving ? "Creando…" : "Crear semana"}
                  </button>
                </footer>
              </form>
            )}

            {!loading && !isCreateMode && week && (
              <div className="dish-form">
                <section
                  className="dish-form__summary"
                  aria-label="Estado de la semana"
                >
                  <div className="dish-form__summary-main">
                    <span className={`week-status week-status--${week.status}`}>
                      {WEEK_STATUS_LABELS[week.status]}
                    </span>
                    <p>{formatDateRange(week.startDate, week.endDate)}</p>
                    {expectedCount !== null && (
                      <p>
                        {expectedCount} cliente{expectedCount === 1 ? "" : "s"}{" "}
                        esperado
                        {expectedCount === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                  <div className="week-workspace__lifecycle-actions">
                    {week.status === "draft" && (
                      <button
                        className="dish-form__status-action"
                        type="button"
                        onClick={() => void handleActivate()}
                        disabled={lifecycleSaving}
                      >
                        {lifecycleSaving ? "Activando…" : "Activar semana"}
                      </button>
                    )}
                    {week.status === "active" && (
                      <button
                        className="dish-form__status-action"
                        type="button"
                        onClick={() => void handleCloseWeek()}
                        disabled={lifecycleSaving}
                      >
                        {lifecycleSaving ? "Cerrando…" : "Cerrar semana"}
                      </button>
                    )}
                  </div>
                </section>

                {week.status === "draft" && (
                  <section
                    className="dish-drawer__section"
                    aria-labelledby="week-dates-title"
                  >
                    <div className="dish-drawer__section-heading">
                      <div>
                        <h3 id="week-dates-title">Fechas</h3>
                        <p>
                          Cambiar las fechas elimina la oferta cargada para esta
                          semana; los días se recrean.
                        </p>
                      </div>
                    </div>

                    {datesError && (
                      <div
                        className="dish-link-feedback dish-link-feedback--error"
                        role="alert"
                      >
                        {datesError}
                      </div>
                    )}
                    {datesMessage && (
                      <p className="dish-form__success" role="status">
                        {datesMessage}
                      </p>
                    )}

                    <div className="dish-form__fields">
                      <label>
                        Fecha de inicio (lunes)
                        <input
                          type="date"
                          value={datesForm.startDate}
                          onChange={(event) =>
                            setDatesForm((current) => ({
                              ...current,
                              startDate: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Fecha de fin (viernes)
                        <input
                          type="date"
                          value={datesForm.endDate}
                          onChange={(event) =>
                            setDatesForm((current) => ({
                              ...current,
                              endDate: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>

                    <button
                      className="dish-link-rotate"
                      type="button"
                      onClick={() => void handleSaveDates()}
                      disabled={datesSaving || !dirty}
                    >
                      {datesSaving ? "Guardando…" : "Guardar fechas"}
                    </button>
                  </section>
                )}

                <section
                  className="dish-drawer__section"
                  aria-labelledby="week-offer-title"
                >
                  <div className="dish-drawer__section-heading">
                    <div>
                      <h3 id="week-offer-title">Oferta semanal</h3>
                      <p>
                        {week.status === "closed"
                          ? "Semana cerrada: la oferta queda histórica y no se puede modificar."
                          : "Cada día necesita una opción General y una Opcional para poder activar la semana. Podés sugerirlas o cargarlas a mano."}
                      </p>
                    </div>
                    {week.status !== "closed" && (
                      <button
                        className="week-offer-suggest"
                        type="button"
                        onClick={() => void handleSuggestWeek()}
                        disabled={
                          suggestion.runningScope !== null ||
                          missingSlotsTotal === 0
                        }
                      >
                        {suggestion.runningScope === "week"
                          ? "Armando semana…"
                          : "Sugerir semana"}
                      </button>
                    )}
                  </div>

                  {suggestion.dayId === null && suggestion.message && (
                    <p className="dish-form__success" role="status">
                      {suggestion.message}
                    </p>
                  )}
                  {suggestion.dayId === null && suggestion.error && (
                    <div
                      className="dish-link-feedback dish-link-feedback--error"
                      role="alert"
                    >
                      {suggestion.error}
                    </div>
                  )}

                  {offer && (
                    <div className="week-offer-grid">
                      {offer.days.map((offerDay) => (
                        <DayOfferColumn
                          key={offerDay.weekDay.id}
                          day={offerDay.weekDay}
                          options={offerDay.options}
                          editable={week.status !== "closed"}
                          onChanged={() => void reloadOffer()}
                          suggestRunning={
                            suggestion.runningScope === "day" &&
                            suggestion.dayId === offerDay.weekDay.id
                          }
                          suggestBlocked={suggestion.runningScope !== null}
                          suggestFeedback={
                            suggestion.dayId === offerDay.weekDay.id
                              ? {
                                  message: suggestion.message,
                                  error: suggestion.error,
                                }
                              : null
                          }
                          onSuggest={() =>
                            void handleSuggestDay(offerDay.weekDay.id)
                          }
                        />
                      ))}
                    </div>
                  )}
                </section>

                {week.status === "draft" && (
                  <section
                    className="dish-drawer__section"
                    aria-labelledby="week-delete-title"
                  >
                    <div className="dish-drawer__section-heading">
                      <div>
                        <h3 id="week-delete-title">Eliminar semana</h3>
                        <p>
                          Solo disponible en borradores sin pedidos. Se borran
                          los días y la oferta cargada; la acción no se puede
                          deshacer. Si ya hay operaciones, usá el ciclo de vida
                          (activar / cerrar).
                        </p>
                      </div>
                    </div>
                    <button
                      className="week-danger-zone__button"
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={
                        deleting || lifecycleSaving || datesSaving || saving
                      }
                    >
                      {deleting ? "Eliminando…" : "Eliminar definitivamente"}
                    </button>
                  </section>
                )}

                <footer className="dish-form__actions">
                  <button type="button" onClick={() => void requestClose()}>
                    Cerrar
                  </button>
                </footer>
              </div>
            )}
          </div>
        </div>
      </section>
      {confirmDialog}
    </>
  );
}

interface DayOfferColumnProps {
  day: WeekDay;
  options: WeekDayOption[];
  editable: boolean;
  onChanged: () => void;
  /**
   * true mientras el sugeridor corre para este día (para el texto del
   * botón). Distinto de `suggestBlocked`, que corta cualquier corrida.
   */
  suggestRunning: boolean;
  /** true cuando hay una corrida del sugeridor en curso (día o semana). */
  suggestBlocked: boolean;
  /** Último resultado del sugeridor para este día, si lo hubo. */
  suggestFeedback: { message: string | null; error: string | null } | null;
  onSuggest: () => void;
}

const DAY_SEARCH_DEBOUNCE_MS = 350;
const DAY_SEARCH_PAGE_SIZE = 6;

/**
 * Columna de un día de la semana: opciones ya cargadas + buscador propio
 * para agregar platos o menús. Cada columna maneja su propio estado de
 * búsqueda (no se comparte entre días).
 */
function DayOfferColumn({
  day,
  options,
  editable,
  onChanged,
  suggestRunning,
  suggestBlocked,
  suggestFeedback,
  onSuggest,
}: DayOfferColumnProps) {
  const [searchType, setSearchType] = useState<"dish" | "menu">("dish");
  const [query, setQuery] = useState("");
  const [dishResults, setDishResults] = useState<DishListItem[]>([]);
  const [menuResults, setMenuResults] = useState<MenuListItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  // Corte de horario del día ("fuera de horario"): el draft vive en
  // este componente y se guarda con el botón; tras el guardado
  // `onChanged()` recarga la oferta y el valor del props se actualiza,
  // con lo cual el draft deja de estar "dirty".
  const [cutoffDraft, setCutoffDraft] = useState(() =>
    toDateTimeLocalValue(day.cutoffAt),
  );
  const [cutoffSaving, setCutoffSaving] = useState(false);
  const [cutoffError, setCutoffError] = useState<string | null>(null);
  const cutoffDirty = cutoffDraft !== toDateTimeLocalValue(day.cutoffAt);
  const debounceRef = useRef<number | null>(null);

  // El estado del buscador (`searchLoading`/`searchError`) se marca desde los
  // eventos que cambian la búsqueda (ver `handleSearchTypeChange` y
  // `handleQueryChange`): el efecto solo programa la consulta y resuelve sus
  // resultados.
  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    const trimmed = query.trim();
    const delay = trimmed ? DAY_SEARCH_DEBOUNCE_MS : 0;
    let cancelled = false;

    debounceRef.current = window.setTimeout(() => {
      const request =
        searchType === "dish"
          ? listDishes({
              search: trimmed || undefined,
              active: true,
              pageSize: DAY_SEARCH_PAGE_SIZE,
            }).then((result) => {
              if (cancelled) return;
              setDishResults(result.items);
              setMenuResults([]);
            })
          : listMenus({
              search: trimmed || undefined,
              active: true,
              pageSize: DAY_SEARCH_PAGE_SIZE,
            }).then((result) => {
              if (cancelled) return;
              setMenuResults(result.items);
              setDishResults([]);
            });

      request
        .catch((searchErr: unknown) => {
          if (cancelled) return;
          setDishResults([]);
          setMenuResults([]);
          setSearchError(
            searchErr instanceof Error
              ? searchErr.message
              : "No se pudo buscar.",
          );
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, delay);

    return () => {
      cancelled = true;
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [query, searchType]);

  function beginSearch() {
    setSearchLoading(true);
    setSearchError(null);
  }

  function handleSearchTypeChange(next: "dish" | "menu") {
    beginSearch();
    setSearchType(next);
    setQuery("");
  }

  function handleQueryChange(value: string) {
    beginSearch();
    setQuery(value);
  }

  async function handleAddDish(dish: DishListItem) {
    setAddError(null);
    setResolvingId(dish.id);

    try {
      const versions = await listDishVersions(dish.id);
      const latest = versions[0];

      if (!latest) {
        setAddError(`${dish.name ?? "El plato"} no tiene versiones cargadas.`);
        return;
      }

      await addDayOption({
        weekDayId: day.id,
        optionType: "dish",
        dishVersionId: latest.id,
      });
      onChanged();
    } catch (addErr: unknown) {
      setAddError(
        addErr instanceof Error
          ? addErr.message
          : "No se pudo agregar la opción.",
      );
    } finally {
      setResolvingId(null);
    }
  }

  async function handleAddMenu(menu: MenuListItem) {
    setAddError(null);
    setResolvingId(menu.id);

    try {
      const latest = await getLatestMenuVersion(menu.id);

      if (!latest) {
        setAddError(`${menu.name ?? "El menú"} no tiene versiones cargadas.`);
        return;
      }

      await addDayOption({
        weekDayId: day.id,
        optionType: "menu",
        menuVersionId: latest.id,
      });
      onChanged();
    } catch (addErr: unknown) {
      setAddError(
        addErr instanceof Error
          ? addErr.message
          : "No se pudo agregar la opción.",
      );
    } finally {
      setResolvingId(null);
    }
  }

  async function handleRemoveOption(optionId: string) {
    setAddError(null);
    setRemovingId(optionId);

    try {
      await removeDayOption(optionId);
      onChanged();
    } catch (removeErr: unknown) {
      setAddError(
        removeErr instanceof Error
          ? removeErr.message
          : "No se pudo quitar la opción (¿ya tiene pedidos asociados?).",
      );
    } finally {
      setRemovingId(null);
    }
  }

  async function handleSaveCutoff() {
    if (Number.isNaN(Date.parse(cutoffDraft))) {
      setCutoffError("Elegí la fecha y hora hasta las que se aceptan respuestas.");
      return;
    }

    setCutoffSaving(true);
    setCutoffError(null);
    try {
      await updateWeekDayCutoff(day.id, new Date(cutoffDraft).toISOString());
      onChanged();
    } catch (saveErr: unknown) {
      setCutoffError(
        saveErr instanceof Error
          ? saveErr.message
          : "No se pudo guardar el corte.",
      );
    } finally {
      setCutoffSaving(false);
    }
  }

  return (
    <div className="week-day-column">
      <header className="week-day-column__header">
        <strong>{DAY_LABELS[day.dayOfWeek]}</strong>
        <span>{formatDate(day.date)}</span>

        {editable ? (
          <div className="week-day-column__cutoff">
            <label>
              <span>Cierra (día y hora)</span>
              <input
                type="datetime-local"
                value={cutoffDraft}
                disabled={cutoffSaving}
                onChange={(event) => setCutoffDraft(event.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!cutoffDirty || cutoffSaving}
              onClick={() => void handleSaveCutoff()}
            >
              {cutoffSaving ? "Guardando…" : "Guardar corte"}
            </button>
            {cutoffError && (
              <p className="week-day-column__hint week-day-column__hint--error">
                {cutoffError}
              </p>
            )}
          </div>
        ) : (
          <span className="week-day-column__cutoff-readonly">
            Cierra {formatDateTime(day.cutoffAt)}
          </span>
        )}
      </header>

      <ul className="week-day-column__options">
        {options.length === 0 && (
          <li className="week-day-column__empty">Sin opciones cargadas.</li>
        )}
        {sortDayOptions(options).map((option) => {
          const name =
            option.optionType === "dish"
              ? option.dishVersion?.name
              : option.menuVersion?.name;
          const price =
            option.optionType === "dish"
              ? option.dishVersion?.price
              : option.menuVersion?.price;

          return (
            <li
              key={option.id}
              className={`week-day-column__option week-day-column__option--${option.offerModality}`}
            >
              <span
                className={`week-day-column__option-type week-day-column__option-type--${option.optionType}`}
              >
                {option.optionType === "dish" ? "Plato" : "Menú"}
              </span>
              <span>{formatCurrency(price ?? 0)}</span>
              <span className="week-day-column__option-name">
                {name ?? "Sin nombre"}
              </span>
              {editable && (
                <button
                  type="button"
                  onClick={() => void handleRemoveOption(option.id)}
                  disabled={removingId === option.id}
                  aria-label={`Quitar ${name ?? "opción"}`}
                >
                  {removingId === option.id ? "…" : "×"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {editable && (
        <div className="week-day-column__composer">
          <div className="week-day-column__suggest">
            <button
              type="button"
              onClick={onSuggest}
              disabled={
                suggestBlocked || missingOfferModalities(options).length === 0
              }
            >
              {suggestRunning ? "Sugiriendo…" : "Sugerir opciones"}
            </button>
            {suggestFeedback?.message && (
              <p className="week-day-column__hint">{suggestFeedback.message}</p>
            )}
            {suggestFeedback?.error && (
              <p className="week-day-column__hint week-day-column__hint--error">
                {suggestFeedback.error}
              </p>
            )}
          </div>

          <div className="week-day-column__type-toggle">
            <button
              type="button"
              className={searchType === "dish" ? "is-active" : ""}
              onClick={() => handleSearchTypeChange("dish")}
            >
              Platos
            </button>
            <button
              type="button"
              className={searchType === "menu" ? "is-active" : ""}
              onClick={() => handleSearchTypeChange("menu")}
            >
              Menús
            </button>
          </div>

          <input
            type="search"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder={
              searchType === "dish"
                ? "Buscar plato activo"
                : "Buscar menú activo"
            }
          />

          {searchLoading && <p className="week-day-column__hint">Buscando…</p>}
          {!searchLoading && searchError && (
            <p className="week-day-column__hint week-day-column__hint--error">
              {searchError}
            </p>
          )}
          {!searchLoading &&
            !searchError &&
            searchType === "dish" &&
            dishResults.length === 0 && (
              <p className="week-day-column__hint">
                {query.trim() ? "Sin resultados." : "No hay platos activos."}
              </p>
            )}
          {!searchLoading &&
            !searchError &&
            searchType === "menu" &&
            menuResults.length === 0 && (
              <p className="week-day-column__hint">
                {query.trim() ? "Sin resultados." : "No hay menús activos."}
              </p>
            )}

          {searchType === "dish" && dishResults.length > 0 && (
            <ul className="week-day-column__results">
              {dishResults.map((dish) => (
                <li key={dish.id}>
                  <span>{dish.name ?? "Sin nombre"}</span>
                  <button
                    type="button"
                    onClick={() => void handleAddDish(dish)}
                    disabled={resolvingId === dish.id}
                  >
                    {resolvingId === dish.id ? "…" : "Agregar"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {searchType === "menu" && menuResults.length > 0 && (
            <ul className="week-day-column__results">
              {menuResults.map((menu) => (
                <li key={menu.id}>
                  <span>{menu.name ?? "Sin nombre"}</span>
                  <button
                    type="button"
                    onClick={() => void handleAddMenu(menu)}
                    disabled={resolvingId === menu.id}
                  >
                    {resolvingId === menu.id ? "…" : "Agregar"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {addError && (
            <div
              className="dish-link-feedback dish-link-feedback--error"
              role="alert"
            >
              {addError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
