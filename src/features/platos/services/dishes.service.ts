import { supabase } from "../../../lib/supabase";
import { runSupabase, runSupabaseFull, runSupabaseOrThrow } from "../../../lib/error-handler";
import { AppError } from "../../../lib/errors";
import type { Tables, TablesUpdate } from "../../../types/database";
import type { Climate } from "../../../types/domain";
import type { CreateDishInput, Dish, UpdateDishInput } from "../types/dish";
import type { DishListItem, DishListParams, DishListResult } from "../types/dish-list";

type DishRow = Tables<"dishes">;
type DishVersionRow = Tables<"dish_versions">;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DISH_COLUMNS = "id,category,climate,active,created_at,updated_at";
const DISH_LIST_COLUMNS = "id,category,climate,active";
const DISH_VERSION_COLUMNS = "id,dish_id,version_number,name,price,created_at";

export async function listDishes(params: DishListParams = {}): Promise<DishListResult> {
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const search = normalizeSearch(params.search);
  const category = normalizeSearch(params.category);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let dishIdsFilter: string[] | undefined;

  if (search) {
    const escaped = escapeIlikePattern(search);
    const matches = await runSupabase<{ dish_id: string }[]>(() =>
      supabase.from("dish_versions").select("dish_id").ilike("name", `%${escaped}%`),
    );
    dishIdsFilter = [...new Set((matches ?? []).map((m) => m.dish_id))];
    if (dishIdsFilter.length === 0) return { items: [], total: 0, page, pageSize };
  }

  let query = supabase.from("dishes").select(DISH_LIST_COLUMNS, { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (category) query = query.ilike("category", `%${escapeIlikePattern(category)}%`);
  if (params.climate) query = query.eq("climate", params.climate);
  if (params.active !== undefined) query = query.eq("active", params.active);
  if (dishIdsFilter) query = query.in("id", dishIdsFilter);

  const dishResult = await runSupabaseFull<Pick<DishRow, "id" | "category" | "climate" | "active">[]>(() => query);
  const dishes = dishResult.data ?? [];
  const total = dishResult.count ?? 0;
  if (dishes.length === 0) return { items: [], total, page, pageSize };

  const versionsResult = await runSupabase<Pick<DishVersionRow, "dish_id" | "name" | "version_number">[]>(() =>
    supabase.from("dish_versions").select("dish_id,name,version_number").in("dish_id", dishes.map((d) => d.id)),
  );
  const latestByDish = new Map<string, { name: string; versionNumber: number }>();
  for (const v of versionsResult ?? []) {
    const current = latestByDish.get(v.dish_id);
    if (!current || v.version_number > current.versionNumber) latestByDish.set(v.dish_id, { name: v.name, versionNumber: v.version_number });
  }
  const items: DishListItem[] = dishes.map((d) => {
    const latest = latestByDish.get(d.id);
    return { id: d.id, name: latest?.name ?? null, category: d.category, climate: mapClimate(d.climate), active: d.active };
  });
  return { items, total, page, pageSize };
}

export async function getDish(dishId: string): Promise<Dish> {
  validateUuid(dishId, "dishId");
  const row = await runSupabaseOrThrow<DishRow>(() => supabase.from("dishes").select(DISH_COLUMNS).eq("id", dishId).maybeSingle());
  return mapDish(row);
}

export async function createDish(input: CreateDishInput): Promise<Dish> {
  const payload = validateCreateDishInput(input);
  const dish = await runSupabaseOrThrow<DishRow>(() => supabase.from("dishes").insert({ category: payload.category, climate: payload.climate, active: payload.active }).select(DISH_COLUMNS).single());
  try {
    await runSupabaseOrThrow<DishVersionRow>(() => supabase.from("dish_versions").insert({ dish_id: dish.id, version_number: 1, name: payload.name, price: payload.price }).select(DISH_VERSION_COLUMNS).single());
    return mapDish(dish);
  } catch (originalError) {
    try { await runSupabase<unknown>(() => supabase.from("dishes").delete().eq("id", dish.id)); } catch { /* preserve original error */ }
    throw originalError;
  }
}

export async function updateDish(dishId: string, input: UpdateDishInput): Promise<Dish> {
  validateUuid(dishId, "dishId");
  const payload = validateUpdateDishInput(input);
  if (Object.keys(payload).length === 0) throw new AppError("VALIDATION_ERROR", "Debe indicarse al menos un campo para actualizar.");
  const row = await runSupabaseOrThrow<DishRow>(() => supabase.from("dishes").update(payload).eq("id", dishId).select(DISH_COLUMNS).single());
  return mapDish(row);
}

export async function setDishActive(dishId: string, active: boolean): Promise<Dish> {
  validateUuid(dishId, "dishId");
  if (typeof active !== "boolean") throw new AppError("VALIDATION_ERROR", "El estado activo debe ser booleano.");
  const row = await runSupabaseOrThrow<DishRow>(() => supabase.from("dishes").update({ active }).eq("id", dishId).select(DISH_COLUMNS).single());
  return mapDish(row);
}

export async function deleteDish(dishId: string): Promise<void> {
  validateUuid(dishId, "dishId");
  await runSupabase<unknown>(() => supabase.from("dishes").delete().eq("id", dishId));
}

function validateCreateDishInput(input: CreateDishInput): { name: string; price: number; category: string | null; climate: Climate | null; active: boolean } {
  if (!input || typeof input !== "object") throw new AppError("VALIDATION_ERROR", "Los datos del plato son obligatorios.");
  return { name: normalizeRequiredString(input.name, "name"), price: normalizePrice(input.price), category: normalizeNullableString(input.category), climate: normalizeClimate(input.climate), active: input.active ?? true };
}
function validateUpdateDishInput(input: UpdateDishInput): TablesUpdate<"dishes"> {
  if (!input || typeof input !== "object") throw new AppError("VALIDATION_ERROR", "Los datos a actualizar son obligatorios.");
  const payload: TablesUpdate<"dishes"> = {};
  if (input.category !== undefined) payload.category = normalizeNullableString(input.category);
  if (input.climate !== undefined) payload.climate = normalizeClimate(input.climate);
  return payload;
}
function normalizeRequiredString(value: string, fieldName: string): string { if (typeof value !== "string") throw new AppError("VALIDATION_ERROR", `${fieldName} debe ser texto.`); const normalized = value.trim(); if (!normalized) throw new AppError("VALIDATION_ERROR", `${fieldName} no puede estar vacío.`); return normalized; }
function normalizeNullableString(value: string | null | undefined): string | null { if (value === undefined || value === null) return null; if (typeof value !== "string") throw new AppError("VALIDATION_ERROR", "El valor debe ser texto o null."); return value.trim() || null; }
function normalizeClimate(value: Climate | null | undefined): Climate | null { if (value === undefined || value === null) return null; if (value !== "frio" && value !== "templado" && value !== "calor") throw new AppError("VALIDATION_ERROR", "El clima debe ser frio, templado, calor o null."); return value; }
function normalizePrice(value: number): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new AppError("VALIDATION_ERROR", "El precio debe ser un número mayor o igual a 0."); return value; }
function normalizeSearch(value: string | undefined): string | undefined { if (value === undefined) return undefined; if (typeof value !== "string") throw new AppError("VALIDATION_ERROR", "La búsqueda debe ser texto."); return value.trim() || undefined; }
function normalizePage(value: number | undefined): number { if (value === undefined) return DEFAULT_PAGE; if (!Number.isInteger(value) || value < 1) throw new AppError("VALIDATION_ERROR", "page debe ser un entero mayor o igual a 1."); return value; }
function normalizePageSize(value: number | undefined): number { if (value === undefined) return DEFAULT_PAGE_SIZE; if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) throw new AppError("VALIDATION_ERROR", `pageSize debe ser un entero entre 1 y ${MAX_PAGE_SIZE}.`); return value; }
function validateUuid(value: string, fieldName: string): void { if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new AppError("VALIDATION_ERROR", `${fieldName} debe ser un UUID válido.`); }
function escapeIlikePattern(value: string): string { return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_"); }
function mapClimate(value: string | null): Climate | null { return value === "frio" || value === "templado" || value === "calor" ? value : null; }
function mapDish(row: DishRow): Dish { return { id: row.id, category: row.category, climate: mapClimate(row.climate), active: row.active, createdAt: row.created_at, updatedAt: row.updated_at }; }
