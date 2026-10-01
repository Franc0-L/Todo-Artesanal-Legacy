import { supabase } from "../../../lib/supabase";
import { runSupabase, runSupabaseFull } from "../../../lib/error-handler";
import { AppError } from "../../../lib/errors";
import type {
  DayOfWeek,
  Modality,
  OptionType,
  WeekStatus,
} from "../../../types/domain";
import type { OrderDetail } from "../../pedidos/types/order-detail";
import type { Cancellation } from "../../cancelaciones/types/cancellation";
import type {
  HistoricalWeek,
  HistoricalWeekListResult,
  HistoricalWeekParams,
} from "../types/historical-week";
import type {
  ClientHistoryEntry,
  ClientHistoryParams,
  ClientHistoryResult,
} from "../types/client-history";
import type {
  UnansweredClient,
  UnansweredClientsParams,
  UnansweredClientsResult,
} from "../types/unanswered";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// =========================================================
// ROW TYPES
// =========================================================

interface WeekRow {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
}

interface OrderAggRow {
  id: string;
  client_id: string;
  quantity: number;
  applied_price: number;
  week_days: { week_id: string } | null;
}

interface CancellationAggRow {
  id: string;
  client_id: string;
  week_days: { week_id: string } | null;
}

interface ExpectedAggRow {
  week_id: string;
  client_id: string;
}

interface ClientOrderRow {
  id: string;
  client_id: string;
  week_day_option_id: string | null;
  week_day_id: string;
  dish_version_id: string | null;
  menu_version_id: string | null;
  modality: string;
  quantity: number;
  applied_price: number;
  notes: string | null;
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
      status: string;
    } | null;
  } | null;
  dish_versions: { name: string } | null;
  menu_versions: { name: string } | null;
  week_day_options: {
    id: string;
    option_type: string;
    dish_versions: { name: string } | null;
    menu_versions: { name: string } | null;
  } | null;
}

interface ClientCancellationRow {
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
      status: string;
    } | null;
  } | null;
}

interface ExpectedWithClientRow {
  client_id: string;
  clients: { name: string; phone: string | null } | null;
}

// =========================================================
// SELECTS
// =========================================================

const WEEK_COLUMNS = "id,start_date,end_date,status,created_at";

const CLIENT_ORDER_SELECT = `
  id,
  client_id,
  week_day_option_id,
  week_day_id,
  dish_version_id,
  menu_version_id,
  modality,
  quantity,
  applied_price,
  notes,
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
      end_date,
      status
    )
  ),
  dish_versions ( name ),
  menu_versions ( name ),
  week_day_options (
    id,
    option_type,
    dish_versions ( name ),
    menu_versions ( name )
  )
`;

const CLIENT_CANCELLATION_SELECT = `
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
      end_date,
      status
    )
  )
`;

// =========================================================
// 1. LIST HISTORICAL WEEKS
// =========================================================

/**
 * Lista semanas cerradas con agregados.
 *
 * Solo incluye semanas con status='closed'. Para consultar la
 * semana activa, usar getActiveWeek de weeks.service.ts.
 *
 * Agregados:
 *  - orderCount, totalQuantity, totalAmount (de orders)
 *  - cancellationCount (de cancellations)
 *  - expectedClientCount, unansweredClientCount
 *    (de week_expected_clients menos quienes respondieron)
 *
 * Los agregados se computan en cliente. TODO: migrar a vista o
 * RPC cuando el volumen crezca.
 */
