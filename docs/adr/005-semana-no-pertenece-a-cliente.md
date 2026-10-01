# ADR-005: La semana no pertenece a un cliente

## Contexto

La primera intuición al modelar "qué pide cada cliente" es colgar la
semana del cliente: "la semana de Juan", "el menú de María". Eso llevaría
a una oferta por cliente, o a una columna `client_id` en `weeks` o en la
oferta.

Pero el negocio es al revés: la cocina ofrece **lo mismo para todos** cada
semana (una General y una Opcional por día) y lo que varía por cliente es
su configuración (precios especiales, media vianda habilitada) y su
elección (pedidos, cancelaciones). Si la semana perteneciera a un cliente,
cada cambio de oferta habría que replicarlo N veces y el "sin responder"
no tendría contra qué calcularse.

La pregunta: ¿dónde vive la oferta común y cómo se ata cada cliente a ella
sin duplicarla?

## Decisión

La semana (y su oferta: días + opciones) es **común a todos los clientes**.
No hay `client_id` en `weeks`, `week_days` ni `week_day_options`.

El vínculo cliente ↔ semana vive en dos lugares, ambos del lado del
cliente:

- `week_expected_clients`: snapshot congelado al activar la semana con los
  clientes que debían responder. `clients.active` posterior no la afecta.
- `orders` / `cancellations`: hechos del cliente contra un día concreto.
  El trigger `private.validate_order` exige semana activa y cliente en
  `week_expected_clients`.

Las diferencias individuales (precio especial general/opcional/por plato,
`allows_half_portion`, notas) pertenecen a la configuración del cliente o
a su pedido, nunca a la oferta.

## Consecuencias

**A favor:**

- Una sola oferta que cocinar y mostrar; el admin la arma una vez.
- "Sin responder" es computable: esperados menos los que tienen pedido o
  cancelación.
- Desactivar un cliente hoy no reescribe su historial ni la semana en
  curso para los demás.

**En contra:**

- Hace falta la tabla puente `week_expected_clients`: sin ella, "quién
  debía responder" se recalcularía contra `clients.active` actual y el
  pasado cambiaría.
- Un cliente fuera de la lista no puede pedir aunque esté activo hoy: es
  correcto por dominio, pero sorprende si se lo activa a mitad de semana.

## Alternativas consideradas

1. **`client_id` en `weeks` (una semana por cliente).** Duplica la oferta
   N veces y rompe la operación de cocina única. Descartada.
2. **Sin `week_expected_clients`, usando `clients.active` en vivo.**
   Descartada: activar/desactivar un cliente reescribiría el "sin
   responder" de semanas pasadas (viola la regla maestra).
3. **Ofertas por cliente dentro de la semana.** Variantes de
   `week_day_options` por cliente. Descartada: la oferta es común por
   definición; lo individual ya vive en precios y pedidos.
