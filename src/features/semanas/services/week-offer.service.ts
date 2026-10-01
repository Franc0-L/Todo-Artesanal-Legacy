import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import { runSupabase, runSupabaseOrThrow } from "../../../lib/error-handler";
import { AppError } from "../../../lib/errors";
import type { Database } from "../../../types/database";
import type { OptionType } from "../../../types/domain";
import type { DishVersion } from "../../platos/types/dish-version";
import type { MenuVersionSummary } from "../../menus/types/menu-version";
import type {
  AddDayOptionInput,
  OfferModality,
  UpdateDayOptionInput,
  WeekDayOption,
  WeekOffer,
  WeekOfferDay,
} from "../types/week-offer";
import { listWeekDays } from "./week-days.service";

interface WeekDayOptionWithRefs {
  id: string;
  week_day_id: string;
  offer_modality: string;
  option_type: string;
  created_at: string;
  dish_versions: {
    id: string; dish_id: string; version_number: number; name: string; price: number; created_at: string;
  } | null;
  menu_versions: {
    id: string; menu_id: string; version_number: number; name: string; price: number; created_at: string;
  } | null;
}

const WEEK_DAY_OPTION_WITH_REFS_SELECT = `
  id,
  week_day_id,
  offer_modality,
  option_type,
  created_at,
  dish_versions ( id, dish_id, version_number, name, price, created_at ),
  menu_versions ( id, menu_id, version_number, name, price, created_at )
`;

/**
 * Lista las opciones (General / Opcional) de un día.
 *
 * `client` permite reutilizar la consulta desde `/menu/:token` con el
 * JWT de cliente: la policy `week_day_options_client_select_active` ya
 * limita al cliente a la oferta de la semana activa.
 */
export async function listDayOptions(
  weekDayId: string,
  client: SupabaseClient<Database> = supabase,
): Promise<WeekDayOption[]> {
  validateUuid(weekDayId, "weekDayId");
  const result = await runSupabase<WeekDayOptionWithRefs[]>(() =>
    client.from("week_day_options").select(WEEK_DAY_OPTION_WITH_REFS_SELECT).eq("week_day_id", weekDayId),
  );
  return (result ?? []).map(mapWeekDayOption);
}

/**
 * Devuelve la oferta completa de una semana (todos los días con sus
 * opciones). Igual que `getActiveWeek`, acepta un cliente Supabase propio
 * para poder correr desde el área de cliente (`/menu/:token`); RLS es
 * quien decide qué filas ve cada rol.
 */
export async function getWeekOffer(
  weekId: string,
  client: SupabaseClient<Database> = supabase,
): Promise<WeekOffer> {
  validateUuid(weekId, "weekId");
  const days = await listWeekDays(weekId, client);
  if (days.length === 0) return { weekId, days: [] };

  const optionsResult = await runSupabase<WeekDayOptionWithRefs[]>(() =>
    client.from("week_day_options").select(WEEK_DAY_OPTION_WITH_REFS_SELECT).in("week_day_id", days.map((d) => d.id)),
  );

  const optionsByDay = new Map<string, WeekDayOption[]>();
  for (const row of optionsResult ?? []) {
    const option = mapWeekDayOption(row);
    const current = optionsByDay.get(option.weekDayId) ?? [];
    current.push(option);
    optionsByDay.set(option.weekDayId, current);
  }

  const weekDays: WeekOfferDay[] = days.map((day) => ({
    weekDay: day,
    options: optionsByDay.get(day.id) ?? [],
  }));
  return { weekId, days: weekDays };
}

export async function addDayOption(input: AddDayOptionInput): Promise<WeekDayOption> {
  const payload = await validateAddDayOptionInput(input);
  const result = await runSupabaseOrThrow<WeekDayOptionWithRefs>(() =>
    supabase.from("week_day_options").insert(payload as never).select(WEEK_DAY_OPTION_WITH_REFS_SELECT).single(),
  );
  return mapWeekDayOption(result);
}

export async function updateDayOption(optionId: string, input: UpdateDayOptionInput): Promise<WeekDayOption> {
  validateUuid(optionId, "optionId");
  const payload = validateUpdateDayOptionInput(input);
  const result = await runSupabaseOrThrow<WeekDayOptionWithRefs>(() =>
    supabase.from("week_day_options").update(payload as never).eq("id", optionId).select(WEEK_DAY_OPTION_WITH_REFS_SELECT).single(),
  );
  return mapWeekDayOption(result);
}

export async function removeDayOption(optionId: string): Promise<void> {
  validateUuid(optionId, "optionId");
  await runSupabase<unknown>(() => supabase.from("week_day_options").delete().eq("id", optionId));
}

