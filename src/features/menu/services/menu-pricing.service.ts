import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import { runSupabaseOrThrow } from "../../../lib/error-handler";
import { AppError } from "../../../lib/errors";
import type { Database } from "../../../types/database";
import type { Modality } from "../../../types/domain";

export interface EffectivePriceInput {
  weekDayOptionId?: string;
  dishVersionId?: string;
  menuVersionId?: string;
  modality: Modality;
}

/**
 * Precio unitario efectivo que le corresponde al cliente.
 *
 * Llama al RPC `calculate_my_order_price`, que resuelve la identidad con
 * `private.current_client_id()` (el claim `client_id` del JWT). Es la
 * misma precedencia que aplicará el trigger `validate_order` al insertar
 * el pedido, así que sirve como vista previa fiel antes de pedir.
 *
 * Es **solo UX**: el precio definitivo lo congela el trigger. El
 * frontend nunca envía `applied_price`.
 */
export async function getEffectivePrice(
  input: EffectivePriceInput,
  client: SupabaseClient<Database> = supabase,
): Promise<number> {
  const raw = await runSupabaseOrThrow<number>(() =>
    client.rpc("calculate_my_order_price", {
      p_week_day_option_id: input.weekDayOptionId ?? null,
      p_dish_version_id: input.dishVersionId ?? null,
      p_menu_version_id: input.menuVersionId ?? null,
      p_modality: input.modality,
    } as never),
  );

  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    throw new AppError(
      "DATABASE_ERROR",
      "El servidor devolvió un precio inválido.",
    );
  }

  return value;
}
