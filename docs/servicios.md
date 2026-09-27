# Servicios

Catálogo de la capa de servicios: `src/features/*/services/`.

Cada servicio encapsula el acceso a Supabase y expone operaciones tipadas
con manejo de errores uniforme. **La UI nunca toca `supabase` directamente.**

## Convenciones

### Manejo de errores

Todas las funciones lanzan `AppError` ante error. Nunca devuelven
`{ data, error }`. El caller hace `try/catch` o deja propagar.

Códigos de `AppError`:

| Código             | Cuándo                                                              |
| ------------------ | ------------------------------------------------------------------- |
| `VALIDATION_ERROR` | Input inválido (UUID, formato, rango).                              |
| `NOT_FOUND`        | La fila pedida no existe.                                           |
| `CONFLICT`         | UNIQUE violation (23505), FK violation (23503), exclusion (23P01).  |
| `FORBIDDEN`        | RLS policy violada (PGRST301, 42501).                               |
| `BUSINESS_RULE`    | Trigger de dominio rechazó (P0001). Mensaje en español del trigger. |
| `DATABASE_ERROR`   | Otro error de Postgres.                                             |
| `UNKNOWN_ERROR`    | Error no clasificado.                                               |

### Helpers de acceso

Todos los servicios usan los helpers de `src/lib/error-handler.ts`:

- `runSupabase<T>(op)` → `Promise<T | null>`
- `runSupabaseFull<T>(op)` → `Promise<{ data, count, status }>`
- `runSupabaseOrThrow<T>(op)` → `Promise<T>` (lanza `NOT_FOUND` si null)

Con **genéricos explícitos**. La inferencia falla con `PostgrestBuilder`.

### Validación

Los servicios validan **forma**: UUID válido, enumeración correcta,
rango numérico. Las **reglas de negocio** viven en PostgreSQL (triggers,
constraints, funciones).

- `validateUuid(value, fieldName)` antes de usar IDs.
- `escapeIlikePattern(value)` antes de `.or(...ilike...)`.
- `normalizePage` / `normalizePageSize` para paginación.

### Tipos

- Retorno: **tipos de dominio** (`Client`, `Dish`, `Week`), no
  `Tables<'...'>`.
- Mappers `snake_case` (DB) → `camelCase` (app) dentro de cada servicio.
- Inputs: `CreateXInput`, `UpdateXInput`, etc.
- Listados: `XListParams`, `XListResult` (con `items`, `total`, `page`,
  `pageSize`).

### RPCs

Funciones de dominio en PostgreSQL que envuelven operaciones multi-tabla.
Los servicios las invocan con `supabase.rpc(name, { ... })`.

- RPCs que devuelven una fila: `runSupabaseOrThrow`.
- RPCs que devuelven `void`: `runSupabase` (no `runSupabaseOrThrow`,
  porque `data === null` lanzaría `NOT_FOUND`).

---

## clientes

### `clients.service.ts`

| Función           | Firma                                                     | Descripción                                                                                                   |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `listClients`     | `(params?: ClientListParams) → Promise<ClientListResult>` | Listado liviano con búsqueda, filtro por `active`, paginación. Devuelve `items`, `total`, `page`, `pageSize`. |
| `getClient`       | `(clientId: string) → Promise<Client>`                    | Ficha completa.                                                                                               |
| `createClient`    | `(input: CreateClientInput) → Promise<Client>`            | Crea cliente. `allowsHalfPortion` default `false`, `active` default `true`.                                   |
| `updateClient`    | `(clientId, input: UpdateClientInput) → Promise<Client>`  | Actualiza campos. Rechaza si el payload queda vacío.                                                          |
| `setClientActive` | `(clientId, active: boolean) → Promise<Client>`           | Activa/desactiva sin borrar.                                                                                  |
| `deleteClient`    | `(clientId) → Promise<void>`                              | Falla con FK si el cliente tiene historial. Preferir `setClientActive(false)`.                                |

### `client-prices.service.ts`

