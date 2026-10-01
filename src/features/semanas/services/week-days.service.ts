import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import { runSupabase, runSupabaseOrThrow } from "../../../lib/error-handler";
import { AppError } from "../../../lib/errors";
import type { Database, Tables } from "../../../types/database";
import type { DayOfWeek } from "../../../types/domain";
import type { WeekDay } from "../types/week-day";

type WeekDayRow = Tables<"week_days">;

const WEEK_DAY_COLUMNS = "id,week_id,day_of_week,date,created_at";

/**
 * No existe createWeekDay / updateWeekDay / deleteWeekDay.
 *
 * Los días de una semana se manejan exclusivamente a través de
 * los RPC create_week y update_week. El admin opera sobre las
 * opciones de oferta, no sobre los días en sí.
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
    createdAt: row.created_at,
  };
}