async function validateAddDayOptionInput(input: AddDayOptionInput): Promise<{
  week_day_id: string;
  offer_modality: OfferModality;
  option_type: "dish" | "menu";
  dish_version_id: string | null;
  menu_version_id: string | null;
}> {
  if (!input || typeof input !== "object") throw new AppError("VALIDATION_ERROR", "Los datos de la opción son obligatorios.");
  validateUuid(input.weekDayId, "weekDayId");

  let offerModality = input.offerModality;
  if (!offerModality) {
    const existing = await runSupabase<{ offer_modality: string }[]>(() =>
      supabase.from("week_day_options").select("offer_modality").eq("week_day_id", input.weekDayId),
    );
    const used = new Set((existing ?? []).map((row) => row.offer_modality));
    if (used.has("general") && used.has("opcional")) {
      throw new AppError("CONFLICT", "Este día ya tiene una oferta General y una Opcional.");
    }
    offerModality = used.has("general") ? "opcional" : "general";
  }
  if (offerModality !== "general" && offerModality !== "opcional") {
    throw new AppError("VALIDATION_ERROR", "La modalidad de oferta debe ser General u Opcional.");
  }

  if (input.optionType === "dish") {
    validateUuid(input.dishVersionId, "dishVersionId");
    return { week_day_id: input.weekDayId, offer_modality: offerModality, option_type: "dish", dish_version_id: input.dishVersionId, menu_version_id: null };
  }
  if (input.optionType === "menu") {
    validateUuid(input.menuVersionId, "menuVersionId");
    return { week_day_id: input.weekDayId, offer_modality: offerModality, option_type: "menu", dish_version_id: null, menu_version_id: input.menuVersionId };
  }
  throw new AppError("VALIDATION_ERROR", "optionType debe ser 'dish' o 'menu'.");
}

function validateUpdateDayOptionInput(input: UpdateDayOptionInput): {
  offer_modality: OfferModality;
  option_type: "dish" | "menu";
  dish_version_id: string | null;
  menu_version_id: string | null;
} {
  if (!input || typeof input !== "object") throw new AppError("VALIDATION_ERROR", "Los datos de la opción son obligatorios.");
  if (input.offerModality !== "general" && input.offerModality !== "opcional") throw new AppError("VALIDATION_ERROR", "La modalidad de oferta debe ser General u Opcional.");
  if (input.optionType === "dish") {
    validateUuid(input.dishVersionId, "dishVersionId");
    return { offer_modality: input.offerModality, option_type: "dish", dish_version_id: input.dishVersionId, menu_version_id: null };
  }
  if (input.optionType === "menu") {
    validateUuid(input.menuVersionId, "menuVersionId");
    return { offer_modality: input.offerModality, option_type: "menu", dish_version_id: null, menu_version_id: input.menuVersionId };
  }
  throw new AppError("VALIDATION_ERROR", "optionType debe ser 'dish' o 'menu'.");
}

function validateUuid(value: string, fieldName: string): void {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError("VALIDATION_ERROR", `${fieldName} debe ser un UUID válido.`);
  }
}

function mapOptionType(value: string): OptionType {
  if (value === "dish" || value === "menu") return value;
  throw new AppError("DATABASE_ERROR", `El tipo de opción almacenado es inválido: ${value}.`);
}

function mapOfferModality(value: string): OfferModality {
  if (value === "general" || value === "opcional") return value;
  throw new AppError("DATABASE_ERROR", `La modalidad de oferta almacenada es inválida: ${value}.`);
}

function mapDishVersionRef(row: { id: string; dish_id: string; version_number: number; name: string; price: number; created_at: string }): DishVersion {
  return { id: row.id, dishId: row.dish_id, versionNumber: row.version_number, name: row.name, price: row.price, createdAt: row.created_at };
}

function mapMenuVersionSummaryRef(row: { id: string; menu_id: string; version_number: number; name: string; price: number; created_at: string }): MenuVersionSummary {
  return { id: row.id, menuId: row.menu_id, versionNumber: row.version_number, name: row.name, price: row.price, createdAt: row.created_at };
}

function mapWeekDayOption(row: WeekDayOptionWithRefs): WeekDayOption {
  return {
    id: row.id,
    weekDayId: row.week_day_id,
    offerModality: mapOfferModality(row.offer_modality),
    optionType: mapOptionType(row.option_type),
    dishVersion: row.dish_versions ? mapDishVersionRef(row.dish_versions) : null,
    menuVersion: row.menu_versions ? mapMenuVersionSummaryRef(row.menu_versions) : null,
    createdAt: row.created_at,
  };
}
