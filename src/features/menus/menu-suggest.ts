import type { MenuItemRole } from "../../types/domain";

/**
 * Helpers puros para el compositor de menús.
 *
 * Acá se concentran las reglas de naming y cálculo de precio a partir de la
 * composición, más el armado de combinaciones sugeridas. No se toca la base
 * de datos: todo se deriva de los platos que ya están cargados.
 */

/** Plato candidato a entrar en una sugerencia (todavía sin versión resuelta). */
export interface SuggestionDish {
  dishId: string;
  name: string;
  /** Días en los que el plato ya se ofreció, si se conoce. Menos = mejor. */
  uses?: number;
}

/** Item de la composición, con su versión resuelta. */
export interface MenuCompositionItem {
  dishVersionId: string;
  dishId: string;
  name: string;
  price: number;
  role: MenuItemRole;
}

/** Plato elegido por el sugeridor, con el rol que ocuparía en el menú. */
export interface SuggestedDish {
  dishId: string;
  name: string;
  role: MenuItemRole;
}

const SUGGEST_MAX_ATTEMPTS = 30;

/**
 * Arma el nombre del menú a partir de su composición.
 *
 * Reglas:
 *  - sin guarniciones: solo el nombre del principal;
 *  - 1 guarnición:     "Milanesas de Carne con Verduras variadas al vapor";
 *  - 2+ guarniciones:  "Guisito de Carne vacuna, fideos moñito y verduras".
 *
 * Devuelve "" si todavía no hay plato principal.
 */
export function buildMenuName(items: MenuCompositionItem[]): string {
  const main = items.find((item) => item.role === "main");

  if (!main) {
    return "";
  }

  const sides = items.filter((item) => item.role === "side");

  if (sides.length === 0) {
    return main.name;
  }

  if (sides.length === 1) {
    return `${main.name} con ${sides[0].name}`;
  }

  const parts = [main.name, ...sides.map((side) => side.name)];

  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/**
 * Suma los precios de los componentes (referencia de trabajo del menú).
 * Se redondea a 2 decimales para no arrastrar errores de punto flotante.
 */
export function buildMenuPrice(items: MenuCompositionItem[]): number {
  const total = items.reduce((sum, item) => sum + item.price, 0);

  return Math.round(total * 100) / 100;
}

/** Firma de una composición, para detectar repetidos entre sugerencias. */
export function compositionSignature(
  items: Array<Pick<MenuCompositionItem, "dishId" | "role">>,
): string {
  return items
    .map((item) => `${item.role}:${item.dishId}`)
    .sort()
    .join("|");
}

/**
 * Propone una combinación: 1 plato principal + 0 a 2 guarniciones.
 *
 * - Prioriza platos con menos usos recientes (más variedad para el cliente),
 *   mezclado con aleatoriedad para que cada clic ofrezca otra opción.
 * - `previousSignature` evita repetir la última sugerencia aplicada mientras
 *   haya variedad suficiente en el catálogo.
 *
 * Devuelve null solo si no hay platos candidatos.
 */
export function suggestComposition(
  pool: SuggestionDish[],
  previousSignature: string | null,
): SuggestedDish[] | null {
  if (pool.length === 0) {
    return null;
  }

  // Menos usos recientes = mejor candidato; el azar (x3) mezcla el orden
  // para que cada clic proponga otra cosa.
  const ranked = [...pool]
    .map((dish) => ({ dish, score: (dish.uses ?? 0) + Math.random() * 3 }))
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.dish);

  // Se elige sobre la mitad mejor del catálogo (mínimo 2 candidatos).
  const candidates = ranked.slice(0, Math.max(2, Math.ceil(ranked.length / 2)));

  let fallback: SuggestedDish[] | null = null;

  for (let attempt = 0; attempt < SUGGEST_MAX_ATTEMPTS; attempt += 1) {
    const maxSides = Math.min(2, candidates.length - 1);
    const sideCount = Math.floor(Math.random() * (maxSides + 1));
    const chosen = sample(candidates, sideCount + 1);

    const picked: SuggestedDish[] = chosen.map((dish, index) => ({
      ...dish,
      role: index === 0 ? "main" : "side",
    }));

    fallback = picked;

    if (compositionSignature(picked) !== previousSignature) {
      return picked;
    }
  }

  return fallback;
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
