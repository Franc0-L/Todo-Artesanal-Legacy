import { supabase } from "../../../lib/supabase";
import {
  runSupabase,
  runSupabaseFull,
  runSupabaseOrThrow,
} from "../../../lib/error-handler";
import { AppError } from "../../../lib/errors";
import type { DayOfWeek, Modality, OptionType } from "../../../types/domain";
import type { CreateOrderInput, UpdateOrderInput } from "../types/order";
import type { OrderDetail } from "../types/order-detail";
import type { OrderListParams, OrderListResult } from "../types/order-list";
import type { OrderTotals, OrderTotalsParams } from "../types/order-totals";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
/** Lote usado por `listAllOrders` para recorrer todas las páginas. */
const ALL_PAGE_SIZE = 100;

const ORDER_DETAIL_SELECT = `
  id,
  client_id,
  week_day_option_id,
  modality,
  quantity,
  applied_price,
  notes,
  created_at,
  updated_at,
  clients ( name, phone ),
  week_day_options (
    id,
    option_type,
    dish_versions ( name ),
    menu_versions ( name ),
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
  )
`;

const ORDER_TOTALS_SELECT = `
  quantity,
  applied_price,
  week_day_options (
    week_day_id,
    week_days (
      week_id
    )
  )
`;

interface OrderDetailRow {
  id: string;
  client_id: string;
  week_day_option_id: string;
  modality: string;
  quantity: number;
  applied_price: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  clients: { name: string; phone: string | null } | null;
  week_day_options: {
    id: string;
    option_type: string;
    dish_versions: { name: string } | null;
    menu_versions: { name: string } | null;
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
  } | null;
}

interface OrderTotalsRow {
  quantity: number;
  applied_price: number;
  week_day_options: {
    week_day_id: string;
    week_days: { week_id: string } | null;
  } | null;
}

export async function listOrders(
  params: OrderListParams = {},
): Promise<OrderListResult> {
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("orders")
    .select(ORDER_DETAIL_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params.clientId !== undefined) {
    validateUuid(params.clientId, "clientId");
    query = query.eq("client_id", params.clientId);
  }

  if (params.weekId !== undefined) {
    validateUuid(params.weekId, "weekId");
    query = query.filter(
      "week_day_options.week_days.week_id",
      "eq",
      params.weekId,
    );
  }

  if (params.weekDayId !== undefined) {
    validateUuid(params.weekDayId, "weekDayId");
    query = query.filter(
      "week_day_options.week_day_id",
      "eq",
      params.weekDayId,
    );
  }

  if (params.modality !== undefined) {
    validateModality(params.modality);
    query = query.eq("modality", params.modality);
  }

  const result = await runSupabaseFull<OrderDetailRow[]>(() => query);

  return {
    items: (result.data ?? []).map(mapOrderDetail),
    total: result.count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Devuelve todos los pedidos que cumplen los filtros, sin paginar.
 *
 * La sección Pedidos agrupa por cliente y necesita la lista completa para
 * subtotalizar bien: se pide por lotes usando el `total` exacto de la primera
 * consulta (mismo criterio que historical-week-detail.service.ts).
 */
export async function listAllOrders(
  params: Omit<OrderListParams, "page" | "pageSize"> = {},
): Promise<{ items: OrderDetail[]; total: number }> {
  const firstPage = await listOrders({
    ...params,
    page: 1,
    pageSize: ALL_PAGE_SIZE,
  });
  const totalPages = Math.ceil(firstPage.total / ALL_PAGE_SIZE);

  if (totalPages <= 1) {
    return { items: firstPage.items, total: firstPage.total };
  }

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      listOrders({ ...params, page: index + 2, pageSize: ALL_PAGE_SIZE }),
    ),
  );

  return {
    items: [
      firstPage.items,
      ...remainingPages.map((page) => page.items),
    ].flat(),
    total: firstPage.total,
  };
}

export async function getOrder(orderId: string): Promise<OrderDetail> {
  validateUuid(orderId, "orderId");
  const row = await runSupabaseOrThrow<OrderDetailRow>(() =>
    supabase
      .from("orders")
      .select(ORDER_DETAIL_SELECT)
      .eq("id", orderId)
      .maybeSingle(),
  );
  return mapOrderDetail(row);
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<OrderDetail> {
  const payload = validateCreateOrderInput(input);
  const row = await runSupabaseOrThrow<OrderDetailRow>(() =>
    supabase
      .from("orders")
      .insert(payload)
      .select(ORDER_DETAIL_SELECT)
      .single(),
  );
  return mapOrderDetail(row);
}

export async function updateOrder(
  orderId: string,
  input: UpdateOrderInput,
): Promise<OrderDetail> {
  validateUuid(orderId, "orderId");
  const payload = validateUpdateOrderInput(input);

  if (Object.keys(payload).length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Debe indicarse al menos un campo para actualizar.",
    );
  }

  const row = await runSupabaseOrThrow<OrderDetailRow>(() =>
    supabase
      .from("orders")
      .update(payload)
      .eq("id", orderId)
      .select(ORDER_DETAIL_SELECT)
      .single(),
  );
  return mapOrderDetail(row);
}

export async function deleteOrder(orderId: string): Promise<void> {
  validateUuid(orderId, "orderId");
  await runSupabase<unknown>(() =>
    supabase.from("orders").delete().eq("id", orderId),
  );
}

