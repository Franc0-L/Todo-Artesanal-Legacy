# Decisión de dominio — Media vianda desde el catálogo

## Regla

Una **media vianda** puede pedirse de dos formas:

1. **Desde la oferta del día** (comportamiento original): la mitad del
   precio de una opción General u Opcional de la semana activa.
2. **Desde el catálogo** (nuevo): la mitad del precio normal de **cualquier
   plato o menú activo**, aunque no esté en la oferta de ese día.

Esto **revierte parcialmente**
`docs/decisiones/20260926-oferta-general-opcional.md`, que fijaba que la
media vianda _"sigue utilizando la misma opción de oferta"_. Esa regla
sigue valiendo para `general` y `opcional`, pero deja de ser la única vía
de la media vianda.

`general` y `opcional` **no cambian**: siguen tomando modalidad y precio de
la opción de oferta, que sigue siendo obligatoria para ellas.

## Persistencia

`orders` pasa a tener **dos fuentes de producto mutuamente excluyentes**:

| Columna                               | Rol                                                        |
| ------------------------------------- | ---------------------------------------------------------- |
| `week_day_id`                         | Día del pedido. **Siempre presente** (NOT NULL).           |
| `week_day_option_id`                  | Opción de oferta. Nullable: null en la media vianda libre. |
| `dish_version_id` / `menu_version_id` | Producto de catálogo de la media vianda libre.             |

El CHECK `orders_product_source_check` exige:

- `media_vianda`: **exactamente una** de las tres referencias;
- `general` / `opcional`: `week_day_option_id` obligatorio y sin producto
  de catálogo.

### Por qué `week_day_id`

Antes el día se **derivaba** de la opción (`week_day_options → week_days`).
Un pedido de catálogo no tiene opción, así que esa vía desaparece: el día
pasa a ser una columna propia. Las lecturas (Pedidos, Historial) ya no
atraviesan la opción para filtrar por semana.

### Unicidad

La unicidad original `(client_id, week_day_option_id, modality)` no cubre
la media vianda libre (`week_day_option_id` NULL, y en Postgres los NULL no
colisionan). Se agregan dos índices únicos parciales:

- `orders_catalog_dish_unique (client_id, week_day_id, dish_version_id)`;
- `orders_catalog_menu_unique (client_id, week_day_id, menu_version_id)`.

## Precio

La media vianda de catálogo usa `calculate_catalog_media_vianda_price`,
con el mismo criterio que la rama `general` de `calculate_order_price`:

- **plato**: precio específico del plato > precio general del cliente >
  precio base de la versión;
- **menú**: precio general del cliente > precio base de la versión;

y siempre `round(precio_normal / 2, 2)`. Nunca usa el precio de la
modalidad `opcional`, y no existe un precio propio de media vianda.

Sigue exigiendo `clients.allows_half_portion = true`.

## Validaciones

`private.validate_order` quedó unificado:

- si viene `week_day_option_id`, valida la opción, deriva el día de ella y
  completa `new.week_day_id`;
- si no, exige `week_day_id` y valida ese día;
- en ambos casos exige semana activa y cliente en `week_expected_clients`;
- normaliza `modality` a `offer_modality` cuando es `general`/`opcional`;
- en INSERT congela `applied_price` (por catálogo o por opción);
- en UPDATE rechaza cambios de `week_day_id`, `dish_version_id` y
  `menu_version_id` además de los campos ya inmutables.

Los triggers de protección (`prevent_closed_order_mutation`,
`prevent_order_with_cancellation`, `prevent_cancellation_with_order`) leen
el día desde `orders.week_day_id`. La exclusión mutua pedido ↔ cancelación
por cliente/día se mantiene igual.

## Migraciones

- `20260929000001_catalog_media_vianda.sql` — estructura, precio, triggers
  y backfill de `week_day_id`.
- `20260929000002_fix_media_vianda_text.sql` — corrige el texto de 6
  mensajes de error que quedaron con mojibake al escribir la anterior.
- Rollback: `supabase/rollback/20260929000001_catalog_media_vianda.sql`
  (falla a propósito si ya hay pedidos de catálogo, porque no tienen opción
  a la que volver).

Ambas están aplicadas en local y en remoto.

## UI

En `OrderDrawer`, marcar **"Pedir como media vianda"** cambia la fuente del
producto: en lugar del selector de opciones del día aparece un **buscador
del catálogo** (Platos / Menús activos, resolviendo la última versión al
elegir). El día se sigue eligiendo aparte, porque el pedido siempre
pertenece a un día de la semana.

La edición de un pedido no cambia: `modality`, el día y el producto siguen
siendo inmutables (para corregirlos hay que eliminar y recrear).
