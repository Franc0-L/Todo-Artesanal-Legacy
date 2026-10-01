import type { FunctionsError, FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import { AppError } from "../../../lib/errors";
import type { ClientSession } from "../types/client-session";

interface AuthenticateResponse {
  accessToken: string;
  clientId: string;
  expiresIn: number;
}

const STORAGE_KEY = "todo-artesanal:client-session:v1";

/**
 * Reemitimos el JWT si quedan menos de 30 segundos para que venza, para
 * que ninguna query arranque con un token que expira en el medio.
 */
const EXPIRY_MARGIN_MS = 30_000;

/**
 * Mismo rango que valida la Edge Function (rotate-client-token genera 32
 * bytes en base64url, ~43 caracteres). Sirve para descartar links rotos
 * sin gastar un viaje al servidor.
 */
const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,512}$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Cambia el link personal por un JWT de cliente.
 *
 * La Edge Function `authenticate-client-token`:
 *  - hashea el token y lo busca entre los vigentes (client_tokens);
 *  - responde 401 con mensaje genérico si no existe o fue rotado;
 *  - emite un JWT ES256 con el claim `client_id` (1 hora).
 *
 * Lanza `AppError("UNAUTHORIZED")` cuando el link no sirve y
 * `AppError("DATABASE_ERROR" | "UNKNOWN_ERROR")` cuando es un problema
 * transitorio reintentable.
 */
export async function authenticateClientToken(
  linkToken: string,
): Promise<ClientSession> {
  if (!LINK_TOKEN_PATTERN.test(linkToken)) {
    throw new AppError("UNAUTHORIZED", "Este enlace ya no es válido.");
  }

  const { data, error } = await supabase.functions.invoke<AuthenticateResponse>(
    "authenticate-client-token",
    { body: { token: linkToken } },
  );

  if (error) {
    throw mapFunctionsError(error);
  }

  if (
    !data?.accessToken ||
    !data.clientId ||
    !UUID_PATTERN.test(data.clientId) ||
    typeof data.expiresIn !== "number"
  ) {
    throw new AppError(
      "UNAUTHORIZED",
      "La respuesta del servidor no es válida.",
    );
  }

  return {
    linkToken,
    accessToken: data.accessToken,
    clientId: data.clientId,
    expiresAt: Date.now() + data.expiresIn * 1000,
  };
}

/**
 * Devuelve la sesión guardada en esta pestaña si corresponde al link y el
 * JWT sigue vigente; si no, null (y limpia lo guardado).
 *
 * sessionStorage es por pestaña: cerrar la pestaña borra la sesión, y cada
 * link distinto tiene la suya.
 */
export function readStoredSession(linkToken: string): ClientSession | null {
  const raw = getStorageItem();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearStoredSession();
    return null;
  }

  const session = toSession(parsed);
  if (
    !session ||
    session.linkToken !== linkToken ||
    session.expiresAt - EXPIRY_MARGIN_MS <= Date.now()
  ) {
    clearStoredSession();
    return null;
  }

  return session;
}

export function storeSession(session: ClientSession): void {
  setStorageItem(JSON.stringify(session));
}

export function clearStoredSession(): void {
  setStorageItem(null);
}

function getStorageItem(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage inhabilitado (modo privado, política del navegador): el flujo
    // sigue funcionando, solo que reemitiendo el JWT en cada carga.
    return null;
  }
}

function setStorageItem(value: string | null): void {
  try {
    if (value === null) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // Ver getStorageItem: sin storage seguimos operando en memoria.
  }
}

function toSession(value: unknown): ClientSession | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<ClientSession>;

  if (
    typeof candidate.linkToken !== "string" ||
    typeof candidate.accessToken !== "string" ||
    typeof candidate.clientId !== "string" ||
    typeof candidate.expiresAt !== "number" ||
    !UUID_PATTERN.test(candidate.clientId)
  ) {
    return null;
  }

  return {
    linkToken: candidate.linkToken,
    accessToken: candidate.accessToken,
    clientId: candidate.clientId,
    expiresAt: candidate.expiresAt,
  };
}

function mapFunctionsError(error: FunctionsError): AppError {
  const status = (error as FunctionsHttpError).context?.status;

  if (status === 400 || status === 401 || status === 403) {
    return new AppError(
      "UNAUTHORIZED",
      "Este enlace ya no es válido o fue actualizado.",
      { cause: error },
    );
  }

  if (typeof status === "number") {
    return new AppError(
      "DATABASE_ERROR",
      "No se pudo validar el enlace. Probá de nuevo en unos segundos.",
      { cause: error },
    );
  }

  // Sin status = error de red o del relay, nunca del link en sí.
  return new AppError(
    "UNKNOWN_ERROR",
    "No se pudo conectar. Revisá tu conexión y probá de nuevo.",
    { cause: error },
  );
}
