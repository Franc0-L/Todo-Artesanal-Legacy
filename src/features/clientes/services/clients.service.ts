import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import {
  runSupabase,
  runSupabaseFull,
  runSupabaseOrThrow,
} from "../../../lib/error-handler";
import { AppError } from "../../../lib/errors";
import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "../../../types/database";
import type {
  Client,
  CreateClientInput,
  UpdateClientInput,
} from "../types/client";
import type {
  ClientListItem,
  ClientListParams,
  ClientListResult,
} from "../types/client-list";

type ClientRow = Tables<"clients">;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const CLIENT_LIST_COLUMNS = "id,name,phone,address,active";

const CLIENT_COLUMNS =
  "id,name,phone,address,notes,special_care,allows_half_portion,active,created_at,updated_at";

export async function listClients(
  params: ClientListParams = {},
): Promise<ClientListResult> {
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const search = normalizeSearch(params.search);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("clients")
    .select(CLIENT_LIST_COLUMNS, { count: "exact" })
    .order("name", { ascending: true })
    .range(from, to);

  if (search) {
    const escapedSearch = escapeIlikePattern(search);

    query = query.or(
      `name.ilike.%${escapedSearch}%,phone.ilike.%${escapedSearch}%,address.ilike.%${escapedSearch}%`,
    );
  }

  if (params.active !== undefined) {
    query = query.eq("active", params.active);
  }

  const result = await runSupabaseFull<
    Pick<ClientRow, "id" | "name" | "phone" | "address" | "active">[]
  >(() => query);

  return {
    items: (result.data ?? []).map(mapClientListItem),
    total: result.count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Devuelve la ficha de un cliente.
 *
 * `client` permite reutilizarlo desde `/menu/:token` con el JWT de
 * cliente: la policy `clients_client_select` deja al cliente ver solo su
 * propia fila, así que sirve para leer su configuración (por ejemplo,
 * `allows_half_portion`).
 */
export async function getClient(
  clientId: string,
  client: SupabaseClient<Database> = supabase,
): Promise<Client> {
  validateUuid(clientId, "clientId");

  const result = await runSupabaseOrThrow<ClientRow>(() =>
    client
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("id", clientId)
      .maybeSingle(),
  );

  return mapClient(result);
}

export async function createClient(input: CreateClientInput): Promise<Client> {
  const payload = validateCreateClientInput(input);

  const result = await runSupabaseOrThrow<ClientRow>(() =>
    supabase.from("clients").insert(payload).select(CLIENT_COLUMNS).single(),
  );

  return mapClient(result);
}

export async function updateClient(
  clientId: string,
  input: UpdateClientInput,
): Promise<Client> {
  validateUuid(clientId, "clientId");

  const payload = validateUpdateClientInput(input);

  if (Object.keys(payload).length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Debe indicarse al menos un campo para actualizar.",
    );
  }

  const result = await runSupabaseOrThrow<ClientRow>(() =>
    supabase
      .from("clients")
      .update(payload)
      .eq("id", clientId)
      .select(CLIENT_COLUMNS)
      .single(),
  );

  return mapClient(result);
}

/**
 * Elimina definitivamente un cliente.
 *
 * Para clientes con historial, usar setClientActive(id, false).
 * El DELETE falla con FK violation si el cliente tiene pedidos
 * o cancelaciones relacionadas.
 */
export async function deleteClient(clientId: string): Promise<void> {
  validateUuid(clientId, "clientId");

  await runSupabase<unknown>(() =>
    supabase.from("clients").delete().eq("id", clientId),
  );
}

export async function setClientActive(
  clientId: string,
  active: boolean,
): Promise<Client> {
  validateUuid(clientId, "clientId");

  if (typeof active !== "boolean") {
    throw new AppError(
      "VALIDATION_ERROR",
      "El estado activo debe ser booleano.",
    );
  }

  const result = await runSupabaseOrThrow<ClientRow>(() =>
    supabase
      .from("clients")
      .update({ active })
      .eq("id", clientId)
      .select(CLIENT_COLUMNS)
      .single(),
  );

  return mapClient(result);
}

function validateCreateClientInput(
  input: CreateClientInput,
): TablesInsert<"clients"> {
  if (!input || typeof input !== "object") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Los datos del cliente son obligatorios.",
    );
  }

  const name = normalizeRequiredString(input.name, "name");

  return {
    name,
    phone: normalizeNullableString(input.phone),
    address: normalizeNullableString(input.address),
    notes: normalizeNullableString(input.notes),
    special_care: normalizeNullableString(input.specialCare),
    allows_half_portion: input.allowsHalfPortion ?? false,
    active: input.active ?? true,
  };
}

function validateUpdateClientInput(
  input: UpdateClientInput,
): TablesUpdate<"clients"> {
  if (!input || typeof input !== "object") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Los datos a actualizar son obligatorios.",
    );
  }

  const payload: TablesUpdate<"clients"> = {};

  if (input.name !== undefined) {
    payload.name = normalizeRequiredString(input.name, "name");
  }

  if (input.phone !== undefined) {
    payload.phone = normalizeNullableString(input.phone);
  }

  if (input.address !== undefined) {
    payload.address = normalizeNullableString(input.address);
  }

  if (input.notes !== undefined) {
    payload.notes = normalizeNullableString(input.notes);
  }

  if (input.specialCare !== undefined) {
    payload.special_care = normalizeNullableString(input.specialCare);
  }

  if (input.allowsHalfPortion !== undefined) {
    if (typeof input.allowsHalfPortion !== "boolean") {
      throw new AppError(
        "VALIDATION_ERROR",
        "allowsHalfPortion debe ser booleano.",
      );
    }

    payload.allows_half_portion = input.allowsHalfPortion;
  }

  return payload;
}

function normalizeRequiredString(value: string, fieldName: string): string {
  if (typeof value !== "string") {
    throw new AppError("VALIDATION_ERROR", `${fieldName} debe ser texto.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${fieldName} no puede estar vacío.`,
    );
  }

  return normalized;
}

function normalizeNullableString(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new AppError("VALIDATION_ERROR", "El valor debe ser texto o null.");
  }

  const normalized = value.trim();

  return normalized || null;
}

function normalizeSearch(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new AppError("VALIDATION_ERROR", "La búsqueda debe ser texto.");
  }

  const normalized = value.trim();

  return normalized || undefined;
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

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function mapClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    specialCare: row.special_care,
    allowsHalfPortion: row.allows_half_portion,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapClientListItem(
  row: Pick<ClientRow, "id" | "name" | "phone" | "address" | "active">,
): ClientListItem {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    active: row.active,
  };
}
