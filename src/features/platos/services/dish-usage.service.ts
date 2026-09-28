import { supabase } from "../../../lib/supabase";
import { runSupabase } from "../../../lib/error-handler";
import { AppError } from "../../../lib/errors";
import type { Climate } from "../../../types/domain";
import type {
  DishSuggestionItem,
  DishSuggestionParams,
  DishUsage,
  DishUsageParams,
  RecentDishUsageItem,
  RecentDishUsageParams,
} from "../types/dish-usage";

interface DishVersionWithOptions {
  id: string;
  dish_id: string;
  week_day_options:
    | {
        id: string;
        week_days: { date: string } | null;
      }[]
    | null;
}

interface WeekDayOptionWithRefs {
  id: string;
  week_days: { date: string } | null;
  dish_versions: { dish_id: string } | null;
}

/**
 * Obtiene información agregada de uso de un plato.
 *
 * "Uso" = cantidad de días únicos en los que el plato fue
 * ofrecido directamente en la oferta (week_day_options con
 * option_type='dish').
 *
 * Se cuentan días únicos, no apariciones: si el mismo plato
 * (o distintas versiones del mismo plato) aparece en varias
 * opciones del mismo día, ese día cuenta una sola vez.
 *
 * TODO: no cuenta usos indirectos (plato dentro de un menú
 * ofrecido). Si en el futuro hace falta, migrar a una vista o
 * RPC que unifique ambos casos.
 *
 * TODO: para catálogos grandes, migrar a una vista o RPC con
 * agregación en PostgreSQL.
 */
export async function getDishUsage(
  dishId: string,
  params: DishUsageParams = {},
): Promise<DishUsage> {
  validateUuid(dishId, "dishId");

  const versions = await runSupabase<DishVersionWithOptions[]>(() =>
    supabase
      .from("dish_versions")
      .select(
        `
          id,
          dish_id,
          week_day_options (
            id,
            week_days ( date )
          )
        `,
      )
      .eq("dish_id", dishId),
  );

  const datesUsed = new Set<string>();

  for (const version of versions ?? []) {
    for (const option of version.week_day_options ?? []) {
      const date = option.week_days?.date ?? null;

      if (!date) continue;

      if (params.fromDate && date < params.fromDate) continue;
      if (params.toDate && date > params.toDate) continue;

      datesUsed.add(date);
    }
  }

  const sortedDates = [...datesUsed].sort();
  const lastUsedAt =
    sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;

  return {
    dishId,
    totalUses: datesUsed.size,
    lastUsedAt,
  };
}

/**
 * Devuelve los platos usados recientemente en la oferta,
 * ordenados por fecha descendente.
 *
 * Cuenta días únicos por plato: si el mismo plato aparece
 * en varias opciones del mismo día, ese día cuenta una sola
 * vez.
 *
 * El `limit` recorta la lista de platos devuelta, no las
 * filas leídas: el índice completo se resuelve en
 * `collectDishUsage`.
 *
 * TODO: si el volumen de week_day_options crece, migrar a
 * vista o RPC con agregación en PostgreSQL.
 */
export async function getRecentDishUsage(
  params: RecentDishUsageParams = {},
): Promise<RecentDishUsageItem[]> {
  const limit = normalizeLimit(params.limit);
  const items = await collectDishUsage(params.sinceDate);

  return items.slice(0, limit);
}

/**
 * Construye el índice de uso por plato sobre todas las
 * opciones de día registradas, sin límite de cantidad.
 *
 * Lo comparten `getRecentDishUsage`, que lo recorta al
 * `limit` público, y `getDishSuggestions`, que necesita el
 * histórico completo para puntuar sugerencias. Por eso no
 * valida `limit`: no es una función pública del servicio y
 * el tope real de filas lo pone PostgREST (`max_rows`).
 */
