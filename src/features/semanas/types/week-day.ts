import type { DayOfWeek } from "../../../types/domain";

export interface WeekDay {
  id: string;
  weekId: string;
  dayOfWeek: DayOfWeek;
  date: string;
  /**
   * Instante en que cierran las respuestas de clientes para este día
   * (ISO con offset). Después de este momento la DB rechaza pedidos y
   * cancelaciones de clientes ("fuera de horario"); el admin no se ve
   * afectado. Ver `docs/decisiones/20261001-fuera-de-horario-cutoff-por-dia.md`.
   */
  cutoffAt: string;
  createdAt: string;
}
