import { supabase } from "../../../lib/supabase";
import { runSupabaseFull } from "../../../lib/error-handler";
import { AppError } from "../../../lib/errors";
import type {
  WeekExpectedClient,
  WeekExpectedClientsResult,
} from "../types/week-expected-clients";

interface WeekExpectedClientWithClient {
  week_id: string;
  client_id: string;
  created_at: string;
  clients: {
    name: string;
    phone: string | null;
    allows_half_portion: boolean;
  } | null;
}

const WEEK_EXPECTED_CLIENT_SELECT = `
  week_id,
  client_id,
  created_at,
  clients (
    name,
    phone,
    allows_half_portion
  )
`;

/**
 * Devuelve los clientes esperados de una semana (población
 * congelada al activar).
 *
 * No pagina: una semana tiene una cantidad acotada de clientes
 * esperados. Si en el futuro el volumen crece, agregar
 * paginación.
 */
export async function getExpectedClients(
  weekId: string,
): Promise<WeekExpectedClientsResult> {
  validateUuid(weekId, "weekId");

  const result = await runSupabaseFull<WeekExpectedClientWithClient[]>(() =>
    supabase
      .from("week_expected_clients")
      .select(WEEK_EXPECTED_CLIENT_SELECT, { count: "exact" })
      .eq("week_id", weekId)
      .order("created_at", { ascending: true }),
  );

  return {
    items: (result.data ?? []).map(mapWeekExpectedClient),
    total: result.count ?? 0,
  };
}

export async function getExpectedClientCount(weekId: string): Promise<number> {
  validateUuid(weekId, "weekId");

  const result = await runSupabaseFull<unknown[]>(() =>
    supabase
      .from("week_expected_clients")
      .select("*", { count: "exact", head: true })
      .eq("week_id", weekId),
  );

  return result.count ?? 0;
}

function validateUuid(value: string, fieldName: string): void {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${fieldName} debe ser un UUID válido.`,
    );
  }
}

function mapWeekExpectedClient(
  row: WeekExpectedClientWithClient,
): WeekExpectedClient {
  return {
    weekId: row.week_id,
    clientId: row.client_id,
    createdAt: row.created_at,
    client: row.clients
      ? {
          name: row.clients.name,
          phone: row.clients.phone,
          allowsHalfPortion: row.clients.allows_half_portion,
        }
      : null,
  };
}