| Función                    | Firma                                                               | Descripción                                 |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| `getClientPrices`          | `(clientId) → Promise<ClientPrices>`                                | Devuelve `{ general, opcional, products }`. |
| `setClientPrice`           | `(input: SetClientPriceInput) → Promise<ClientPrice>`               | Upsert por `(client_id, modality)`.         |
| `removeClientPrice`        | `(clientId, modality: ClientPriceModality) → Promise<void>`         | Elimina el precio de esa modalidad.         |
| `listClientProductPrices`  | `(clientId) → Promise<ClientProductPrice[]>`                        | Precios especiales por plato.               |
| `setClientProductPrice`    | `(input: SetClientProductPriceInput) → Promise<ClientProductPrice>` | Upsert por `(client_id, dish_id)`.          |
| `removeClientProductPrice` | `(clientId, dishId) → Promise<void>`                                | Elimina el precio del plato.                |

### `client-tokens.service.ts`

| Función                | Firma                                      | Descripción                                                                                                        |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `getActiveTokenStatus` | `(clientId) → Promise<ClientTokenStatus>`  | Devuelve `{ clientId, hasActiveToken }`. No expone el token.                                                       |
| `rotateClientToken`    | `(clientId) → Promise<RotatedClientToken>` | Llama a la Edge Function `rotate-client-token`. Devuelve `{ clientId, token }` con el plaintext **una única vez**. |

---

## platos

### `dishes.service.ts`

| Función         | Firma                                                 | Descripción                                                                                                          |
| --------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `listDishes`    | `(params?: DishListParams) → Promise<DishListResult>` | Búsqueda por nombre de versión + filtros `category`, `climate`, `active` + paginación. Ordena por `created_at DESC`. |
| `getDish`       | `(dishId) → Promise<Dish>`                            | Identidad del plato.                                                                                                 |
| `createDish`    | `(input: CreateDishInput) → Promise<Dish>`            | Crea identidad + versión 1 en una operación con rollback manual.                                                     |
| `updateDish`    | `(dishId, input: UpdateDishInput) → Promise<Dish>`    | Solo `category` y `climate`. Nombre y precio van por nueva versión.                                                  |
| `setDishActive` | `(dishId, active) → Promise<Dish>`                    | Activa/desactiva sin borrar.                                                                                         |
| `deleteDish`    | `(dishId) → Promise<void>`                            | Falla con FK por versiones. Preferir `setDishActive(false)`.                                                         |

### `dish-versions.service.ts`

| Función             | Firma                                                            | Descripción                                                       |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `listDishVersions`  | `(dishId) → Promise<DishVersion[]>`                              | Ordenadas por `version_number DESC`.                              |
| `getDishVersion`    | `(versionId) → Promise<DishVersion>`                             | Una versión.                                                      |
| `createDishVersion` | `(dishId, input: CreateDishVersionInput) → Promise<DishVersion>` | Calcula MAX + 1. Race condition teórica, UNIQUE evita corrupción. |

No existen `updateDishVersion` ni `deleteDishVersion`: las versiones son inmutables por trigger.

### `dish-usage.service.ts`

| Función              | Firma                                                               | Descripción                                                       |
| -------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `getDishUsage`       | `(dishId, params?: DishUsageParams) → Promise<DishUsage>`           | Total de días únicos en que el plato fue ofrecido + `lastUsedAt`. |
| `getRecentDishUsage` | `(params?: RecentDishUsageParams) → Promise<RecentDishUsageItem[]>` | Platos ordenados por último uso descendente.                      |
| `getDishSuggestions` | `(params: DishSuggestionParams) → Promise<DishSuggestionItem[]>`    | Filtra activos + clima + excluye recientes. Sin scoring.          |

---

## menus

### `menus.service.ts`

| Función         | Firma                                                        | Descripción                                                                                                                            |
| --------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `listMenus`     | `(params?: MenuListParams) → Promise<MenuListResult>`        | Búsqueda por nombre de versión + filtro `active` + paginación. Cada item incluye `itemCount` (cantidad de items de la última versión). |
| `getMenu`       | `(menuId) → Promise<MenuWithCurrentVersion>`                 | Identidad + versión actual completa.                                                                                                   |
| `createMenu`    | `(input: CreateMenuInput) → Promise<MenuWithCurrentVersion>` | RPC `create_menu`. Identidad + versión 1 + items en una transacción.                                                                   |
| `setMenuActive` | `(menuId, active) → Promise<Menu>`                           | Activa/desactiva.                                                                                                                      |
| `deleteMenu`    | `(menuId) → Promise<void>`                                   | Falla con FK por versiones. Preferir `setMenuActive(false)`.                                                                           |

