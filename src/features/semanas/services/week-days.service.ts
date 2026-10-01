import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import { runSupabase, runSupabaseOrThrow } from "../../../lib/error-handler";
import { AppError } from "../../../lib/errors";
import type { Database, Tables } from "../../../types/database";
import type { DayOfWeek } from "../../../types/domain";
import type { WeekDay } from "../types/week-day";

type WeekDayRow = Tables<"week_days">;

const WEEK_DAY_COLUMNS = "id,week_id,day_of_week,date,cutoff_at,created_at";

/**
 * Los días de una semana se CREAN exclusivamente a través de los RPC
 * create_week y update_week (el admin configura la oferta, no los días).
 *
 * La única edición permitida es `updateWeekDayCutoff`: mover el corte
 * de horario es configuración operativa, no estructural — no recrea
 * días ni toca opciones, y el admin puede hacerlo incluso con la
 * semana activa. En semanas cerradas lo rechaza el trigger de
 * protección (`week_days_closed_protection`).
 */
export async function listWeekDays(
  weekId: string,
  client: SupabaseClient<Database> = supabase,
): Promise<WeekDay[]> {
  validateUuid(weekId, "weekId");

  const result = await runSupabase<WeekDayRow[]>(() =>
    client
      .from("week_days")
      .select(WEEK_DAY_COLUMNS)
      .eq("week_id", weekId)
      .order("day_of_week", { ascending: true }),
  );

  return (result ?? []).map(mapWeekDay);
}

export async function getWeekDay(
  weekDayId: string,
  client: SupabaseClient<Database> = supabase,
): Promise<WeekDay> {
  validateUuid(weekDayId, "weekDayId");

  const row = await runSupabaseOrThrow<WeekDayRow>(() =>
    client
      .from("week_days")
      .select(WEEK_DAY_COLUMNS)
      .eq("id", weekDayId)
      .maybeSingle(),
  );

  return mapWeekDay(row);
}

/**
 * Actualiza el corte de horario (`cutoff_at`) de un día.
 *
 * Única edición de días desde el frontend: no recrea la semana ni
 * cascadea opciones. `cutoffAt` es un ISO con offset (acepta también
 * el valor de un input `datetime-local`, que se interpreta en hora
 * local). En semanas cerradas el trigger de protección rechaza con
 * BUSINESS_RULE.
 */
export async function updateWeekDayCutoff(
  weekDayId: string,
  cutoffAt: string,
): Promise<void> {
  validateUuid(weekDayId, "weekDayId");
  if (Number.isNaN(Date.parse(cutoffAt))) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La fecha y hora de corte son obligatorias.",
    );
  }

  await runSupabaseOrThrow<Pick<WeekDayRow, "id">>(() =>
    supabase
      .from("week_days")
      .update({ cutoff_at: cutoffAt })
      .eq("id", weekDayId)
      .select("id")
      .single(),
  );
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
    `El día almacenado es inválido: ${value}.`,
  );
}

function mapWeekDay(row: WeekDayRow): WeekDay {
  return {
    id: row.id,
    weekId: row.week_id,
    dayOfWeek: mapDayOfWeek(row.day_of_week),
    date: row.date,
    cutoffAt: row.cutoff_at,
    createdAt: row.created_at,
  };
}
