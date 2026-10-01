import type {
  OfferModality,
  WeekDayOption,
  WeekOffer,
} from "./types/week-offer";

/**
 * Helpers puros de la oferta semanal.
 *
 * Acá viven las reglas de armado de la oferta que no tocan la base de
 * datos: qué slots le faltan a un día (General / Opcional), cómo ordenar
 * las opciones para mostrarlas y cómo elegir platos para sugerir.
 *
 * A diferencia de `menus/menu-suggest.ts`, la unidad sugerida es un plato
 * completo (no una composición principal + guarniciones): cada día acepta
 * como máximo una opción General y una Opcional (UNIQUE por día y
 * modalidad) y un mismo producto no puede repetirse dentro de la semana.
 */

/** Plato candidato a ocupar un slot de la oferta (todavía sin versión resuelta). */
export interface SuggestionDish {
  dishId: string;
  name: string;
  /** Días en los que el plato ya se ofreció, si se conoce. Menos = mejor. */
  uses?: number;
}

const SUGGEST_MAX_ATTEMPTS = 30;

/**
 * Modalidades que le faltan a un día para completarse: cada día necesita
 * una opción General y una Opcional para poder activar la semana.
 *
 * Devuelve la lista en orden de carga (general primero).
 */
export function missingOfferModalities(
  options: Array<Pick<WeekDayOption, "offerModality">>,
): OfferModality[] {
  const taken = new Set(options.map((option) => option.offerModality));
  const missing: OfferModality[] = [];

  if (!taken.has("general")) missing.push("general");
  if (!taken.has("opcional")) missing.push("opcional");

  return missing;
}

/** Ordena las opciones de un día para mostrarlas: General antes que Opcional. */
export function sortDayOptions(options: WeekDayOption[]): WeekDayOption[] {
  return [...options].sort((a, b) => {
    if (a.offerModality === b.offerModality) return 0;
    return a.offerModality === "general" ? -1 : 1;
  });
}

/** dishIds ya usados en la semana por opciones de tipo plato. */
export function collectUsedDishIds(offer: WeekOffer): Set<string> {
  const used = new Set<string>();

  for (const day of offer.days) {
    for (const option of day.options) {
      if (option.optionType === "dish" && option.dishVersion) {
        used.add(option.dishVersion.dishId);
      }
    }
  }

  return used;
}

/** Firma de una sugerencia, para detectar repetidos entre clics. */
export function weekSuggestionSignature(dishIds: string[]): string {
  return [...dishIds].sort().join("|");
}

/**
 * Elige hasta `count` platos distintos del pool, sin tocar `usedDishIds`.
 *
 * - Prioriza platos con menos usos recientes (más variedad para el
 *   cliente), mezclado con aleatoriedad para que cada clic ofrezca otra
 *   opción.
 * - `previousSignature` evita repetir la última sugerencia aplicada
 *   mientras haya variedad suficiente en el catálogo.
 *
 * Devuelve null si no queda ningún plato libre; si el pool alcanza para
 * menos de `count`, devuelve los disponibles.
 */
export function pickDishes(
  pool: SuggestionDish[],
  usedDishIds: ReadonlySet<string>,
  count: number,
  previousSignature: string | null,
): SuggestionDish[] | null {
  if (count <= 0) {
    return null;
  }

  const available = pool.filter((dish) => !usedDishIds.has(dish.dishId));

  if (available.length === 0) {
    return null;
  }

  // Menos usos recientes = mejor candidato; el azar (x3) mezcla el orden
  // para que cada clic proponga otra cosa.
  const ranked = [...available]
    .map((dish) => ({ dish, score: (dish.uses ?? 0) + Math.random() * 3 }))
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.dish);

  // Se elige sobre un tramo amplio del catálogo disponible, no solo sobre
  // los primeros: alcanza para el pedido y deja margen de variedad.
  const candidates = ranked.slice(
    0,
    Math.max(count * 2, Math.ceil(ranked.length / 2)),
  );

  let fallback: SuggestionDish[] = [];

  for (let attempt = 0; attempt < SUGGEST_MAX_ATTEMPTS; attempt += 1) {
    const picked = sample(candidates, Math.min(count, candidates.length));

    fallback = picked;

    if (
      weekSuggestionSignature(picked.map((dish) => dish.dishId)) !==
      previousSignature
    ) {
      return picked;
    }
  }

  return fallback.length > 0 ? fallback : null;
}

/** Muestra `count` elementos sin repetir, al azar, respetando el orden. */
function sample<T>(items: T[], count: number): T[] {
  const remaining = [...items];
  const picked: T[] = [];

  while (picked.length < count && remaining.length > 0) {
    const index = Math.floor(Math.random() * remaining.length);
    picked.push(remaining[index]);
    remaining.splice(index, 1);
  }

  return picked;
}
