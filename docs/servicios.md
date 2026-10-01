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
| `UNAUTHORIZED`     | Credencial del cliente inválida o expirada (link rotado/vencido).   |
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

| Función         | Firma                                                         | Descripción                                                                                                                                                         |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listWeeks`     | `(params?: WeekListParams) → Promise<WeekListResult>`         | Filtro por `status` + paginación. Ordena por `start_date DESC`.                                                                                                     |
| `getWeek`       | `(weekId) → Promise<Week>`                                    | Una semana.                                                                                                                                                         |
| `getActiveWeek` | `(client?: SupabaseClient<Database>) → Promise<Week \| null>` | Semana activa, o null si no hay. **Acepta un cliente Supabase propio**: se reutiliza desde admin y desde `/menu/:token` (el JWT del cliente define vía RLS qué ve). |
| `createWeek`    | `(input: CreateWeekInput) → Promise<Week>`                    | RPC `create_week`. Crea semana + 5 días en una transacción. Valida lunes-viernes.                                                                                   |
| `updateWeek`    | `(weekId, input: UpdateWeekInput) → Promise<Week>`            | RPC `update_week`. Solo `draft`. **Borra las opciones de oferta existentes** (cascade).                                                                             |
| `activateWeek`  | `(weekId) → Promise<void>`                                    | RPC `activate_week`. Valida oferta completa, congela `week_expected_clients`.                                                                                       |
| `closeWeek`     | `(weekId) → Promise<void>`                                    | RPC `close_week`. `active → closed`. Terminal.                                                                                                                      |
| `deleteWeek`    | `(weekId) → Promise<void>`                                    | `DELETE` directo. Solo funciona en semanas sin operaciones (FK desde orders/cancellations).                                                                         |

### `week-days.service.ts`

| Función        | Firma                            | Descripción                         |
| -------------- | -------------------------------- | ----------------------------------- |
| `listWeekDays` | `(weekId) → Promise<WeekDay[]>`  | 5 días ordenados por `day_of_week`. |
| `getWeekDay`   | `(weekDayId) → Promise<WeekDay>` | Un día.                             |

No existen `createWeekDay` / `updateWeekDay` / `deleteWeekDay`. Los días solo se manejan vía `create_week` y `update_week`.

### `week-offer.service.ts`

| Función           | Firma                                                              | Descripción                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listDayOptions`  | `(weekDayId) → Promise<WeekDayOption[]>`                           | Opciones de un día (incluye `offerModality`).                                                                                                                                           |
| `getWeekOffer`    | `(weekId) → Promise<WeekOffer>`                                    | Todos los días con sus opciones agrupadas. **Usa el cliente Supabase por defecto**: para reutilizarlo en `/menu/:token` hay que parametrizarlo como `getActiveWeek`.                    |
| `addDayOption`    | `(input: AddDayOptionInput) → Promise<WeekDayOption>`              | Discriminated union: `{ optionType: 'dish', dishVersionId }` o `{ optionType: 'menu', menuVersionId }`. `offerModality: 'general' \| 'opcional'` define la modalidad de oferta del día. |
| `updateDayOption` | `(optionId, input: UpdateDayOptionInput) → Promise<WeekDayOption>` | Cambia la versión referenciada y/o `offerModality`. No cambia de dish a menu.                                                                                                           |
| `removeDayOption` | `(optionId) → Promise<void>`                                       | Rechaza si tiene pedidos asociados (trigger).                                                                                                                                           |

### `week-expected-clients.service.ts`

| Función                  | Firma                                           | Descripción                                                        |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------ |
| `getExpectedClients`     | `(weekId) → Promise<WeekExpectedClientsResult>` | Población congelada al activar, con `{ name, phone }` del cliente. |
| `getExpectedClientCount` | `(weekId) → Promise<number>`                    | Solo el conteo (más liviano).                                      |

---

## pedidos

### `orders.service.ts`

