import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import {
  runSupabase,
  runSupabaseFull,
  runSupabaseOrThrow,
} from "../../../lib/error-handler";
import { AppError } from "../../../lib/errors";
import type { Database } from "../../../types/database";
import type { DayOfWeek } from "../../../types/domain";
import type {
  Cancellation,
  CreateCancellationInput,
} from "../types/cancellation";
import type {
  CancellationListParams,
  CancellationListResult,
} from "../types/cancellation-list";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Select con enriquecimiento:
 *   cancellations → clients
 *   cancellations → week_days → weeks
 */
const CANCELLATION_SELECT = `
  id,
  client_id,
  week_day_id,
  created_at,
  updated_at,
  clients ( name, phone ),
  week_days (
    id,
    date,
    day_of_week,
    weeks (
      id,
      start_date,
      end_date
    )
  )
`;

interface CancellationRow {
  id: string;
  client_id: string;
  week_day_id: string;
  created_at: string;
  updated_at: string;
  clients: { name: string; phone: string | null } | null;
  week_days: {
    id: string;
    date: string;
    day_of_week: number;
    weeks: {
      id: string;
      start_date: string;
      end_date: string;
    } | null;
  } | null;
}

export async function listCancellations(
  params: CancellationListParams = {},
  client: SupabaseClient<Database> = supabase,
): Promise<CancellationListResult> {
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = client
    .from("cancellations")
    .select(CANCELLATION_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params.clientId !== undefined) {
    validateUuid(params.clientId, "clientId");
    query = query.eq("client_id", params.clientId);
  }

  if (params.weekDayId !== undefined) {
    validateUuid(params.weekDayId, "weekDayId");
    // week_day_id es columna directa en cancellations.
    query = query.eq("week_day_id", params.weekDayId);
  }

  if (params.weekId !== undefined) {
    validateUuid(params.weekId, "weekId");
    // Filtro sobre recurso anidado (week_days.week_id).
    query = query.filter("week_days.week_id", "eq", params.weekId);
  }

  const result = await runSupabaseFull<CancellationRow[]>(() => query);

  return {
    items: (result.data ?? []).map(mapCancellation),
    total: result.count ?? 0,
    page,
    pageSize,
  };
}

export async function getCancellation(
  cancellationId: string,
  client: SupabaseClient<Database> = supabase,
): Promise<Cancellation> {
  validateUuid(cancellationId, "cancellationId");

  const row = await runSupabaseOrThrow<CancellationRow>(() =>
    client
      .from("cancellations")
      .select(CANCELLATION_SELECT)
      .eq("id", cancellationId)
      .maybeSingle(),
  );

  return mapCancellation(row);
}

/**
 * Registra una cancelación.
 *
 * Validaciones en DB:
 *   - UNIQUE (client_id, week_day_id): no puede haber dos
 *     cancelaciones para el mismo cliente/día (23505 → CONFLICT).
 *   - trigger prevent_cancellation_with_order: el cliente no
 *     puede tener ya un pedido para ese mismo día.
 *   - trigger prevent_closed_cancellation_mutation: si la semana
 *     está closed, rechaza el INSERT.
 */
export async function createCancellation(
  input: CreateCancellationInput,
  client: SupabaseClient<Database> = supabase,
): Promise<Cancellation> {
  const payload = validateCreateCancellationInput(input);

  const row = await runSupabaseOrThrow<CancellationRow>(() =>
    client
      .from("cancellations")
      .insert(payload)
      .select(CANCELLATION_SELECT)
      .single(),
  );

  return mapCancellation(row);
}

/**
 * Elimina una cancelación.
 *
 * Permitido mientras la semana no esté closed (lo valida el
 * trigger prevent_closed_cancellation_mutation). Si está
 * cerrada, la operación lanza BUSINESS_RULE.
 *
 * No existe updateCancellation: es un hecho histórico inmutable.
 */
export async function deleteCancellation(
  cancellationId: string,
  client: SupabaseClient<Database> = supabase,
): Promise<void> {
  validateUuid(cancellationId, "cancellationId");

  await runSupabase<unknown>(() =>
    client.from("cancellations").delete().eq("id", cancellationId),
  );
}

function validateCreateCancellationInput(input: CreateCancellationInput): {
  client_id: string;
  week_day_id: string;
} {
  if (!input || typeof input !== "object") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Los datos de la cancelación son obligatorios.",
    );
  }

  validateUuid(input.clientId, "clientId");
  validateUuid(input.weekDayId, "weekDayId");

  return {
    client_id: input.clientId,
    week_day_id: input.weekDayId,
  };
}

function normalizePage(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_PAGE;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      "page debe ser un entero mayor o igual a 1.",
    );
  }

  return value;
}

function normalizePageSize(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_PAGE_SIZE;
  }

  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new AppError(
      "VALIDATION_ERROR",
      `pageSize debe ser un entero entre 1 y ${MAX_PAGE_SIZE}.`,
    );
  }

  return value;
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

function mapDayOfWeek(value: number): DayOfWeek {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return value;
  }

  throw new AppError(
    "DATABASE_ERROR",
    `El día de la semana almacenado es inválido: ${value}.`,
  );
}

function mapCancellation(row: CancellationRow): Cancellation {
  const wd = row.week_days;
  const week = wd?.weeks ?? null;

  return {
    id: row.id,
    clientId: row.client_id,
    weekDayId: row.week_day_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    client: row.clients
      ? { name: row.clients.name, phone: row.clients.phone }
      : null,
    weekDay: wd
      ? {
          id: wd.id,
          date: wd.date,
          dayOfWeek: mapDayOfWeek(wd.day_of_week),
        }
      : null,
    week: week
      ? {
          id: week.id,
          startDate: week.start_date,
          endDate: week.end_date,
        }
      : null,
  };
}