export async function listHistoricalWeeks(
  params: HistoricalWeekParams = {},
): Promise<HistoricalWeekListResult> {
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const fromDate = normalizeDateParam(params.fromDate, "fromDate");
  const toDate = normalizeDateParam(params.toDate, "toDate");

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("weeks")
    .select(WEEK_COLUMNS, { count: "exact" })
    .eq("status", "closed")
    .order("start_date", { ascending: false })
    .range(from, to);

  if (fromDate) {
    query = query.gte("start_date", fromDate);
  }

  if (toDate) {
    query = query.lte("end_date", toDate);
  }

  const weeksResult = await runSupabaseFull<WeekRow[]>(() => query);

  const weeks = weeksResult.data ?? [];
  const total = weeksResult.count ?? 0;

  if (weeks.length === 0) {
    return { items: [], total, page, pageSize };
  }

  const weekIds = weeks.map((w) => w.id);

  const [ordersResult, cancellationsResult, expectedResult] = await Promise.all(
    [
      runSupabase<OrderAggRow[]>(() =>
        supabase
          .from("orders")
          .select("id,client_id,quantity,applied_price,week_days ( week_id )")
          .filter("week_days.week_id", "in", `(${weekIds.join(",")})`),
      ),
      runSupabase<CancellationAggRow[]>(() =>
        supabase
          .from("cancellations")
          .select("id,client_id,week_days ( week_id )")
          .filter("week_days.week_id", "in", `(${weekIds.join(",")})`),
      ),
      runSupabase<ExpectedAggRow[]>(() =>
        supabase
          .from("week_expected_clients")
          .select("week_id,client_id")
          .in("week_id", weekIds),
      ),
    ],
  );

  const aggByWeek = new Map<
    string,
    {
      orderCount: number;
      totalQuantity: number;
      totalAmount: number;
      cancellationCount: number;
      expectedClients: Set<string>;
      respondingClients: Set<string>;
    }
  >();

  for (const weekId of weekIds) {
    aggByWeek.set(weekId, {
      orderCount: 0,
      totalQuantity: 0,
      totalAmount: 0,
      cancellationCount: 0,
      expectedClients: new Set(),
      respondingClients: new Set(),
    });
  }

  for (const o of ordersResult ?? []) {
    const wid = o.week_days?.week_id;
    if (!wid) continue;

    const agg = aggByWeek.get(wid);
    if (!agg) continue;

    agg.orderCount += 1;
    agg.totalQuantity += o.quantity;
    agg.totalAmount += o.quantity * o.applied_price;
    agg.respondingClients.add(o.client_id);
  }

  for (const c of cancellationsResult ?? []) {
    const wid = c.week_days?.week_id;
    if (!wid) continue;

    const agg = aggByWeek.get(wid);
    if (!agg) continue;

    agg.cancellationCount += 1;
    agg.respondingClients.add(c.client_id);
  }

  for (const e of expectedResult ?? []) {
    const agg = aggByWeek.get(e.week_id);
    if (!agg) continue;

    agg.expectedClients.add(e.client_id);
  }

  const items: HistoricalWeek[] = weeks.map((row) => {
    const agg = aggByWeek.get(row.id);

    if (!agg) {
      return {
        id: row.id,
        startDate: row.start_date,
        endDate: row.end_date,
        createdAt: row.created_at,
        orderCount: 0,
        totalQuantity: 0,
        totalAmount: 0,
        cancellationCount: 0,
        expectedClientCount: 0,
        unansweredClientCount: 0,
      };
    }

    let unansweredCount = 0;
    for (const clientId of agg.expectedClients) {
      if (!agg.respondingClients.has(clientId)) {
        unansweredCount += 1;
      }
    }

    return {
      id: row.id,
      startDate: row.start_date,
      endDate: row.end_date,
      createdAt: row.created_at,
      orderCount: agg.orderCount,
      totalQuantity: agg.totalQuantity,
      totalAmount: round2(agg.totalAmount),
      cancellationCount: agg.cancellationCount,
      expectedClientCount: agg.expectedClients.size,
      unansweredClientCount: unansweredCount,
    };
  });

  return { items, total, page, pageSize };
}

// =========================================================
// 2. GET CLIENT HISTORY
// =========================================================