| Función          | Firma                                                                               | Descripción                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listOrders`     | `(params: OrderListParams) → Promise<OrderListResult>`                              | Filtros `clientId`, `weekId`, `weekDayId`, `modality` + paginación. Cada item es `OrderDetail` con contexto completo.                                                                                                                                                                                                                          |
| `listAllOrders`  | `(params: Omit<OrderListParams, "page" \| "pageSize">) → Promise<{ items, total }>` | Igual que `listOrders` pero recorre todas las páginas (lotes de 100). Lo usa el listado de Pedidos, que agrupa por cliente y no pagina.                                                                                                                                                                                                        |
| `getOrder`       | `(orderId) → Promise<OrderDetail>`                                                  | Un pedido con contexto.                                                                                                                                                                                                                                                                                                                        |
| `createOrder`    | `(input: CreateOrderInput) → Promise<OrderDetail>`                                  | `CreateOrderInput` es una **unión discriminada**: oferta (`clientId`, `weekDayOptionId`, `modality`) o media vianda de catálogo (`clientId`, `weekDayId`, `dishVersionId`/`menuVersionId`, `modality: 'media_vianda'`). **No** envía `applied_price` (ni `week_day_id`): el trigger los calcula. UNIQUE/índices parciales rechazan duplicados. |
| `updateOrder`    | `(orderId, input: UpdateOrderInput) → Promise<OrderDetail>`                         | Solo `quantity` y `notes`. Resto inmutable.                                                                                                                                                                                                                                                                                                    |
| `deleteOrder`    | `(orderId) → Promise<void>`                                                         | Permitido si la semana no está `closed`.                                                                                                                                                                                                                                                                                                       |
| `getOrderTotals` | `(params: OrderTotalsParams) → Promise<OrderTotals>`                                | `{ orderCount, totalQuantity, totalAmount }` de un conjunto filtrado.                                                                                                                                                                                                                                                                          |

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

### `historical-week-detail.service.ts`

| Función                   | Firma                                      | Descripción                                                                                                                                                                      |
| ------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getHistoricalWeekDetail` | `(weekId) → Promise<HistoricalWeekDetail>` | Una semana con sus días, opciones (resolviendo versiones), pedidos y cancelaciones. Trae **todas** las páginas (no la primera nada más). Vista drill-down de `/admin/historial`. |

---

## auth

### `auth.service.ts`

| Función                | Firma                                | Descripción                                                          |
| ---------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| `getAuthenticatedUser` | `() => Promise<User \| null>`        | Usuario GoTrue actual.                                               |
| `isCurrentUserAdmin`   | `() => Promise<boolean>`             | RPC `is_user_admin`. Solo UX: la barrera real es RLS.                |
| `signInAdmin`          | `(email, password) => Promise<User>` | `signInWithPassword`. Chequea admin y lanza `FORBIDDEN` si no lo es. |
| `signOutAdmin`         | `() => Promise<void>`                | Cierra la sesión GoTrue.                                             |

---

## dashboard

### `dashboard.service.ts`

| Función               | Firma                            | Descripción                                                                                                                                                                                                  |
| --------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getDashboardSummary` | `() → Promise<DashboardSummary>` | Consolida semana activa, totales de pedidos, clientes esperados, sin responder, cancelaciones y conteos de catálogo. Cada bloque con `Promise.allSettled`: si uno falla, el resto del panel sigue sirviendo. |

---

## menu (acceso del cliente)

### `client-auth.service.ts`

| Función                   | Firma                                  | Descripción                                                                                                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authenticateClientToken` | `(linkToken) → Promise<ClientSession>` | Valida el formato (`LINK_TOKEN_PATTERN`), llama a la Edge Function `authenticate-client-token`, persiste la sesión y devuelve `{ accessToken, clientId, expiresAt }`. Lanza `AppError("UNAUTHORIZED")` si el link no sirve y `AppError("DATABASE_ERROR" \| "UNKNOWN_ERROR")` si falla la llamada. |
| `readStoredSession`       | `(linkToken) → ClientSession \| null`  | Síncrono. Lee `sessionStorage` (`todo-artesanal:client-session:v1`). **Devuelve null si el `linkToken` guardado no coincide** (rotación del admin).                                                                                                                                               |
| `storeSession`            | `(session) => void`                    | Síncrono. Guarda `{ linkToken, accessToken, clientId, expiresAt }` en `sessionStorage` de la pestaña.                                                                                                                                                                                             |
| `clearStoredSession`      | `() => void`                           | Síncrono. Borra la sesión (link inválido, rotado o `reauthenticate()`).                                                                                                                                                                                                                           |

