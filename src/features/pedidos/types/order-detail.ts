import type { DayOfWeek, OptionType } from "../../../types/domain";
import type { Order } from "./order";

/**
 * Pedido enriquecido con los datos de contexto que la UI
 * necesita para mostrarlo sin consultas adicionales:
 *  - cliente (nombre, teléfono);
 *  - día de la semana (fecha, día);
 *  - semana (rango);
 *  - opción elegida (dish o menu, con su nombre).
 *
 * Los refs son nullable porque en teoría podrían faltar (FKs
 * sin cascade y datos históricos). En la práctica siempre van a
 * estar.
 */
export interface OrderDetail extends Order {
  client: {
    name: string;
    phone: string | null;
  } | null;
  weekDay: {
    id: string;
    date: string;
    dayOfWeek: DayOfWeek;
  } | null;
  week: {
    id: string;
    startDate: string;
    endDate: string;
  } | null;
  /**
   * Producto que consume el pedido. Puede venir de dos fuentes:
   *
   *  - oferta: la opción de oferta del día (id = week_day_option_id);
   *  - catálogo: media vianda libre (id = dish/menu_version_id y
   *    weekDayOptionId es null en el pedido).
   */
  option: {
    id: string;
    type: OptionType;
    /**
     * Nombre del dish o del menu referenciado. Para menús se usa
     * el nombre de la versión.
     */
    name: string | null;
  } | null;
}