### `menu-versions.service.ts`

| Función                | Firma                                                            | Descripción                                                         |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `listMenuVersions`     | `(menuId) → Promise<MenuVersionSummary[]>`                       | Sin items. Ordenadas por `version_number DESC`.                     |
| `getMenuVersion`       | `(versionId) → Promise<MenuVersion>`                             | Versión completa con items enriquecidos.                            |
| `getLatestMenuVersion` | `(menuId) → Promise<MenuVersion \| null>`                        | Última versión completa, o null si no tiene versiones.              |
| `createMenuVersion`    | `(menuId, input: CreateMenuVersionInput) → Promise<MenuVersion>` | RPC `create_menu_version`. Crea versión + items en una transacción. |

---

## semanas

### `weeks.service.ts`

| Función         | Firma                                                 | Descripción                                                                             |
| --------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `listWeeks`     | `(params?: WeekListParams) → Promise<WeekListResult>` | Filtro por `status` + paginación. Ordena por `start_date DESC`.                         |
| `getWeek`       | `(weekId) → Promise<Week>`                            | Una semana.                                                                             |
| `getActiveWeek` | `() → Promise<Week \| null>`                          | Semana activa, o null si no hay.                                                        |
| `createWeek`    | `(input: CreateWeekInput) → Promise<Week>`            | RPC `create_week`. Crea semana + 5 días en una transacción. Valida lunes-viernes.       |
| `updateWeek`    | `(weekId, input: UpdateWeekInput) → Promise<Week>`    | RPC `update_week`. Solo `draft`. **Borra las opciones de oferta existentes** (cascade). |
| `activateWeek`  | `(weekId) → Promise<void>`                            | RPC `activate_week`. Valida oferta completa, congela `week_expected_clients`.           |
| `closeWeek`     | `(weekId) → Promise<void>`                            | RPC `close_week`. `active → closed`. Terminal.                                          |
| `deleteWeek`    | `(weekId) → Promise<void>`                            | `DELETE` directo. Solo funciona en semanas sin operaciones (FK desde orders/cancellations). |

### `week-days.service.ts`

| Función        | Firma                            | Descripción                         |
| -------------- | -------------------------------- | ----------------------------------- |
| `listWeekDays` | `(weekId) → Promise<WeekDay[]>`  | 5 días ordenados por `day_of_week`. |
| `getWeekDay`   | `(weekDayId) → Promise<WeekDay>` | Un día.                             |

No existen `createWeekDay` / `updateWeekDay` / `deleteWeekDay`. Los días solo se manejan vía `create_week` y `update_week`.

### `week-offer.service.ts`

| Función           | Firma                                                              | Descripción                                                                                             |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `listDayOptions`  | `(weekDayId) → Promise<WeekDayOption[]>`                           | Opciones de un día.                                                                                     |
| `getWeekOffer`    | `(weekId) → Promise<WeekOffer>`                                    | Todos los días con sus opciones agrupadas.                                                              |
| `addDayOption`    | `(input: AddDayOptionInput) → Promise<WeekDayOption>`              | Discriminated union: `{ optionType: 'dish', dishVersionId }` o `{ optionType: 'menu', menuVersionId }`. |
| `updateDayOption` | `(optionId, input: UpdateDayOptionInput) → Promise<WeekDayOption>` | Cambia la versión referenciada. No cambia de dish a menu.                                               |
| `removeDayOption` | `(optionId) → Promise<void>`                                       | Rechaza si tiene pedidos asociados (trigger).                                                           |

### `week-expected-clients.service.ts`

| Función                  | Firma                                           | Descripción                                                        |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------ |
| `getExpectedClients`     | `(weekId) → Promise<WeekExpectedClientsResult>` | Población congelada al activar, con `{ name, phone }` del cliente. |
| `getExpectedClientCount` | `(weekId) → Promise<number>`                    | Solo el conteo (más liviano).                                      |

---

## pedidos

### `orders.service.ts`

