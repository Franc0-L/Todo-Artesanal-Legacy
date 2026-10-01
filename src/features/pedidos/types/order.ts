import type { Modality } from "../../../types/domain";

/**
 * Pedido (entidad base, sin enriquecimiento).
 *
 * appliedPrice queda congelado al crear el pedido (lo calcula el
 * trigger validate_order en la DB). Nunca se recalcula.
 */
export interface Order {
  id: string;
  clientId: string;
  /**
   * Día al que pertenece el pedido. Siempre presente desde la
   * migración 20260929000001 (backfill + NOT NULL): es la referencia
   * al día, independientemente de si el producto viene de la oferta
   * o del catálogo.
   */
  weekDayId: string;
  /**
   * Opción de oferta referenciada. Null cuando el pedido es una media
   * vianda tomada del catálogo (ver dishVersionId / menuVersionId).
   */
  weekDayOptionId: string | null;
  /** Producto de catálogo de una media vianda libre. */
  dishVersionId: string | null;
  /** Producto de catálogo de una media vianda libre. */
  menuVersionId: string | null;
  modality: Modality;
  quantity: number;
  appliedPrice: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input para crear un pedido.
 *
 * NO incluye appliedPrice: lo calcula el trigger validate_order
 * (BEFORE INSERT) con calculate_order_price o con
 * calculate_catalog_media_vianda_price. El cliente jamás manda el
 * precio.
 *
 * Dos fuentes de producto, mutuamente excluyentes (CHECK
 * orders_product_source_check en la DB):
 *
 *  - Oferta: semana activa + opción del día. Vale para general,
 *    opcional y la media vianda "clásica" (mitad de esa opción).
 *  - Catálogo: media vianda sobre cualquier plato o menú del catálogo,
 *    referenciado por su última versión. Exige modality media_vianda
 *    (lo rechaza validate_order) y clients.allows_half_portion (lo
 *    rechaza calculate_catalog_media_vianda_price).
 *
 * El trigger también valida:
 *  - semana activa;
 *  - cliente en week_expected_clients.
 */
export type CreateOrderInput =
  | {
      clientId: string;
      weekDayId: string;
      weekDayOptionId: string;
      modality: Modality;
      quantity: number;
      notes?: string | null;
    }
  | {
      clientId: string;
      weekDayId: string;
      dishVersionId: string;
      modality: "media_vianda";
      quantity: number;
      notes?: string | null;
    }
  | {
      clientId: string;
      weekDayId: string;
      menuVersionId: string;
      modality: "media_vianda";
      quantity: number;
      notes?: string | null;
    };

/**
 * Input para actualizar un pedido.
 *
 * Solo quantity y notes son editables. clientId, weekDayId,
 * weekDayOptionId, dishVersionId, menuVersionId, modality y
 * appliedPrice son inmutables (el trigger validate_order rechaza
 * sus cambios).
 */
export interface UpdateOrderInput {
  quantity?: number;
  notes?: string | null;
}
