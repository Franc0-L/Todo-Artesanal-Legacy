import { useEffect, useRef, useState } from "react";
import { getWeek } from "./services/weeks.service";
import { getWeekOffer } from "./services/week-offer.service";
import { getExpectedClientCount } from "./services/week-expected-clients.service";
import { DAY_LABELS } from "./day-labels";
import { sortDayOptions } from "./week-suggest";
import {
  formatCurrency,
  formatDate,
  formatDateRange,
  formatDateTime,
} from "../../lib/formatters";
import type { WeekStatus } from "../../types/domain";
import type { Week } from "./types/week";
import type { WeekOffer } from "./types/week-offer";

interface WeekDetailDrawerProps {
  weekId: string | null;
  onClose: () => void;
  /** Abre el taller inline de la página para esta semana. */
  onOpenWorkspace: (weekId: string) => void;
}

const WEEK_STATUS_LABELS: Record<WeekStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  closed: "Cerrada",
};

const MODALITY_LABELS: Record<"general" | "opcional", string> = {
  general: "General",
  opcional: "Opcional",
};

/**
 * Ficha liviana de una semana (solo lectura) para ver estado, fechas,
 * clientes esperados y el resumen de la oferta por día.
 *
 * La edición vive en `WeekWorkspace`, inline en la página: este drawer
 * solo ofrece el acceso ("Abrir en la página") para no duplicar lógica.
 */
export function WeekDetailDrawer({
  weekId,
  onClose,
  onOpenWorkspace,
}: WeekDetailDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [offer, setOffer] = useState<WeekOffer | null>(null);
  const [expectedCount, setExpectedCount] = useState<number | null>(null);
  // El drawer se remonta por `key` al cambiar de semana: el estado inicial
  // ya representa la carga que dispara el efecto.
  const [loading, setLoading] = useState(weekId !== null);
  const [error, setError] = useState<string | null>(null);

  // La semana se reinicia por remonte (ver `key` en SemanasPage): el efecto
  // solo resuelve el fetch, sin sincronizar estado antes del primer `await`.
  useEffect(() => {
    if (!weekId) return;

    let cancelled = false;

    void Promise.all([getWeek(weekId), getWeekOffer(weekId)])
      .then(([weekResult, offerResult]) => {
        if (cancelled) return;

        setWeek(weekResult);
        setOffer(offerResult);

        if (weekResult.status !== "draft") {
          return getExpectedClientCount(weekId).then((count) => {
            if (!cancelled) setExpectedCount(count);
          });
        }

        return undefined;
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
  }, [weekId]);

  useEffect(() => {
    if (!weekId) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [weekId]);

  useEffect(() => {
    if (!weekId) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [weekId, onClose]);

  if (!weekId) {
    return null;
  }

  return (
    <div className="dish-drawer__backdrop" onMouseDown={onClose}>
      <aside
        className="dish-drawer week-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="week-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dish-drawer__header">
          <div>
            <p className="semanas-page__eyebrow">Detalle de semana</p>
            <h2 id="week-detail-title">
              {week ? formatDateRange(week.startDate, week.endDate) : "Semana"}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            className="dish-drawer__close"
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle de la semana"
          >
            ×
          </button>
        </header>

        <div className="dish-drawer__body">
          {loading && <p className="semanas-feedback">Cargando semana…</p>}

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

          {!loading && !error && week && (
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
                      esperado{expectedCount === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              </section>

              <section
                className="dish-drawer__section"
                aria-labelledby="week-detail-offer-title"
              >
                <div className="dish-drawer__section-heading">
                  <div>
                    <h3 id="week-detail-offer-title">Oferta por día</h3>
                    <p>
                      {week.status === "closed"
                        ? "Semana cerrada: la oferta queda como registro histórico."
                        : "Resumen de la oferta cargada. Para modificarla, abrí el taller en la página."}
                    </p>
                  </div>
                </div>

                {offer && offer.days.length === 0 && (
                  <p className="dish-form__hint">
                    La semana todavía no tiene días creados.
                  </p>
                )}

                <ul className="week-detail-days">
                  {offer?.days.map((offerDay) => (
                    <li key={offerDay.weekDay.id} className="week-detail-day">
                      <div className="week-detail-day__header">
                        <strong>
                          {DAY_LABELS[offerDay.weekDay.dayOfWeek]}
                        </strong>
                        <span>{formatDate(offerDay.weekDay.date)}</span>
                        <span className="week-detail-day__cutoff">
                          Cierra {formatDateTime(offerDay.weekDay.cutoffAt)}
                        </span>
                      </div>

                      {offerDay.options.length === 0 ? (
                        <p className="week-detail-day__empty">
                          Sin opciones cargadas.
                        </p>
                      ) : (
                        <ul className="week-detail-day__options">
                          {sortDayOptions(offerDay.options).map((option) => {
                            const name =
                              option.optionType === "dish"
                                ? option.dishVersion?.name
                                : option.menuVersion?.name;
                            const price =
                              option.optionType === "dish"
                                ? option.dishVersion?.price
                                : option.menuVersion?.price;

                            return (
                              <li key={option.id}>
                                <span
                                  className={`week-detail-day__modality week-detail-day__modality--${option.offerModality}`}
                                >
                                  {MODALITY_LABELS[option.offerModality]}
                                </span>
                                <span className="week-detail-day__name">
                                  {option.optionType === "dish"
                                    ? "Plato"
                                    : "Menú"}
                                  : {name ?? "Sin nombre"}
                                </span>
                                <span className="week-detail-day__price">
                                  {formatCurrency(price ?? 0)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <footer className="dish-form__actions">
                <button type="button" onClick={onClose}>
                  Cerrar
                </button>
                <button
                  className="week-detail__workspace-action"
                  type="button"
                  onClick={() => onOpenWorkspace(week.id)}
                >
                  Abrir en la página
                </button>
              </footer>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
