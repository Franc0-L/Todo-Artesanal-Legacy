import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types/database";

/** Cliente Supabase autenticado con el JWT del cliente. */
export type MenuClient = SupabaseClient<Database>;

/**
 * Sesión emitida por la Edge Function `authenticate-client-token`.
 *
 * `linkToken` es el token personal del link (`/menu/:token`). No viaja a
 * Supabase: solo se guarda junto a la sesión para comprobar que la sesión
 * persistida corresponde al link que se está abriendo (si el admin rota el
 * token, la sesión vieja no debe servir para el link nuevo).
 */
export interface ClientSession {
  linkToken: string;
  accessToken: string;
  clientId: string;
  /** Momento en que vence el JWT, en epoch ms. */
  expiresAt: number;
}

export type ClientSessionStatus =
  /** Intercambiando el link por un JWT (o reutilizando el de sessionStorage). */
  | "authenticating"
  | "authenticated"
  /** 401/400: el link no existe, fue rotado o tiene formato inválido. */
  | "invalid"
  /** Red o servidor caído: se puede reintentar. */
  | "error";

/**
 * Estado del contexto de sesión del cliente.
 *
 * `sessionId` identifica a la consulta que produjo la sesión (es único por
 * emisión): las pantallas lo usan como parte de la clave de sus resultados,
 * de modo que al reemitir el JWT los datos viejos no se confunden con los
 * nuevos.
 */
export interface ClientSessionState {
  linkToken: string;
  sessionId: string | null;
  status: ClientSessionStatus;
  session: ClientSession | null;
  client: MenuClient | null;
  error: string | null;
}
