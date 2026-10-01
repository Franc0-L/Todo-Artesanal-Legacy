import type { Cancellation } from "../../cancelaciones/types/cancellation";
import type { Client } from "../../clientes/types/client";
import type { OrderDetail } from "../../pedidos/types/order-detail";
import type { Week } from "../../semanas/types/week";
import type { WeekOffer } from "../../semanas/types/week-offer";

/**
 * Todo lo que la vista de cliente (`/menu/:token`) necesita para una
 * semana activa, resuelto en una sola carga.
 *
 * - `week`: semana activa (o `null` si no hay ninguna).
 * - `offer`: días de la semana con sus opciones (General / Opcional).
 * - `orders` / `cancellations`: lo que el cliente ya respondió esta semana.
 * - `client`: la propia ficha, para saber si tiene `allowsHalfPortion`.
 * - `prices`: precio unitario efectivo por `${optionId}|${modality}`.
 */
export interface ClientMenuData {
  week: Week;
  offer: WeekOffer;
  orders: OrderDetail[];
  cancellations: Cancellation[];
  client: Client | null;
  prices: Record<string, number>;
}

/** Clave de `ClientMenuData.prices` para una opción de oferta y modalidad. */
export function priceKey(optionId: string, modality: string): string {
  return `${optionId}|${modality}`;
}
