import type { Modality } from "../../types/domain";

/**
 * Etiquetas legibles de las modalidades de pedido para la vista de
 * cliente. Compartidas por la tarjeta de día y la línea de pedido.
 */
export const MODALITY_LABELS: Record<Modality, string> = {
  general: "General",
  opcional: "Opcional",
  media_vianda: "Media vianda",
};
