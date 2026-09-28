import type { DayOfWeek } from "../../types/domain";

/**
 * Etiquetas de los días que puede tener una semana (lunes a viernes).
 *
 * `DayOfWeek` usa la numeración ISO (1 = lunes). Vive acá y no dentro de
 * un componente para compartirse entre el taller de la semana y el
 * drawer de detalle.
 */
export const DAY_LABELS: Record<DayOfWeek, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
};