/**
 * Historial completo de un cliente, agrupado por semana.
 *
 * Trae todos los pedidos y cancelaciones del cliente y los
 * agrupa por semana. Ordena por fecha de inicio de semana
 * descendente. La paginación se aplica a las semanas, no a los
 * pedidos.
 *
 * Los filtros fromDate/toDate aplican sobre las semanas:
 *  - fromDate: solo semanas con start_date >= fromDate
 *  - toDate: solo semanas con end_date <= toDate
 */
export async function getClientHistory(
  clientId: string,
  params: ClientHistoryParams = {},
): Promise<ClientHistoryResult> {
  validateUuid(clientId, "clientId");

  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const fromDate = normalizeDateParam(params.fromDate, "fromDate");
  const toDate = normalizeDateParam(params.toDate, "toDate");

  const [ordersResult, cancellationsResult] = await Promise.all([
    runSupabase<ClientOrderRow[]>(() =>
      supabase
        .from("orders")
        .select(CLIENT_ORDER_SELECT)
        .eq("client_id", clientId),
    ),
    runSupabase<ClientCancellationRow[]>(() =>
      supabase
        .from("cancellations")
        .select(CLIENT_CANCELLATION_SELECT)
        .eq("client_id", clientId),
    ),
  ]);

  type WeekBucket = {
    week: {
      id: string;
      startDate: string;
      endDate: string;
      status: WeekStatus;
    };
    orders: OrderDetail[];
    cancellations: Cancellation[];
  };

  const weekMap = new Map<string, WeekBucket>();

  for (const o of ordersResult ?? []) {
    const wd = o.week_days;
    const week = wd?.weeks;
    if (!week) continue;

    let bucket = weekMap.get(week.id);
    if (!bucket) {
      bucket = {
        week: {
          id: week.id,
          startDate: week.start_date,
          endDate: week.end_date,
          status: mapWeekStatus(week.status),
        },
        orders: [],
        cancellations: [],
      };
      weekMap.set(week.id, bucket);
    }

    bucket.orders.push(mapHistoryOrderDetail(o));
  }

  for (const c of cancellationsResult ?? []) {
    const wd = c.week_days;
    const week = wd?.weeks;
    if (!week) continue;

    let bucket = weekMap.get(week.id);
    if (!bucket) {
      bucket = {
        week: {
          id: week.id,
          startDate: week.start_date,
          endDate: week.end_date,
          status: mapWeekStatus(week.status),
        },
        orders: [],
        cancellations: [],
      };
      weekMap.set(week.id, bucket);
    }

    bucket.cancellations.push(mapHistoryCancellation(c));
  }

  let allEntries = [...weekMap.values()];

  if (fromDate) {
    allEntries = allEntries.filter((e) => e.week.startDate >= fromDate);
  }

  if (toDate) {
    allEntries = allEntries.filter((e) => e.week.endDate <= toDate);
  }

  allEntries.sort((a, b) => b.week.startDate.localeCompare(a.week.startDate));

  const total = allEntries.length;
  const from = (page - 1) * pageSize;
  const to = from + pageSize;
  const paginated = allEntries.slice(from, to);

  const entries: ClientHistoryEntry[] = paginated.map((bucket) => {
    let totalAmount = 0;

    for (const o of bucket.orders) {
      totalAmount += o.quantity * o.appliedPrice;
    }

    return {
      week: bucket.week,
      orders: bucket.orders,
      cancellations: bucket.cancellations,
      totalAmount: round2(totalAmount),
    };
  });

  return {
    clientId,
    entries,
    total,
    page,
    pageSize,
  };
}

// =========================================================
// 3. GET UNANSWERED CLIENTS
// =========================================================

/**
 * Clientes esperados de una semana que no registraron ni
 * pedido ni cancelación.
 *
 * Punto de partida: week_expected_clients (población congelada
 * al activar la semana). NO se usa clients.active actual
 * (invariante #13).
 *
 * No filtra por el status de la semana. Se puede llamar tanto
 * sobre una semana active (para ver quién falta responder)
 * como sobre una closed (histórico).
 */
