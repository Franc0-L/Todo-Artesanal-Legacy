# Glosario

Términos del dominio de Todo Artesanal. Ordenados por concepto, no alfabéticamente.

## Conceptos centrales

### Semana

Período operativo, típicamente lunes a viernes. Define qué se ofrece y contiene los pedidos de todos los clientes. Tiene un ciclo de vida: `draft` → `active` → `closed`.

### Oferta

El conjunto de opciones disponibles en una semana. No es una entidad separada: es la configuración de la propia semana.

### Opción de oferta

Una unidad seleccionable dentro de un día concreto. Puede ser un plato individual o un menú compuesto. Existe en el contexto `(semana, día)` y tiene una **modalidad de oferta** (`general` u `opcional`) que define la administración. Cada día tiene exactamente una de cada una, y un producto no se repite entre días de la misma semana.

### Cliente

Persona que recibe el servicio. Tiene configuración actual (nombre, teléfono, dirección, precios especiales) y un enlace personal para pedir.

### Pedido

Elección concreta de un cliente para una semana y un día. Registra cliente, opción, modalidad, cantidad y **precio aplicado** (congelado históricamente).

### Cancelación

Hecho operativo que indica que un cliente no va a recibir vianda un día concreto. Cuenta como "respuesta" del cliente.

### Corte de horario

Instante en que dejan de aceptarse respuestas de clientes para un día (`week_days.cutoff_at`). Default: 20:00 del día anterior (hora Argentina). Después del corte el cliente queda en solo lectura ("fuera de horario"); el admin nunca se ve bloqueado.

### Historial

Conjunto de hechos del pasado. Conserva su significado original aunque los datos actuales cambien.

## Catálogo

### Plato

Unidad individual del catálogo: Milanesa, Puré, Empanadas.

### Menú

Combinación de platos: un plato principal + 0..N guarniciones. Ej: "Milanesa + Puré".

### Versión (de plato o menú)

Snapshot inmutable del contenido. Cada edición crea una versión nueva; las anteriores nunca se modifican.

### Uso histórico de plato

Registro derivado de la oferta y los pedidos: qué platos se usaron y cuándo. Sirve para sugerencias según clima y uso reciente.

## Modalidades

Dos conceptos distintos que comparten los mismos valores.

### Modalidad de oferta

La que la administración le asigna a una **opción de oferta** (`general` u `opcional`). Define qué lugar ocupa esa opción dentro del día y qué precio especial de cliente aplica. No la elige el cliente.

### Modalidad del pedido

La que queda registrada en `orders.modality`. **No se elige libremente**: `general`/`opcional` la hereda de la opción elegida (la base de datos rechaza una combinación inconsistente), y `media_vianda` es la única que el cliente puede agregar.

### General

Oferta/pedido estándar.

### Opcional

Oferta/pedido alternativo del día. Aplica el precio especial opcional del cliente.

### Media vianda

Modalidad que representa 50% de una vianda completa. **No es** un tipo de plato ni una categoría de producto. Se calcula como `precio normal / 2`. Requiere `allows_half_portion` en el cliente. Puede tomarse de la **oferta del día** (una de sus opciones) o de **cualquier plato o menú del catálogo** (ver `docs/decisiones/20260929-media-vianda-catalogo.md`); el pedido siempre queda atado a un día (`orders.week_day_id`).

## Precios

### Precio base

Precio de una versión concreta de plato o menú.

### Precio especial del cliente

Configuración actual del cliente. Puede ser general, opcional, o por plato específico.

### Precio aplicado

Valor congelado en el momento de crear el pedido. Nunca se recalcula.

### Precedencia de precios

Orden: precio específico por plato > precio general del cliente > precio base.

## Estados y ciclo de vida

### Semana draft

En configuración. No es oferta operativa.

### Semana active

Oferta disponible. Los clientes pueden pedir. Exactamente una a la vez.

### Semana closed

Período terminado. Históricamente inmutable.

### Cliente esperado

Población de clientes congelada al activar una semana. Se usa para calcular "sin responder". No se recalcula después.

### Sin responder

Cliente esperado de una semana que no tiene ni pedido ni cancelación para esa semana.

## Seguridad

### Token personal

Identificador único del cliente contenido en su enlace `/menu/:token`. Se almacena hasheado (SHA-256), nunca en texto plano. No da acceso directo a datos: solo sirve para canjearlo por un JWT.

### JWT de sesión del cliente

Token de corta vida (1 h) con el que el cliente habla con PostgREST. Lo emite la Edge Function `authenticate-client-token` (firma ES256) al recibir un token de enlace válido. Vive en `sessionStorage` de la pestaña y se renueva antes de expirar.

### Rotación de token

Operación que invalida el enlace anterior y genera uno nuevo. El anterior queda inválido inmediatamente; un JWT ya emitido con él sigue válido hasta 1 h.

### Admin

Usuario con cuenta en Supabase Auth autorizado en `private.admin_users`.
