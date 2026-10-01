# Decisión de dominio — General y Opcional por día

## Regla

Para cada `week_day` la administración define exactamente dos opciones de oferta:

- una `general`;
- una `opcional`.

`general` y `opcional` son modalidades de **oferta semanal**, no modalidades que el cliente decide libremente al crear un pedido.

`media_vianda` continúa siendo una modalidad del pedido y no una categoría de oferta.

## Persistencia

`week_day_options.offer_modality` almacena `general | opcional`.

Existe una unicidad por `(week_day_id, offer_modality)`, por lo que un día no puede tener dos ofertas General ni dos Opcionales.

La activación de una semana exige ambas modalidades para cada uno de sus cinco días.

## Pedidos administrativos

Al crear un pedido manual, la opción seleccionada determina si corresponde a General u Opcional: el `OrderDrawer` envía siempre `modality` derivado de `selectedOption.offerModality`.

La base de datos garantiza esa consistencia en `private.validate_order`:

- La versión vigente —tanto en producción (`20260926165602`) como en
  local (`20260926170000`, mismo contenido)— **normaliza**
  `orders.modality` al `offer_modality` de la opción.
- La primera versión de `20260926165141` (16:51) **rechazaba** la
  combinación inconsistente, pero fue reemplazada 5 minutos después
  por la normalizadora.

La media vianda sigue utilizando la misma opción de oferta, pero como modalidad de pedido separada.

## Migración

Implementado en `supabase/migrations/20260926165141_add_week_offer_modality.sql`.

El rollback correspondiente restaura `activate_week` y `validate_order` a su comportamiento anterior además de eliminar la columna, constraint e índice nuevos.

### Nota de implementación

- `20260926170000_normalize_order_offer_modality.sql` reescribe `private.validate_order` en modo **normalización** (cambia el comportamiento de rechazar a corregir). En remoto esa versión normalizadora ya está vigente desde `20260926165602` (mismo contenido).
- **Efecto colateral:** la `activate_week` de `20260926165141` se escribió sin los chequeos de "platos/menús repetidos entre días" que había introducido `20260926000001`, así que en el encadenamiento de archivos la unicidad de producto por semana queda **solo** en el trigger `trg_validate_week_day_option_product_uniqueness`. La migración de consolidación `20260927000001` devuelve la versión **fusionada** de `activate_week` (ambos chequeos).
- **Estado:** todas aplicadas en local y en remoto (push del 2026-09-29). Ver "Divergencia local ↔ remoto → decisión tomada" en `docs/estado-fases-1-5.md` y `docs/decisiones/20260927-local-fuente-de-verdad.md`.
- **Superada parcialmente:** `docs/decisiones/20260929-media-vianda-catalogo.md` permite que la media vianda apunte a cualquier plato o menú del catálogo (no solo a la opción del día). General y Opcional no cambian.