export async function getOrderTotals(
  params: OrderTotalsParams = {},
): Promise<OrderTotals> {
  let query = supabase
    .from("orders")
    .select(ORDER_TOTALS_SELECT, { count: "exact" });

  if (params.clientId !== undefined) {
    validateUuid(params.clientId, "clientId");
    query = query.eq("client_id", params.clientId);
  }

  if (params.weekId !== undefined) {
    validateUuid(params.weekId, "weekId");
    query = query.filter(
      "week_day_options.week_days.week_id",
      "eq",
      params.weekId,
    );
  }

  if (params.weekDayId !== undefined) {
    validateUuid(params.weekDayId, "weekDayId");
    query = query.filter(
      "week_day_options.week_day_id",
      "eq",
      params.weekDayId,
    );
  }

  if (params.modality !== undefined) {
    validateModality(params.modality);
    query = query.eq("modality", params.modality);
  }

  const result = await runSupabaseFull<OrderTotalsRow[]>(() => query);
  const rows = result.data ?? [];

  let totalQuantity = 0;
  let totalAmount = 0;
  for (const row of rows) {
    totalQuantity += row.quantity;
    totalAmount += row.quantity * row.applied_price;
  }

  totalAmount = Math.round(totalAmount * 100) / 100;

  return {
    orderCount: result.count ?? 0,
    totalQuantity,
    totalAmount,
  };
}

function validateCreateOrderInput(input: CreateOrderInput): {
  client_id: string;
  week_day_option_id: string;
  modality: string;
  quantity: number;
  applied_price: number;
  notes: string | null;
} {
  if (!input || typeof input !== "object") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Los datos del pedido son obligatorios.",
    );
  }

  validateUuid(input.clientId, "clientId");
  validateUuid(input.weekDayOptionId, "weekDayOptionId");
  validateModality(input.modality);
  validateQuantity(input.quantity);

  return {
    client_id: input.clientId,
    week_day_option_id: input.weekDayOptionId,
    modality: input.modality,
    quantity: input.quantity,
    applied_price: 0,
    notes: normalizeNullableString(input.notes),
  };
}

function validateUpdateOrderInput(input: UpdateOrderInput): {
  quantity?: number;
  notes?: string | null;
} {
  if (!input || typeof input !== "object") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Los datos a actualizar son obligatorios.",
    );
  }

  const payload: { quantity?: number; notes?: string | null } = {};
  if (input.quantity !== undefined) {
    validateQuantity(input.quantity);
    payload.quantity = input.quantity;
  }
  if (input.notes !== undefined) {
    payload.notes = normalizeNullableString(input.notes);
  }
  return payload;
}

function validateModality(value: Modality): void {
  if (value !== "general" && value !== "opcional" && value !== "media_vianda") {
    throw new AppError("VALIDATION_ERROR", `Modalidad inválida: ${value}.`);
  }
}

function validateQuantity(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      "quantity debe ser un entero mayor o igual a 1.",
    );
  }
}

function normalizeNullableString(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new AppError("VALIDATION_ERROR", "El valor debe ser texto o null.");
  }
  const normalized = value.trim();
  return normalized || null;
}

function normalizePage(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PAGE;
  if (!Number.isInteger(value) || value < 1) {
    throw new AppError(
      "VALIDATION_ERROR",
      "page debe ser un entero mayor o igual a 1.",
    );
  }
  return value;
}

function normalizePageSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
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

function mapModality(value: string): Modality {
  if (value === "general" || value === "opcional" || value === "media_vianda")
    return value;
  throw new AppError(
    "DATABASE_ERROR",
    `La modalidad almacenada es inválida: ${value}.`,
  );
}

function mapOptionType(value: string): OptionType {
  if (value === "dish" || value === "menu") return value;
  throw new AppError(
    "DATABASE_ERROR",
    `El tipo de opción almacenado es inválido: ${value}.`,
  );
}

function mapDayOfWeek(value: number): DayOfWeek {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5)
    return value;
  throw new AppError(
    "DATABASE_ERROR",
    `El día de la semana almacenado es inválido: ${value}.`,
  );
}

function mapOrderDetail(row: OrderDetailRow): OrderDetail {
  const wdo = row.week_day_options;
  const wd = wdo?.week_days ?? null;
  const week = wd?.weeks ?? null;

  let optionName: string | null = null;
  if (wdo) {
    if (wdo.option_type === "dish")
      optionName = wdo.dish_versions?.name ?? null;
    else if (wdo.option_type === "menu")
      optionName = wdo.menu_versions?.name ?? null;
  }

  return {
    id: row.id,
    clientId: row.client_id,
    weekDayOptionId: row.week_day_option_id,
    modality: mapModality(row.modality),
    quantity: row.quantity,
    appliedPrice: row.applied_price,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    client: row.clients
      ? { name: row.clients.name, phone: row.clients.phone }
      : null,
    weekDay: wd
      ? { id: wd.id, date: wd.date, dayOfWeek: mapDayOfWeek(wd.day_of_week) }
      : null,
    week: week
      ? { id: week.id, startDate: week.start_date, endDate: week.end_date }
      : null,
    option: wdo
      ? { id: wdo.id, type: mapOptionType(wdo.option_type), name: optionName }
      : null,
  };
}