export async function getUnansweredClients(
  weekId: string,
  params: UnansweredClientsParams = {},
): Promise<UnansweredClientsResult> {
  validateUuid(weekId, "weekId");

  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);

  const [expectedResult, ordersResult, cancellationsResult] = await Promise.all(
    [
      runSupabase<ExpectedWithClientRow[]>(() =>
        supabase
          .from("week_expected_clients")
          .select("client_id,clients ( name, phone )")
          .eq("week_id", weekId),
      ),
      runSupabase<{ client_id: string }[]>(() =>
        supabase
          .from("orders")
          .select("client_id")
          .filter("week_days.week_id", "eq", weekId),
      ),
      runSupabase<{ client_id: string }[]>(() =>
        supabase
          .from("cancellations")
          .select("client_id")
          .filter("week_days.week_id", "eq", weekId),
      ),
    ],
  );

  const responding = new Set<string>();

  for (const o of ordersResult ?? []) {
    responding.add(o.client_id);
  }

  for (const c of cancellationsResult ?? []) {
    responding.add(c.client_id);
  }

  const unanswered = (expectedResult ?? []).filter(
    (e) => !responding.has(e.client_id),
  );

  const total = unanswered.length;
  const from = (page - 1) * pageSize;
  const to = from + pageSize;
  const paginated = unanswered.slice(from, to);

  const items: UnansweredClient[] = paginated.map((row) => ({
    clientId: row.client_id,
    client: row.clients
      ? { name: row.clients.name, phone: row.clients.phone }
      : null,
  }));

  return { items, total, page, pageSize };
}

// =========================================================
// HELPERS
// =========================================================

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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

function normalizeDateParam(
  value: string | undefined,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

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
    `El estado de semana almacenado es inválido: ${value}.`,
  );
}

function mapModality(value: string): Modality {
  if (value === "general" || value === "opcional" || value === "media_vianda") {
    return value;
  }

  throw new AppError(
    "DATABASE_ERROR",
    `La modalidad almacenada es inválida: ${value}.`,
  );
}

function mapOptionType(value: string): OptionType {
  if (value === "dish" || value === "menu") {
    return value;
  }

  throw new AppError(
    "DATABASE_ERROR",
    `El tipo de opción almacenado es inválido: ${value}.`,
  );
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

function mapHistoryOrderDetail(row: ClientOrderRow): OrderDetail {
  const wdo = row.week_day_options;
  // El día se resuelve desde orders.week_day_id: los pedidos de media
  // vianda tomados del catálogo no tienen week_day_options.
  const wd = row.week_days ?? null;
  const week = wd?.weeks ?? null;

  // El producto puede venir de la oferta del día o del catálogo.
  let optionId: string | null = wdo ? wdo.id : null;
  let optionType: OptionType | null = null;
  let optionName: string | null = null;

  if (wdo) {
    optionType = mapOptionType(wdo.option_type);
    optionName =
      optionType === "dish"
        ? (wdo.dish_versions?.name ?? null)
        : (wdo.menu_versions?.name ?? null);
  } else if (row.dish_version_id) {
    optionId = row.dish_version_id;
    optionType = "dish";
    optionName = row.dish_versions?.name ?? null;
  } else if (row.menu_version_id) {
    optionId = row.menu_version_id;
    optionType = "menu";
    optionName = row.menu_versions?.name ?? null;
  }

  return {
    id: row.id,
    clientId: row.client_id,
    weekDayId: row.week_day_id,
    weekDayOptionId: row.week_day_option_id,
    dishVersionId: row.dish_version_id,
    menuVersionId: row.menu_version_id,
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
    option:
      optionId !== null && optionType !== null
        ? { id: optionId, type: optionType, name: optionName }
        : null,
  };
}

function mapHistoryCancellation(row: ClientCancellationRow): Cancellation {
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
