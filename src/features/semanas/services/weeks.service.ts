import { supabase } from "../../../lib/supabase";
import {
  runSupabase,
  runSupabaseFull,
  runSupabaseOrThrow,
} from "../../../lib/error-handler";
import { AppError } from "../../../lib/errors";
import type { Tables } from "../../../types/database";
import type { WeekStatus } from "../../../types/domain";
import type { CreateWeekInput, UpdateWeekInput, Week } from "../types/week";
import type {
  WeekListItem,
  WeekListParams,
  WeekListResult,
} from "../types/week-list";

type WeekRow = Tables<"weeks">;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const WEEK_COLUMNS = "id,start_date,end_date,status,created_at,updated_at";

const WEEK_LIST_COLUMNS = "id,start_date,end_date,status,created_at";

export async function listWeeks(
  params: WeekListParams = {},
): Promise<WeekListResult> {
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("weeks")
    .select(WEEK_LIST_COLUMNS, { count: "exact" })
    .order("start_date", { ascending: false })
    .range(from, to);

  if (params.status !== undefined) {
    validateStatus(params.status);
    query = query.eq("status", params.status);
  }

  const result = await runSupabaseFull<
    Pick<WeekRow, "id" | "start_date" | "end_date" | "status" | "created_at">[]
  >(() => query);

  return {
    items: (result.data ?? []).map(mapWeekListItem),
    total: result.count ?? 0,
    page,
    pageSize,
  };
}

export async function getWeek(weekId: string): Promise<Week> {
  validateUuid(weekId, "weekId");

  const row = await runSupabaseOrThrow<WeekRow>(() =>
    supabase.from("weeks").select(WEEK_COLUMNS).eq("id", weekId).maybeSingle(),
  );

  return mapWeek(row);
}

/**
 * Devuelve la semana activa actual, o null si no hay ninguna.
 *
 * Es válido que devuelva null: entre el cierre de una semana y
 * la activación de la siguiente no hay semana activa.
 */
export async function getActiveWeek(): Promise<Week | null> {
  const row = await runSupabase<WeekRow>(() =>
    supabase
      .from("weeks")
      .select(WEEK_COLUMNS)
      .eq("status", "active")
      .maybeSingle(),
  );

  return row ? mapWeek(row) : null;
}

/**
 * Crea una semana con sus 5 días mediante el RPC create_week.
 *
 * El RPC valida:
 *  - admin;
 *  - start_date es lunes;
 *  - end_date es viernes;
 *  - rango de exactamente 5 días;
 *  - no solapamiento con otra semana existente (23P01 → CONFLICT).
 */
export async function createWeek(input: CreateWeekInput): Promise<Week> {
  const payload = validateCreateWeekInput(input);

  const weekId = await runSupabaseOrThrow<string>(() =>
    supabase.rpc("create_week", {
      p_start_date: payload.startDate,
      p_end_date: payload.endDate,
    }),
  );

  return getWeek(weekId);
}

/**
 * Actualiza las fechas de una semana en estado draft.
 *
 * ADVERTENCIA: si la semana ya tiene opciones de oferta
 * cargadas, esta operación las elimina (cascade a través de
 * week_days → week_day_options). El flujo esperado es configurar
 * fechas antes de cargar opciones.
 *
 * El RPC devuelve void. No usamos runSupabaseOrThrow acá porque
 * data sería null y lanzaría NOT_FOUND.
 */
export async function updateWeek(
  weekId: string,
  input: UpdateWeekInput,
): Promise<Week> {
  validateUuid(weekId, "weekId");
  const payload = validateUpdateWeekInput(input);

  await runSupabase<unknown>(() =>
    supabase.rpc("update_week", {
      p_week_id: weekId,
      p_start_date: payload.startDate,
      p_end_date: payload.endDate,
    }),
  );

  return getWeek(weekId);
}

/**
 * Activa una semana (draft → active).
 *
 * El RPC activate_week valida:
 *  - admin;
 *  - semana en draft;
 *  - no otra semana activa;
 *  - exactamente 5 días;
 *  - cada día con al menos una opción;
 *  - cada menu_version usada con exactamente 1 main;
 *  - congela week_expected_clients con los clientes activos.
 *
 * El RPC devuelve void.
 */
export async function activateWeek(weekId: string): Promise<void> {
  validateUuid(weekId, "weekId");

  await runSupabase<unknown>(() =>
    supabase.rpc("activate_week", {
      p_week_id: weekId,
    }),
  );
}

/**
 * Cierra una semana (active → closed). closed es terminal.
 *
 * El RPC devuelve void.
 */
export async function closeWeek(weekId: string): Promise<void> {
  validateUuid(weekId, "weekId");

  await runSupabase<unknown>(() =>
    supabase.rpc("close_week", {
      p_week_id: weekId,
    }),
  );
}

/**
 * Elimina definitivamente una semana.
 *
 * En la práctica solo funciona para semanas "vírgenes" (típicamente un
 * borrador sin operaciones): la DB no tiene ON DELETE CASCADE desde orders
 * ni cancellations, y las opciones ya ofrecidas tienen un trigger que
 * impide borrarlas. Si hay datos que la referencian, el DELETE devuelve
 * un CONFLICT (23503) y acá se propaga tal cual.
 *
 * Nunca se usa sobre semanas cerradas: el historial es inmutable.
 */
export async function deleteWeek(weekId: string): Promise<void> {
  validateUuid(weekId, "weekId");

  await runSupabase<unknown>(() =>
    supabase.from("weeks").delete().eq("id", weekId),
  );
}

function validateCreateWeekInput(input: CreateWeekInput): {
  startDate: string;
  endDate: string;
} {
  if (!input || typeof input !== "object") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Los datos de la semana son obligatorios.",
    );
  }

  return {
    startDate: normalizeDateString(input.startDate, "startDate"),
    endDate: normalizeDateString(input.endDate, "endDate"),
  };
}

function validateUpdateWeekInput(input: UpdateWeekInput): {
  startDate: string;
  endDate: string;
} {
  return validateCreateWeekInput(input);
}

function normalizeDateString(value: string, fieldName: string): string {
  if (typeof value !== "string") {
    throw new AppError("VALIDATION_ERROR", `${fieldName} debe ser texto.`);
  }

  const normalized = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${fieldName} debe estar en formato YYYY-MM-DD.`,
    );
  }

  return normalized;
}

function validateStatus(status: WeekStatus): void {
  if (status !== "draft" && status !== "active" && status !== "closed") {
    throw new AppError("VALIDATION_ERROR", `status inválido: ${status}.`);
  }
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

function mapWeekStatus(value: string): WeekStatus {
  if (value === "draft" || value === "active" || value === "closed") {
    return value;
  }

  throw new AppError(
    "DATABASE_ERROR",
    `El estado almacenado es inválido: ${value}.`,
  );
}

function mapWeek(row: WeekRow): Week {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    status: mapWeekStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWeekListItem(
  row: Pick<
    WeekRow,
    "id" | "start_date" | "end_date" | "status" | "created_at"
  >,
): WeekListItem {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    status: mapWeekStatus(row.status),
    createdAt: row.created_at,
  };
}
