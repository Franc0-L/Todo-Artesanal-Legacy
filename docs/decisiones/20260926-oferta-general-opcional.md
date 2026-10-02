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

- `validate_order` **normaliza** `orders.modality` al `offer_modality` de
  la opción. Es la versión vigente en la cadena consolidada
  (`20261002000002_functions_private.sql`).

La media vianda sigue utilizando la misma opción de oferta, pero como modalidad de pedido separada.

## Migración

Implementado en la cadena consolidada: `week_day_options.offer_modality` y su UNIQUE viven en `supabase/migrations/20261002000001_schema.sql`; `activate_week` y `validate_order` en `20261002000002/0005`.

Los rollbacks por migración se descartaron durante la consolidación; el detalle histórico quedó archivado en el repo `Todo-Artesanal-Legacy`.

### Nota de implementación

- `private.validate_order` quedó en modo **normalización** (corrige el
  `modality` en vez de rechazar); vive en `20261002000002_functions_private.sql`.
- La unicidad de producto por semana está en el trigger `trg_validate_week_day_option_product_uniqueness` **y** en `activate_week` (versión fusionada, ambos chequeos en la cadena consolidada).
- **Superada parcialmente:** `docs/decisiones/20260929-media-vianda-catalogo.md` permite que la media vianda apunte a cualquier plato o menú del catálogo (no solo a la opción del día). General y Opcional no cambian.
