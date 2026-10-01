# ADR-002: La media vianda es una modalidad de pedido

## Contexto

Un cliente puede querer la mitad de una vianda. La primera intuición es
tratarla como una **categoría** de plato ("media porción") o como un
producto más del catálogo. Pero eso obliga a duplicar platos, versiones y
precios, y deja al catálogo lleno de entradas que en realidad describen
una decisión del cliente al pedir, no un producto distinto.

Además, la mitad de una vianda no es "medio menú compuesto": es la mitad
del precio de **una** opción concreta. El concepto pertenece al pedido.

## Decisión

`media_vianda` es una **modalidad de pedido**, al mismo nivel que
`general` y `opcional` (`orders.modality`). No es una categoría de plato ni
un plato aparte.

- Está disponible solo si `clients.allows_half_portion = true`. Lo valida
  la DB (`calculate_order_price` / `calculate_catalog_media_vianda_price`),
  no el frontend.
- El precio es siempre la mitad del precio **normal** de la selección, y el
  normal sale de la rama `general`: nunca del precio `opcional`, y nunca de
  un precio propio de media vianda.
- Tiene **dos fuentes de producto**, mutuamente excluyentes (CHECK
  `orders_product_source_check`):
  - la opción de oferta del día (`week_day_option_id`) → mitad de esa
    opción (`calculate_order_price(..., 'media_vianda')`);
  - cualquier plato o menú del catálogo (`dish_version_id` /
    `menu_version_id`) → `calculate_catalog_media_vianda_price`.
- El pedido siempre pertenece a un día (`orders.week_day_id`), incluso
  cuando el producto viene del catálogo.

La decisión original (`docs/decisiones/20260926-oferta-general-opcional.md`)
fijaba que la media vianda "sigue usando la misma opción de oferta". Se
revierte parcialmente en `docs/decisiones/20260929-media-vianda-catalogo.md`:
`general` y `opcional` siguen tomando modalidad y precio de la opción, pero
la media vianda puede además tomarse del catálogo.

## Consecuencias

**A favor:**

- El catálogo describe productos; el pedido describe decisiones.
- No hay platos "de media porción" duplicados ni precios paralelos.
- El precio se deriva con una regla única y auditable.

**En contra:**

- `orders` necesita distinguir la fuente del producto (`week_day_option_id`
  vs. `dish_version_id`/`menu_version_id`) y `week_day_id` como columna
  propia (antes se derivaba de la opción).
- La unicidad requiere índices parciales extra para la media vianda libre
  (`orders_catalog_dish_unique`, `orders_catalog_menu_unique`), porque los
  `NULL` de `week_day_option_id` no colisionan.
- La UI de cliente solo expone la media vianda **desde la oferta**: el RLS
  del cliente no le permite ver todo el catálogo (ver pendiente en
  `docs/estado-fases-1-5.md`).

## Alternativas consideradas

1. **Categoría de plato ("media porción").** Obliga a duplicar platos y
   versiones. Descartada: mezcla catálogo con decisión de pedido.
2. **Precio propio de media vianda.** Guardar un precio específico de media
   vianda por cliente/plato. Descartada: agrega una dimensión de precio
   más sin necesidad; la regla es "la mitad".
3. **Solo desde la oferta.** Único comportamiento original. Descartada
   (parcialmente revertida) porque impide pedir media vianda de un plato
   fuera de la oferta del día.
