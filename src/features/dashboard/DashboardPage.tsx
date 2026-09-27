import { useCallback, useEffect, useState } from "react";
import { getDashboardSummary } from "./services/dashboard.service";
import { formatCurrency, formatDateRange } from "../../lib/formatters";
import { navigate } from "../../app/routes";
import type { DashboardSummary } from "./types/dashboard";
import "./dashboard.css";

export function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await getDashboardSummary();
      setData(summary);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la información del panel.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    function run() {
      void loadData();
    }
    run();
  }, [loadData]);

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <header className="dashboard-page__header">
        <div className="dashboard-page__heading-row">
          <div>
            <p className="dashboard-page__eyebrow">Administración</p>
            <h1 id="dashboard-title">Panel de Inicio</h1>
            <p className="dashboard-page__description">
              Resumen operativo del ciclo actual y accesos directos al catálogo
              y pedidos.
            </p>
          </div>
          <div className="dashboard-page__actions">
            <button
              className="dashboard-secondary-action"
              type="button"
              onClick={() => navigate("/admin/semanas")}
            >
              Gestionar semanas
            </button>
            <button
              className="dashboard-primary-action"
              type="button"
              onClick={() => navigate("/admin/pedidos")}
            >
              Ver pedidos
            </button>
          </div>
        </div>
      </header>

      {loading && (
        <div
          className="dashboard-feedback dashboard-feedback--loading"
          role="status"
        >
          Cargando métricas del panel…
        </div>
      )}

      {error && (
        <div
          className="dashboard-feedback dashboard-feedback--error"
          role="alert"
        >
          <span>{error}</span>
          <button type="button" onClick={() => void loadData()}>
            Reintentar
          </button>
        </div>
      )}

      {!loading && data && (
        <div className="dashboard-content">
          {data.activeWeek ? (
            <article
              className="dashboard-hero"
              aria-labelledby="active-week-heading"
            >
              <div className="dashboard-hero__header">
                <div className="dashboard-hero__title-group">
                  <img
                    src="/mascot/aprobado.png"
                    alt=""
                    aria-hidden="true"
                    className="dashboard-hero__mascot"
                    width="46"
                    height="78"
                  />
                  <h2 id="active-week-heading">
                    Semana en curso:{" "}
                    {formatDateRange(
                      data.activeWeek.week.startDate,
                      data.activeWeek.week.endDate,
                    )}
                  </h2>
                  <span className="dashboard-status-badge dashboard-status-badge--active">
                    Activa
                  </span>
                </div>
                <div className="dashboard-hero__actions">
                  <button
                    className="dashboard-primary-action"
                    type="button"
                    onClick={() => navigate("/admin/pedidos")}
                  >
                    Gestionar pedidos
                  </button>
                  <button
                    className="dashboard-secondary-action"
                    type="button"
                    onClick={() => navigate("/admin/semanas")}
                  >
                    Ver oferta
                  </button>
                </div>
              </div>

              <div className="dashboard-hero__kpi-grid">
                <div className="dashboard-kpi-card">
                  <span className="dashboard-kpi-card__label">
                    Viandas pedidas
                  </span>
                  <span className="dashboard-kpi-card__value">
                    {data.activeWeek.totals.totalQuantity}
                  </span>
                  <span className="dashboard-kpi-card__meta">
                    en {data.activeWeek.totals.orderCount} pedido(s)
                  </span>
                </div>

                <div className="dashboard-kpi-card">
                  <span className="dashboard-kpi-card__label">
                    Monto facturado
                  </span>
                  <span className="dashboard-kpi-card__value">
                    {formatCurrency(data.activeWeek.totals.totalAmount)}
                  </span>
                  <span className="dashboard-kpi-card__meta">
                    precios aplicados congelados
                  </span>
                </div>

                <div className="dashboard-kpi-card">
                  <span className="dashboard-kpi-card__label">
                    Población esperada
                  </span>
                  <span className="dashboard-kpi-card__value">
                    {data.activeWeek.expectedClientCount}
                  </span>
                  <span className="dashboard-kpi-card__meta">
                    clientes habilitados
                  </span>
                </div>

                <div className="dashboard-kpi-card">
                  <span className="dashboard-kpi-card__label">
                    Sin responder
                  </span>
                  <span className="dashboard-kpi-card__value">
                    {data.activeWeek.unansweredClientCount}
                  </span>
                  <span className="dashboard-kpi-card__meta">
                    clientes esperados pendientes
                  </span>
                </div>

                <div className="dashboard-kpi-card">
                  <span className="dashboard-kpi-card__label">
                    Cancelaciones
                  </span>
                  <span className="dashboard-kpi-card__value">
                    {data.activeWeek.cancellationCount}
                  </span>
                  <span className="dashboard-kpi-card__meta">
                    días cancelados
                  </span>
                </div>
              </div>
            </article>
          ) : (
            <article
              className="dashboard-hero dashboard-hero--empty"
              aria-labelledby="no-active-week-heading"
            >
              <div className="dashboard-hero--empty-layout">
                <img
                  src="/mascot/pose_base.png"
                  alt=""
                  aria-hidden="true"
                  className="dashboard-hero__empty-mascot"
                  width="96"
                  height="159"
                />
                <div className="dashboard-hero__empty-body">
                  <div className="dashboard-hero__title-group">
                    <h2 id="no-active-week-heading">
                      No hay una semana activa actualmente
                    </h2>
                    <span className="dashboard-status-badge dashboard-status-badge--neutral">
                      Inactivo
                    </span>
                  </div>
                  <p>
                    {data.hasDraftWeek
                      ? "Existe al menos una semana en borrador esperando ser configurada o activada para abrir la toma de pedidos."
                      : "No hay períodos activos ni borradores pendientes. Creá una nueva semana para configurar la oferta semanal."}
                  </p>
                  <button
                    className="dashboard-primary-action"
                    type="button"
                    onClick={() => navigate("/admin/semanas")}
                  >
                    {data.hasDraftWeek
                      ? "Revisar borradores"
                      : "Crear nueva semana"}
                  </button>
                </div>
              </div>
            </article>
          )}

          <section
            className="dashboard-section"
            aria-labelledby="overview-heading"
          >
            <h2 id="overview-heading">Estado del Negocio</h2>
            <div className="dashboard-overview-grid">
              <div className="dashboard-overview-card">
                <span className="dashboard-overview-card__label">
                  Clientes activos
                </span>
                <span className="dashboard-overview-card__value">
                  {data.counts.activeClients}
                </span>
                <span className="dashboard-overview-card__meta">
                  de {data.counts.totalClients} registrados
                </span>
              </div>

              <div className="dashboard-overview-card">
                <span className="dashboard-overview-card__label">
                  Platos activos
                </span>
                <span className="dashboard-overview-card__value">
                  {data.counts.activeDishes}
                </span>
                <span className="dashboard-overview-card__meta">
                  disponibles en catálogo
                </span>
              </div>

              <div className="dashboard-overview-card">
                <span className="dashboard-overview-card__label">
                  Menús activos
                </span>
                <span className="dashboard-overview-card__value">
                  {data.counts.activeMenus}
                </span>
                <span className="dashboard-overview-card__meta">
                  con versiones vigentes
                </span>
              </div>
            </div>
          </section>

          <section
            className="dashboard-section"
            aria-labelledby="shortcuts-heading"
          >
            <h2 id="shortcuts-heading">Accesos Rápidos</h2>
            <div className="dashboard-shortcuts-grid">
              <button
                className="dashboard-shortcut-card"
                type="button"
                onClick={() => navigate("/admin/clientes")}
              >
                <strong className="dashboard-shortcut-card__title">
                  Clientes
                </strong>
                <span className="dashboard-shortcut-card__description">
                  Administrá fichas personales, tokens de acceso y esquemas de
                  precios individuales.
                </span>
                <span className="dashboard-shortcut-card__link">
                  Ir a Clientes →
                </span>
              </button>

              <button
                className="dashboard-shortcut-card"
                type="button"
                onClick={() => navigate("/admin/platos")}
              >
                <strong className="dashboard-shortcut-card__title">
                  Platos
                </strong>
                <span className="dashboard-shortcut-card__description">
                  Gestioná platos individuales, categorías, climas y nuevas
                  versiones de precios base.
                </span>
                <span className="dashboard-shortcut-card__link">
                  Ir a Platos →
                </span>
              </button>

              <button
                className="dashboard-shortcut-card"
                type="button"
                onClick={() => navigate("/admin/menus")}
              >
                <strong className="dashboard-shortcut-card__title">
                  Menús
                </strong>
                <span className="dashboard-shortcut-card__description">
                  Componé opciones de menú con plato principal y guarniciones
                  opcionales.
                </span>
                <span className="dashboard-shortcut-card__link">
                  Ir a Menús →
                </span>
              </button>

              <button
                className="dashboard-shortcut-card"
                type="button"
                onClick={() => navigate("/admin/historial")}
              >
                <strong className="dashboard-shortcut-card__title">
                  Historial
                </strong>
                <span className="dashboard-shortcut-card__description">
                  Auditoría de semanas cerradas, montos históricos y control de
                  clientes sin responder.
                </span>
                <span className="dashboard-shortcut-card__link">
                  Ir a Historial →
                </span>
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
