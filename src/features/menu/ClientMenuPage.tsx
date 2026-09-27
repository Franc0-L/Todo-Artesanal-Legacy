import { useEffect, useState } from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import { isAppError } from "../../lib/errors";
import { formatDateRange } from "../../lib/formatters";
import { getActiveWeek } from "../semanas/services/weeks.service";
import type { Week } from "../semanas/types/week";
import { useClientSession } from "./useClientSession";
import "./menu.css";

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
    client,
    error: sessionError,
    reauthenticate,
  } = useClientSession();

  const [result, setResult] = useState<{
    key: string;
    week: Week | null;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  // La clave de la consulta es la sesión vigente: al reemitir el JWT cambia
  // el `sessionId`, eso marca `loading` y vuelve a disparar el efecto. El
  // reintento pasa por `reauthenticate()` (una acción de estado), nunca por
  // una llamada directa al loader desde un evento.
  const requestKey = sessionId;

  useEffect(() => {
    if (!client || requestKey === null) return;
    const key = requestKey;
    let cancelled = false;

    void getActiveWeek(client)
      .then((week) => {
        if (!cancelled) {
          setFailure(null);
          setResult({ key, week });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure({ key, message: dataErrorMessage(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [client, requestKey]);

  const dataError =
    requestKey !== null && failure?.key === requestKey ? failure.message : null;
  const loading =
    requestKey !== null && !dataError && result?.key !== requestKey;

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

          {!loading && !dataError && result && (
            <>
              {result.week ? (
                <ActiveWeek week={result.week} />
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

function ActiveWeek({ week }: { week: Week }) {
  return (
    <article className="client-menu__week" aria-labelledby="client-week-title">
      <div className="client-menu__week-heading">
        <h2 id="client-week-title">
          Semana del {formatDateRange(week.startDate, week.endDate)}
        </h2>
        <span className="client-menu__badge">Semana activa</span>
      </div>
      <p className="client-menu__week-note">
        La oferta de esta semana y la toma de pedidos se muestran en esta
        tarjeta.
      </p>
    </article>
  );
}

/**
 * Convierte el error de la consulta en algo que se le pueda mostrar al
 * cliente. Un fallo de permisos suele ser un JWT vencido o recién rotado,
 * y el botón de reintentar lo resuelve emitiendo uno nuevo.
 */
function dataErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED") {
      return "No se pudo consultar la oferta con este enlace. Reintentá.";
    }
    return error.message;
  }

  return "No se pudo cargar la oferta de la semana.";
}