| Función          | Firma                                                       | Descripción                                                                                                           |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `listOrders`     | `(params: OrderListParams) → Promise<OrderListResult>`      | Filtros `clientId`, `weekId`, `weekDayId`, `modality` + paginación. Cada item es `OrderDetail` con contexto completo. |
| `getOrder`       | `(orderId) → Promise<OrderDetail>`                          | Un pedido con contexto.                                                                                               |
| `createOrder`    | `(input: CreateOrderInput) → Promise<OrderDetail>`          | **No** envía `applied_price`; el trigger lo calcula. UNIQUE triplete rechaza duplicados.                              |
| `updateOrder`    | `(orderId, input: UpdateOrderInput) → Promise<OrderDetail>` | Solo `quantity` y `notes`. Resto inmutable.                                                                           |
| `deleteOrder`    | `(orderId) → Promise<void>`                                 | Permitido si la semana no está `closed`.                                                                              |
| `getOrderTotals` | `(params: OrderTotalsParams) → Promise<OrderTotals>`        | `{ orderCount, totalQuantity, totalAmount }` de un conjunto filtrado.                                                 |

---

## cancelaciones

### `cancellations.service.ts`

| Función              | Firma                                                                | Descripción                                                                    |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `listCancellations`  | `(params: CancellationListParams) → Promise<CancellationListResult>` | Filtros `clientId`, `weekId`, `weekDayId` + paginación. Cada item enriquecido. |
| `getCancellation`    | `(cancellationId) → Promise<Cancellation>`                           | Una cancelación con contexto.                                                  |
| `createCancellation` | `(input: CreateCancellationInput) → Promise<Cancellation>`           | Rechaza si el cliente ya tiene pedido ese día (trigger). UNIQUE (client, day). |
| `deleteCancellation` | `(cancellationId) → Promise<void>`                                   | Permitido si la semana no está `closed`.                                       |

No existe `updateCancellation`: es un hecho histórico inmutable.

---

## historial

### `history.service.ts`

| Función                | Firma                                                                           | Descripción                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listHistoricalWeeks`  | `(params?: HistoricalWeekParams) → Promise<HistoricalWeekListResult>`           | Semanas `closed` con agregados: pedidos, cantidades, montos, cancelaciones, esperados, sin responder. Filtros `fromDate` / `toDate`.                                      |
| `getClientHistory`     | `(clientId, params?: ClientHistoryParams) → Promise<ClientHistoryResult>`       | Pedidos y cancelaciones del cliente agrupados por semana. Incluye semanas `active` y `closed`. Filtros `fromDate` / `toDate`. Paginación sobre semanas, no sobre pedidos. |
| `getUnansweredClients` | `(weekId, params?: UnansweredClientsParams) → Promise<UnansweredClientsResult>` | Clientes esperados sin pedido ni cancelación. Parte de `week_expected_clients`, no de `clients.active`.                                                                   |

---

## RPCs invocados por servicios

| RPC                   | Servicio                | Devuelve |
| --------------------- | ----------------------- | -------- |
| `create_menu`         | `menus.service`         | `uuid`   |
| `create_menu_version` | `menu-versions.service` | `uuid`   |
| `create_week`         | `weeks.service`         | `uuid`   |
| `update_week`         | `weeks.service`         | `void`   |
| `activate_week`       | `weeks.service`         | `void`   |
| `close_week`          | `weeks.service`         | `void`   |

---

## Edge Functions invocadas por servicios

| Edge Function         | Servicio                | Devuelve                              |
| --------------------- | ----------------------- | ------------------------------------- |
| `rotate-client-token` | `client-tokens.service` | `{ token: string, clientId: string }` |

---

## Pendientes

- **Emisión de JWT para clientes:** falta la Edge Function que valida el token personal (hash) y emite un JWT con claim `client_id`. Sin ella, `/menu/:token` no puede operar contra Supabase con las policies de cliente actuales.
- **Vistas o RPC de reportes:** varios servicios calculan agregados en cliente (`dish-usage`, `order-totals`, `history`). Migrar a vistas o RPC si el volumen crece.
- **Realtime:** sin suscripciones configuradas. Cuando se agregue UI, definir tablas a suscribir.
