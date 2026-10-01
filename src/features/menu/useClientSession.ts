import { createContext, useContext } from "react";
import type {
  ClientSession,
  ClientSessionStatus,
  MenuClient,
} from "./types/client-session";

export interface ClientSessionContextValue {
  status: ClientSessionStatus;
  /**
   * Clave única de la sesión vigente. Las pantallas la suman a la clave de
   * sus consultas para no mezclar datos pedidos con un JWT anterior.
   */
  sessionId: string | null;
  session: ClientSession | null;
  /** Cliente Supabase (instancia propia) listo para consultar. Null mientras autentica. */
  client: MenuClient | null;
  error: string | null;
  /**
   * Reintenta la emisión del JWT ignorando el estado previo. Se usa tanto
   * para el error de la sesión como para el de cualquier consulta: como
   * genera un `sessionId` nuevo, las pantallas reconsultan solas.
   */
  reauthenticate: () => void;
}

export const ClientSessionContext =
  createContext<ClientSessionContextValue | null>(null);

export function useClientSession(): ClientSessionContextValue {
  const context = useContext(ClientSessionContext);

  if (!context) {
    throw new Error(
      "useClientSession debe utilizarse dentro de ClientSessionProvider.",
    );
  }

  return context;
}
