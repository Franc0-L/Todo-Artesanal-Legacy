import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isAppError } from "../../lib/errors";
import { createClientWithToken } from "../../lib/supabase";
import {
  authenticateClientToken,
  clearStoredSession,
  readStoredSession,
  storeSession,
} from "./services/client-auth.service";
import type { ClientSession, ClientSessionState } from "./types/client-session";
import {
  ClientSessionContext,
  type ClientSessionContextValue,
} from "./useClientSession";

interface ClientSessionProviderProps {
  linkToken: string;
  children: ReactNode;
}

/**
 * Cuánto antes de que venza el JWT se emite uno nuevo en segundo plano.
 * Deja margen suficiente para que ninguna query arranque con un token a
 * punto de expirar.
 */
const REFRESH_LEAD_MS = 60_000;

/** Piso del temporizador, para sesiones que llegan casi vencidas. */
const MIN_REFRESH_DELAY_MS = 5_000;

/**
 * Contador monotónico: cada emisión de sesión recibe un `sessionId`
 * distinto, de modo que las pantallas puedan saber si sus datos fueron
 * pedidos con el JWT vigente o con uno anterior.
 */
let sessionCounter = 0;

function authenticatingState(linkToken: string): ClientSessionState {
  return {
    linkToken,
    sessionId: null,
    status: "authenticating",
    session: null,
    client: null,
    error: null,
  };
}

function authenticatedState(
  linkToken: string,
  session: ClientSession,
): ClientSessionState {
  sessionCounter += 1;

  return {
    linkToken,
    sessionId: `client-session-${sessionCounter}`,
    status: "authenticated",
    session,
    client: createClientWithToken(session.accessToken),
    error: null,
  };
}

/**
 * Resuelve la sesión del link. Vive fuera del componente para que el efecto
 * solo dispare la promesa y fije el estado dentro de su callback (regla
 * `react-hooks/set-state-in-effect`).
 *
 * Orden de preferencia:
 *   1. sesión guardada en la pestaña, si corresponde al link y no venció;
 *   2. intercambio con `authenticate-client-token`.
 *
 * `force` saltea la sesión guardada (refresco programado antes de que
 * venza el JWT).
 *
 * Un 401/400 (link rotado o inexistente) devuelve `invalid` y limpia lo
 * guardado; el resto de los fallos devuelve `error`, que es reintentable.
 */
async function resolveSession(
  linkToken: string,
  force: boolean,
): Promise<ClientSessionState> {
  const stored = force ? null : readStoredSession(linkToken);
  if (stored) return authenticatedState(linkToken, stored);

  try {
    const session = await authenticateClientToken(linkToken);
    storeSession(session);
    return authenticatedState(linkToken, session);
  } catch (error) {
    if (isAppError(error) && error.code === "UNAUTHORIZED") {
      clearStoredSession();
      return {
        linkToken,
        sessionId: null,
        status: "invalid",
        session: null,
        client: null,
        error: null,
      };
    }

    return {
      linkToken,
      sessionId: null,
      status: "error",
      session: null,
      client: null,
      error: isAppError(error)
        ? error.message
        : "No se pudo validar el enlace. Probá de nuevo.",
    };
  }
}

/**
 * Expone la sesión del cliente para `/menu/:token`.
 *
 * El JWT (1 hora) se guarda en `sessionStorage` junto al link que lo
 * produjo: sobrevive al refresh de la pestaña, muere con ella, se emite uno
 * nuevo antes de que venza el actual, y se vuelve a emitir si el admin rota
 * el link.
 *
 * La seguridad no está acá: el alcance real lo define RLS leyendo el claim
 * `client_id` del JWT. Esto es solo UX (evitar re-emisión en cada carga).
 */
export function ClientSessionProvider({
  linkToken,
  children,
}: ClientSessionProviderProps) {
  const [state, setState] = useState<ClientSessionState>(() =>
    authenticatingState(linkToken),
  );
  const { session } = state;

  // Cada intento (efecto, `reauthenticate` o el refresco programado)
  // incrementa el contador: la respuesta solo se aplica si sigue siendo la
  // última en llegar. Así un cambio de link o un desmontaje descartan lo
  // que estuviera en vuelo.
  const attemptRef = useRef(0);

  // Programa un intento de resolución sin fijar estado de forma sincrónica:
  // el resultado entra por el callback de la promesa (regla
  // `react-hooks/set-state-in-effect`). El estado "progresivo" lo decide
  // quien dispara el intento.
  const scheduleResolve = useCallback(
    (force: boolean) => {
      attemptRef.current += 1;
      const attempt = attemptRef.current;

      void resolveSession(linkToken, force).then((next) => {
        if (attemptRef.current === attempt) setState(next);
      });
    },
    [linkToken],
  );

  // El arranque no fija estado: el inicial ya es "autenticando" y un
  // cambio de link se resuelve derivándolo en el valor del contexto (el
  // efecto solo espera la respuesta).
  useEffect(() => {
    scheduleResolve(false);

    return () => {
      // Descarta la respuesta si cambia el link o se desmonta la ruta.
      attemptRef.current += 1;
    };
  }, [scheduleResolve]);

  // Refresco programado: emite un JWT nuevo antes de que venza el vigente.
  // Con `force` no reutiliza lo guardado (aún estaría "vigente" según el
  // margen de lectura) y sin estado de progreso la pantalla no parpadea:
  // los datos siguen visibles hasta que cambie el `sessionId`.
  useEffect(() => {
    if (!session) return;

    const delay = Math.max(
      session.expiresAt - Date.now() - REFRESH_LEAD_MS,
      MIN_REFRESH_DELAY_MS,
    );

    const timer = window.setTimeout(() => scheduleResolve(true), delay);
    return () => window.clearTimeout(timer);
  }, [session, scheduleResolve]);

  const reauthenticate = useCallback(() => {
    // Solo se muestra "validando" si no hay sesión usable para este link:
    // un reintento con sesión vigente no debe tapar la pantalla.
    setState((current) =>
      current.linkToken === linkToken && current.status === "authenticated"
        ? current
        : authenticatingState(linkToken),
    );

    scheduleResolve(false);
  }, [linkToken, scheduleResolve]);

  const value = useMemo<ClientSessionContextValue>(() => {
    // Si el link cambió y el estado todavía pertenece al anterior, se
    // muestra "autenticando" sin fijar estado en el render.
    const current =
      state.linkToken === linkToken ? state : authenticatingState(linkToken);

    return {
      status: current.status,
      sessionId: current.sessionId,
      session: current.session,
      client: current.client,
      error: current.error,
      reauthenticate,
    };
  }, [state, linkToken, reauthenticate]);

  return (
    <ClientSessionContext.Provider value={value}>
      {children}
    </ClientSessionContext.Provider>
  );
}