No usa `setSession`: el JWT ES256 no tiene usuario GoTrue ni refresh token. El cliente Supabase se crea con `createClientWithToken(accessToken)` (`src/lib/supabase.ts`), y el provider renueva el JWT 60 s antes de expirar.

### `menu-pricing.service.ts`

| Función             | Firma                                                                                 | Descripción                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getEffectivePrice` | `(input: EffectivePriceInput, client?) → Promise<number>`                              | `EffectivePriceInput = { weekDayOptionId?, dishVersionId?, menuVersionId?, modality }`. Llama al RPC `calculate_my_order_price`, que exige **exactamente una** fuente de producto y resuelve la identidad con `private.current_client_id()`. **Solo UX**: el precio definitivo lo congela `validate_order`. |

### `menu-catalog.service.ts`

| Función            | Firma                                     | Descripción                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listClientCatalog` | `(client?) → Promise<CatalogItem[]>`      | Catálogo activo para la media vianda libre. RPC `list_client_catalog` (`security definer`): el RLS de cliente no expone `dishes` / `menus`, así que esa es la única vía. `CatalogItem = { type: 'dish' \| 'menu', productId, versionId, name }`. **No** trae precios. |

---

## RPCs invocados por servicios

| RPC                   | Servicio                | Devuelve  |
| --------------------- | ----------------------- | --------- |
| `create_menu`         | `menus.service`         | `uuid`    |
| `create_menu_version` | `menu-versions.service` | `uuid`    |
| `create_week`         | `weeks.service`         | `uuid`    |
| `update_week`         | `weeks.service`         | `void`    |
| `activate_week`       | `weeks.service`         | `void`    |
| `close_week`          | `weeks.service`         | `void`    |
| `is_user_admin`       | `auth.service`          | `boolean` |
| `calculate_my_order_price` | `menu-pricing.service` | `numeric` |
| `list_client_catalog`      | `menu-catalog.service`  | filas    |

---

## Edge Functions invocadas por servicios

| Edge Function               | Servicio                | Devuelve                                                       |
| --------------------------- | ----------------------- | -------------------------------------------------------------- |
| `rotate-client-token`       | `client-tokens.service` | `{ token: string, clientId: string }`                          |
| `authenticate-client-token` | `client-auth.service`   | `{ accessToken: string, clientId: string, expiresIn: number }` |

---

## Pendientes

- **`getWeekOffer` / `listDayOptions` parametrizables (hecho):** aceptan un
  `SupabaseClient` opcional, como `getActiveWeek`. Igual en `listOrders` /
  `listAllOrders` / `getOrder` / `createOrder` / `updateOrder` /
  `deleteOrder` / `getOrderTotals`, `listCancellations` /
  `getCancellation` / `createCancellation` / `deleteCancellation`,
  `listWeekDays` / `getWeekDay`, `getClient`, `getEffectivePrice` y
  `listClientCatalog`. Es lo que usa `/menu/:token`.
- **Vistas o RPC de reportes:** varios servicios calculan agregados en
  cliente (`dish-usage`, `order-totals`, `history`, `historical-week-detail`
  pagina de a 20). Migrar a vistas o RPC si el volumen crece.
- **Realtime:** sin suscripciones configuradas. Cuando se agregue UI
  cliente, definir tablas a suscribir.
