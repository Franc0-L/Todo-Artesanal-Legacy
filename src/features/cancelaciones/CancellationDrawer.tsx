import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createCancellation } from "./services/cancellations.service";
import { getActiveWeek } from "../semanas/services/weeks.service";
import { listWeekDays } from "../semanas/services/week-days.service";
import { getExpectedClients } from "../semanas/services/week-expected-clients.service";
import { formatDate, formatDateRange } from "../../lib/formatters";
import { useConfirm } from "../../components/ui/useConfirm";
import type {
  Cancellation,
  CreateCancellationInput,
} from "./types/cancellation";
import type { Week } from "../semanas/types/week";
import type { WeekDay } from "../semanas/types/week-day";
import type { WeekExpectedClient } from "../semanas/types/week-expected-clients";

interface CancellationDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated: (cancellation: Cancellation) => void;
}

const DAY_LABELS: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
};

export function CancellationDrawer({
  open,
  onClose,
  onCreated,
}: CancellationDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [activeWeek, setActiveWeek] = useState<Week | null>(null);
  const [days, setDays] = useState<WeekDay[]>([]);
  const [expectedClients, setExpectedClients] = useState<WeekExpectedClient[]>(
    [],
  );
  const [selectedDayId, setSelectedDayId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");

  const [loading, setLoading] = useState(open);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { confirm, confirmDialog } = useConfirm();
  const dirty = selectedDayId !== "" || selectedClientId !== "";

  // El formulario se reinicia por remonte (ver `key` en CancelacionesPage):
  // el estado inicial ya es el correcto y el efecto solo resuelve el fetch,
  // sin sincronizar estado antes del primer `await`.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    void getActiveWeek()
      .then((week) => {
        if (cancelled) return null;
        setActiveWeek(week);
        if (!week) return null;
        return Promise.all([
          listWeekDays(week.id),
          getExpectedClients(week.id),
        ]);
      })
      .then((result) => {
        if (cancelled || !result) return;
        const [daysResult, expectedResult] = result;
        setDays(daysResult);
        setExpectedClients(expectedResult.items);
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

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const requestClose = useCallback(async () => {
    if (dirty) {
      const proceed = await confirm({
        title: "Cambios sin guardar",
        message:
          "Hay una cancelación sin guardar. Si cerrás ahora, se va a perder.",
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

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      void requestClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, requestClose]);

  const filteredClients = expectedClients.filter((entry) => {
    const query = clientQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      (entry.client?.name ?? "").toLowerCase().includes(query) ||
      (entry.client?.phone ?? "").includes(query)
    );
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    setError(null);

    if (!selectedDayId) {
      setError("Elegí un día.");
      return;
    }

    if (!selectedClientId) {
      setError("Elegí un cliente.");
      return;
    }

    setSaving(true);

    try {
      const input: CreateCancellationInput = {
        clientId: selectedClientId,
        weekDayId: selectedDayId,
      };
      const created = await createCancellation(input);
      onCreated(created);
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : "No se pudo registrar la cancelación.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return null;
  }

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
          aria-labelledby="cancellation-drawer-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="dish-drawer__header">
            <div>
              <p className="cancelaciones-page__eyebrow">Nueva cancelación</p>
              <h2 id="cancellation-drawer-title">Registrar cancelación</h2>
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
            {loading && <p className="cancelaciones-feedback">Cargando…</p>}

            {!loading && error && (
              <div
                className="cancelaciones-feedback cancelaciones-feedback--error"
                role="alert"
              >
                <p>{error}</p>
                <button type="button" onClick={() => setError(null)}>
                  Cerrar aviso
                </button>
              </div>
            )}

            {!loading && !activeWeek && (
              <p className="dish-form__hint">
                No hay una semana activa. Activá una semana desde Semanas para
                poder registrar cancelaciones.
              </p>
            )}

            {!loading && activeWeek && (
              <form className="dish-form" onSubmit={handleSubmit}>
                <p className="dish-form__hint">
                  Semana activa:{" "}
                  {formatDateRange(activeWeek.startDate, activeWeek.endDate)}.
                  Una cancelación afecta el día completo.
                </p>

                <div className="dish-form__fields">
                  <label>
                    Día
                    <select
                      value={selectedDayId}
                      onChange={(event) => setSelectedDayId(event.target.value)}
                      required
                    >
                      <option value="">Elegir día…</option>
                      {days.map((day) => (
                        <option key={day.id} value={day.id}>
                          {DAY_LABELS[day.dayOfWeek]} ({formatDate(day.date)})
                        </option>
                      ))}
                    </select>
                  </label>
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
                  <p className="cancel-hint">
                    Esta semana todavía no tiene clientes esperados.
                  </p>
                ) : (
                  <ul className="cancel-client-results">
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
                    disabled={saving || !selectedDayId || !selectedClientId}
                  >
                    {saving ? "Registrando…" : "Registrar cancelación"}
                  </button>
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
