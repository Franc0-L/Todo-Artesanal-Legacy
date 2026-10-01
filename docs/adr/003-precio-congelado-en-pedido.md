# ADR-003: Precio aplicado congelado en el pedido

## Contexto

Los precios cambian: sube el catálogo, el cliente renegocia un precio
especial, se ajusta una modalidad. La pregunta es qué le pasó a un pedido
ya hecho cuando su precio de origen cambia después.

Si un pedido guardara solo la referencia (cliente + opción/plato) y
recalculara el precio al leerlo, el pasado cambiaría solo: un pedido de
hace tres meses empezaría a mostrar el precio de hoy. Eso viola la regla
maestra del dominio: una modificación posterior nunca debe alterar
retrospectivamente el significado de un hecho histórico.

## Decisión

`orders.applied_price` es el **precio unitario congelado** del pedido. Se
calcula **una sola vez al insertar** y no se recalcula nunca.

- El cálculo lo hace el trigger `private.validate_order` en el `INSERT`,
  con `calculate_order_price` (oferta) o
  `calculate_catalog_media_vianda_price` (catálogo).
- El frontend **nunca** envía `applied_price`: lo ignora y la DB lo
  reescribe. No se confía en un precio que venga del cliente.
- `applied_price` es inmutable: no se puede cambiar por `UPDATE`
  (lo bloquea el trigger de inmutabilidad de campos clave).
- `quantity`, `notes` y otros campos editables no afectan el precio
  unitario; el importe de la línea es `quantity × applied_price`.

## Consecuencias

**A favor:**

- El historial es fiel: un pedido siempre muestra el precio que regía
  cuando se hizo.
- Cambiar precios del catálogo o del cliente no reescribe pedidos pasados.
- El precio es un hecho del pedido, no un valor derivado en lectura.

**En contra:**

- Hay que repetir/actualizar la regla de cálculo en la DB de forma
  consistente (`calculate_order_price` y su rama de catálogo). Es la fuente
  única de verdad, pero cualquier cambio de regla debe tocar esas funciones.
- Para **mostrar** un precio antes de pedir hace falta un camino aparte
  (`calculate_my_order_price`, `security definer`), porque la función de
  cálculo no se otorga al cliente. Ese valor es solo UX: el definitivo lo
  congela el trigger.
- Un precio mal calculado en el `INSERT` queda congelado con el error; solo
  se corrige eliminando y recreando el pedido.

## Alternativas consideradas

1. **Recalcular en lectura.** Derivar el precio al consultar el pedido.
   Descartada: reescribe el pasado cuando cambian los precios.
2. **Snapshot sin tocar `orders`.** Una tabla de precios históricos por
   transacción. Descartada por sobre-ingeniería: una columna congelada
   alcanza y es más simple.
3. **Precio enviado por el frontend.** Descartada de plano: permite
   manipular el precio desde el cliente.
