import { useEffect } from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import { formatDateRange } from "../../lib/formatters";
import { ClientDayCard } from "./ClientDayCard";
import { useClientSession } from "./useClientSession";
import { useClientWeekData } from "./useClientWeekData";
import type { ClientMenuData } from "./types/menu-data";
import type { MenuClient } from "./types/client-session";
import "./menu.css";

/** Límite de `setTimeout` (~24,8 días): cortes de semana activa siempre entran. */
const MAX_CUTOFF_TIMER_MS = 2_147_483_647;

/**
 * Menú personal del cliente (`/menu/:token`).
 *
 * No maneja autenticación propia: la sesión (JWT con el claim `client_id`)
 * la resuelve `ClientSessionProvider` y acá solo se consume. Todas las
 * queries corren contra el cliente Supabase de la sesión, así que RLS es
 * quien decide qué ve este componente.
 */
export function ClientMenuPage() {
  const {
    status,
    sessionId,
    session,
    client,
    error: sessionError,
    reauthenticate,
  } = useClientSession();

  const clientId = session?.clientId ?? null;
  const { loading, error: dataError, data, reload } = useClientWeekData(
    client,
    clientId,
    sessionId,
  );

  // Al llegar el corte de un día ("fuera de horario"), recarga la
  // semana para mostrar el estado nuevo sin esperar una interacción.
  // El timer solo programa `reload()` dentro de su callback; nunca se
  // fija estado sincrónicamente en el cuerpo del efecto.
  useEffect(() => {
    if (!data) return;
    const timers = data.offer.days
      .map((day) => {
        const ms = Date.parse(day.weekDay.cutoffAt) - Date.now();
        if (ms <= 0 || ms > MAX_CUTOFF_TIMER_MS) return null;
        return window.setTimeout(() => reload(), ms);
      })
      .filter((timer): timer is number => timer !== null);
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [data, reload]);

  return (
    <section className="client-menu" aria-labelledby="client-menu-title">
      <header className="client-menu__header">
        <p className="client-menu__eyebrow">Todo Artesanal</p>
        <h1 id="client-menu-title">Tu menú semanal</h1>
      </header>

      {status === "authenticating" && (
        <div
          className="client-menu__feedback client-menu__feedback--loading"
          role="status"
        >
          Validando tu enlace…
        </div>
      )}

      {status === "invalid" && (
        <EmptyState
          mascot="pose_base"
          title="Este enlace ya no es válido"
          description="El link fue actualizado o venció. Pedile a Todo Artesanal un enlace nuevo para seguir pidiendo."
        />
      )}

      {status === "error" && (
        <div
          className="client-menu__feedback client-menu__feedback--error"
          role="alert"
        >
          <span>{sessionError ?? "No se pudo validar el enlace."}</span>
          <button type="button" onClick={reauthenticate}>
            Reintentar
          </button>
        </div>
      )}

      {status === "authenticated" && (
        <>
          {loading && (
            <div
              className="client-menu__feedback client-menu__feedback--loading"
              role="status"
            >
              Cargando la semana…
            </div>
          )}

          {dataError && (
            <div
              className="client-menu__feedback client-menu__feedback--error"
              role="alert"
            >
              <span>{dataError}</span>
              <button type="button" onClick={reauthenticate}>
                Reintentar
              </button>
            </div>
          )}

          {!loading && !dataError && (
            <>
              {data && client && clientId ? (
                <ActiveWeek
                  data={data}
                  client={client}
                  clientId={clientId}
                  onChanged={reload}
                />
              ) : (
                <EmptyState
                  mascot="preparacion"
                  title="Todavía no hay una semana activa"
                  description="Cuando se habilite la semana vas a ver acá la oferta de los días y vas a poder hacer tu pedido."
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

interface ActiveWeekProps {
  data: ClientMenuData;
  client: MenuClient;
  clientId: string;
  onChanged: () => void;
}

function ActiveWeek({ data, client, clientId, onChanged }: ActiveWeekProps) {
  const { week, offer, orders, cancellations, prices, client: clientRow } = data;
  const allowsHalfPortion = clientRow?.allowsHalfPortion ?? false;
  const closedDayIds = new Set(data.closedDayIds);

  return (
    <article className="client-menu__week" aria-labelledby="client-week-title">
      <div className="client-menu__week-heading">
        <h2 id="client-week-title">
          Semana del {formatDateRange(week.startDate, week.endDate)}
        </h2>
        <span className="client-menu__badge">Semana activa</span>
      </div>
      <p className="client-menu__week-note">
        Elegí tu vianda para cada día. Podés cambiarla o avisar que no la querés
        hasta que la semana cierre.
      </p>

      <div className="client-menu__days">
        {offer.days.map((day) => (
          <ClientDayCard
            key={day.weekDay.id}
            day={day}
            orders={orders.filter((order) => order.weekDayId === day.weekDay.id)}
            cancellation={
              cancellations.find((item) => item.weekDayId === day.weekDay.id) ??
              null
            }
            prices={prices}
            allowsHalfPortion={allowsHalfPortion}
            clientId={clientId}
            client={client}
            closed={closedDayIds.has(day.weekDay.id)}
            onChanged={onChanged}
          />
        ))}
      </div>
    </article>
  );
}
