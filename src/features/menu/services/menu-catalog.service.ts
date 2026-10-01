import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import { runSupabase } from "../../../lib/error-handler";
import { AppError } from "../../../lib/errors";
import type { Database } from "../../../types/database";
import type { OptionType } from "../../../types/domain";

/** Producto del catálogo activo, con su última versión resuelta. */
export interface CatalogItem {
  type: OptionType;
  productId: string;
  versionId: string;
  name: string;
}

interface CatalogRow {
  product_type: string;
  product_id: string;
  version_id: string;
  name: string;
}

/**
 * Catálogo activo (platos y menús con su última versión) para la media
 * vianda libre del cliente.
 *
 * Llama al RPC `list_client_catalog` (`security definer`): el RLS de
 * cliente no expone `dishes` / `menus`, así que el acceso al catálogo pasa
 * por este RPC, que resuelve la identidad con `private.current_client_id()`.
 * El precio no viene acá: lo resuelve `calculate_my_order_price`.
 */
export async function listClientCatalog(
  client: SupabaseClient<Database> = supabase,
): Promise<CatalogItem[]> {
  const rows = await runSupabase<CatalogRow[]>(() =>
    client.rpc("list_client_catalog"),
  );

  return (rows ?? []).map(mapCatalogItem);
}

function mapCatalogItem(row: CatalogRow): CatalogItem {
  return {
    type: mapOptionType(row.product_type),
    productId: row.product_id,
    versionId: row.version_id,
    name: row.name,
  };
}

function mapOptionType(value: string): OptionType {
  if (value === "dish" || value === "menu") return value;
  throw new AppError(
    "DATABASE_ERROR",
    `El tipo de producto del catálogo es inválido: ${value}.`,
  );
}
