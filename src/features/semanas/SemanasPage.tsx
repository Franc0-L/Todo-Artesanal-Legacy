import { useCallback, useEffect, useState } from "react";
import { WeekDrawer } from "./WeekDrawer";
import { EmptyState } from "../../components/ui/EmptyState";
import { listWeeks } from "./services/weeks.service";
import { formatDate, formatDateRange } from "../../lib/formatters";
import type { WeekStatus } from "../../types/domain";
import type { Week } from "./types/week";
import type { WeekListItem } from "./types/week-list";
import "./semanas.css";
import "./week-details.css";

const PAGE_SIZE = 20;
type StatusFilter = "all" | WeekStatus;

const WEEK_STATUS_LABELS: Record<WeekStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  closed: "Cerrada",
};

export function SemanasPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // Los resultados se guardan junto a la clave de la consulta que los pidió:
  // `items`, `total`, `loading` y `error` se derivan en el render. Así el
  // efecto no sincroniza estado antes de pedir los datos y nunca se muestra
  // el listado de un filtro, página o error anteriores.
  const requestKey = `${page}|${statusFilter}|${reloadToken}`;
  const [result, setResult] = useState<{
    key: string;
    items: WeekListItem[];
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

  // `reload` vuelve a consultar con los mismos filtros: se usa cuando hay que
  // refrescar el listado sin cambiar la clave por otro motivo.
  const reload = useCallback(() => setReloadToken((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    void listWeeks({
      status: statusFilter === "all" ? undefined : statusFilter,
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
              : "No se pudieron cargar las semanas.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [page, requestKey, statusFilter]);

  const handleCloseDrawer = useCallback(() => {
    setSelectedWeekId(null);
    setCreateDrawerOpen(false);
  }, []);

  const handleWeekCreated = useCallback(
    (created: Week) => {
      setCreateDrawerOpen(false);
      setSelectedWeekId(created.id);
      setPage(1);
      // `reload` fuerza la consulta aunque ya estuviéramos en la página 1 con
      // los mismos filtros (cambiar `page` a 1 no alcanzaría).
      reload();
    },
    [reload],
  );

  const handleWeekSaved = useCallback(
    (updated: Week) => {
      setResult((current) =>
        current && current.key === requestKey
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id
                  ? {
                      ...item,
                      startDate: updated.startDate,
                      endDate: updated.endDate,
                      status: updated.status,
                    }
                  : item,
              ),
            }
          : current,
      );
    },
    [requestKey],
  );

  // Tras un borrado, si la página quedó vacía volvemos una atrás; si no,
  // recargamos con los mismos filtros.
  const handleWeekDeleted = useCallback(() => {
    setSelectedWeekId(null);
    setCreateDrawerOpen(false);

    if (items.length <= 1 && page > 1) {
      setPage(page - 1);
      return;
    }

    reload();
  }, [items.length, page, reload]);

  function handleStatusChange(value: StatusFilter) {
    setPage(1);
    setStatusFilter(value);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="semanas-page" aria-labelledby="semanas-title">
      <header className="semanas-page__header">
        <div className="semanas-page__heading-row">
          <div>
            <p className="semanas-page__eyebrow">Administración</p>
            <h1 id="semanas-title">Semanas</h1>
            <p className="semanas-page__description">
              Configurá la oferta semanal y gestioná su ciclo de vida: borrador,
              activa y cerrada.
            </p>
          </div>
          <button
            className="semanas-primary-action"
            type="button"
            onClick={() => {
              setSelectedWeekId(null);
              setCreateDrawerOpen(true);
            }}
          >
            Nueva semana
          </button>
        </div>
      </header>

      <div className="semanas-toolbar">
        <div className="semanas-filter">
          <label htmlFor="week-status">Estado</label>
          <select
            id="week-status"
            value={statusFilter}
            onChange={(event) =>
              handleStatusChange(event.target.value as StatusFilter)
            }
          >
            <option value="all">Todos</option>
            <option value="draft">Borrador</option>
            <option value="active">Activas</option>
            <option value="closed">Cerradas</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="semanas-feedback semanas-feedback--error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}

      <div className="semanas-list-wrapper" aria-busy={loading}>
        {loading ? (
          <p className="semanas-feedback">Cargando semanas…</p>
        ) : items.length === 0 ? (
          <EmptyState
            mascot="listo_servir"
            title="No hay semanas para mostrar"
            description={
              statusFilter !== "all"
                ? "Probá cambiar el filtro de estado."
                : "Todavía no hay semanas creadas."
            }
          />
        ) : (
          <>
            <div className="semanas-list-header" aria-hidden="true">
              <span>Período</span>
              <span>Estado</span>
              <span>Creada</span>
            </div>
            <ul className="semanas-list" aria-label="Listado de semanas">
              {items.map((week) => (
                <li key={week.id}>
                  <button
                    className="week-row"
                    type="button"
                    onClick={() => setSelectedWeekId(week.id)}
                    aria-label={`Abrir semana ${formatDateRange(week.startDate, week.endDate)}`}
                  >
                    <strong>
                      {formatDateRange(week.startDate, week.endDate)}
                    </strong>
                    <span>
                      <span
                        className={`week-status week-status--${week.status}`}
                      >
                        {WEEK_STATUS_LABELS[week.status]}
                      </span>
                    </span>
                    <span>{formatDate(week.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {!loading && total > 0 && (
        <nav className="semanas-pagination" aria-label="Paginación de semanas">
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

      {/* El `key` remonta el drawer al cambiar de semana o de modo: el
          formulario arranca limpio sin resetear estado dentro de un efecto. */}
      <WeekDrawer
        key={createDrawerOpen ? "create" : `edit:${selectedWeekId ?? "closed"}`}
        mode={createDrawerOpen ? "create" : "edit"}
        weekId={createDrawerOpen ? null : selectedWeekId}
        onClose={handleCloseDrawer}
        onCreated={handleWeekCreated}
        onSaved={handleWeekSaved}
        onDeleted={handleWeekDeleted}
      />
    </section>
  );
}