async function collectDishUsage(
  sinceDate?: string,
): Promise<RecentDishUsageItem[]> {
  const result = await runSupabase<WeekDayOptionWithRefs[]>(() =>
    supabase
      .from("week_day_options")
      .select(
        `
          id,
          week_days ( date ),
          dish_versions ( dish_id )
        `,
      )
      .eq("option_type", "dish"),
  );

  // dishId → Set<date>  (días únicos por plato)
  const datesByDish = new Map<string, Set<string>>();

  for (const row of result ?? []) {
    const dishId = row.dish_versions?.dish_id;
    const date = row.week_days?.date;

    if (!dishId || !date) continue;
    if (sinceDate && date < sinceDate) continue;

    let dates = datesByDish.get(dishId);

    if (!dates) {
      dates = new Set<string>();
      datesByDish.set(dishId, dates);
    }

    dates.add(date);
  }

  const items: RecentDishUsageItem[] = [];

  for (const [dishId, dates] of datesByDish) {
    const sorted = [...dates].sort();
    const lastUsedAt = sorted[sorted.length - 1];

    items.push({
      dishId,
      uses: dates.size,
      lastUsedAt,
    });
  }

  return items.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}

/**
 * Devuelve platos candidatos para sugerir como oferta.
 *
 * Reglas actuales:
 *  - solo platos activos;
 *  - si se pasa climate, filtra por ese clima;
 *  - si excludeRecentlyUsed=true, excluye los platos usados
 *    en el histórico completo (tope de filas de PostgREST).
 *
 * NO implementa un algoritmo de scoring. La sugerencia es un
 * filtro + orden por fecha de último uso descendente.
 *
 * Si en el futuro se necesita scoring por clima + uso reciente,
 * definir la regla primero y migrar a una vista o RPC.
 */
export async function getDishSuggestions(
  params: DishSuggestionParams = {},
): Promise<DishSuggestionItem[]> {
  const limit = normalizeLimit(params.limit);

  let dishesQuery = supabase
    .from("dishes")
    .select("id, climate")
    .eq("active", true);

  if (params.climate) {
    dishesQuery = dishesQuery.eq("climate", params.climate);
  }

  const [dishesResult, usageResult] = await Promise.all([
    runSupabase<{ id: string; climate: string | null }[]>(() => dishesQuery),
    collectDishUsage(),
  ]);

  const dishes = dishesResult ?? [];

  if (dishes.length === 0) {
    return [];
  }

  const usageByDish = new Map(usageResult.map((u) => [u.dishId, u]));

  const candidates = params.excludeRecentlyUsed
    ? dishes.filter((d) => !usageByDish.has(d.id))
    : dishes;

  if (candidates.length === 0) {
    return [];
  }

  const candidateIds = candidates.map((d) => d.id);

  const versions = await runSupabase<
    { dish_id: string; name: string; version_number: number }[]
  >(() =>
    supabase
      .from("dish_versions")
      .select("dish_id,name,version_number")
      .in("dish_id", candidateIds),
  );

  const latestNameByDish = new Map<string, string>();
  const latestVersionByDish = new Map<string, number>();

  for (const v of versions ?? []) {
    const currentVersion = latestVersionByDish.get(v.dish_id);

    if (currentVersion === undefined || v.version_number > currentVersion) {
      latestVersionByDish.set(v.dish_id, v.version_number);
      latestNameByDish.set(v.dish_id, v.name);
    }
  }

  return candidates.slice(0, limit).map((dish) => {
    const usage = usageByDish.get(dish.id);

    return {
      dishId: dish.id,
      name: latestNameByDish.get(dish.id) ?? "",
      climate: mapClimate(dish.climate),
      uses: usage?.uses ?? 0,
      lastUsedAt: usage?.lastUsedAt ?? null,
    };
  });
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) {
    return 20;
  }

  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new AppError(
      "VALIDATION_ERROR",
      "limit debe ser un entero entre 1 y 100.",
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

function mapClimate(value: string | null): Climate | null {
  if (value === "frio" || value === "templado" || value === "calor") {
    return value;
  }

  return null;
}
