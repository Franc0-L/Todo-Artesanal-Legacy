# Todo Artesanal v2 — Estado de Fases 1–6

## Propósito

Documento de **estado real y actual** del proyecto: decisiones aprobadas,
qué está implementado, inventario de migraciones/servicios/UI y pendientes.
Sirve para arrancar un chat nuevo sin repetir el análisis previo.

> Última actualización: **2026-10-01**.
> Fuente de verdad: el código y `supabase/migrations/`. Si este documento
> discrepa de ellos, corregir **este documento**.

---

# Fase 1 — Reglas de negocio e invariantes

## Dominio general

- `semana = oferta común para todos los clientes`
- `semana ≠ cliente`
- `semana.status = draft | active | closed`
- `semana.closed = históricamente protegida`
- `oferta semanal = configuración de la semana`
- `opción de oferta = unidad seleccionable dentro de un día concreto`
- `opción de oferta puede ser = menú compuesto | plato individual | futura unidad`
- `menú = un plato principal + 0..N guarniciones`
- `media_vianda = modalidad de pedido, nunca categoría ni tipo de plato`
- `modalidad = general | opcional | media_vianda`

> Actualización (2026-09-26): `general`/`opcional` ahora son **modalidades
> de oferta** definidas por la administración por día; en el pedido las
> hereda la opción elegida y solo `media_vianda` es seleccionable. Ver
> Fase 4B.

## Pedidos

- `pedido = cliente + semana + día + opción de oferta + modalidad + cantidad + precio aplicado`
- `quantity = cantidad de unidades de la modalidad/opción`
- `applied_price = precio unitario histórico aplicado`
- `monto del pedido = quantity × applied_price`
- `pedido histórico = no se reinterpreta mediante configuración actual`

## Precios

- `precio base = pertenece a versión inmutable del plato o menú`
- `precio especial del cliente = configuración actual del cliente`
- `precio aplicado = queda congelado en el pedido`
- `precio histórico ≠ precio actual`
- `precedencia precio normal = específico por plato > general del cliente > precio base`
- `media_vianda = 50% del precio normal aplicable`
- `media_vianda no tiene precio especial propio`
- `client_prices = general + opcional`
- `client_product_prices = solo platos`

## Clientes

- `clients.active = estado actual`
- `cliente inactivo = no elimina ni invalida historial`
- `cuidado especial = configuración actual del cliente`
- `observaciones del cliente = configuración general`
- `order.notes = observación específica del pedido`

## Catálogo

- `plato.categoría = atributo del plato`
- `plato.clima = atributo del plato`
- `versión de plato/menú = inmutable`
- `nueva versión = cada edición`
- `semana histórica = referencia a versión inmutable, no snapshot completo`

## Historial

- `hechos históricos = conservan el contexto necesario`
- `pedido histórico = conserva precio aplicado`
- `cancelación histórica = conserva contexto necesario`
- `sin responder = se determina respecto de la semana correspondiente`
- `cancelación = respuesta del cliente`
- `cancelación = afecta el día completo`
- `una cancelación = por cliente + día`
- `pedido y cancelación = no coexisten para el mismo cliente + día`

## Clientes esperados

- `week_expected_clients = población esperada para una semana`
- `week_expected_clients = se congela cuando la semana pasa a active`
- `sin responder = esperado sin pedido y sin cancelación`
- `cliente que canceló = respondió`

## Tokens

- `acceso cliente = mediante token`
- `token almacenado = hash, nunca valor completo`
- `token anterior al rotar = inmediatamente inválido`
- `historial de tokens = se conserva`
- `token vigente máximo = uno por cliente`

> Actualización (2026-09-27): el token del enlace ya no es la credencial
> directa. Se canjea por un **JWT ES256 de 1 h** (`authenticate-client-token`)
> que es lo que habla con PostgREST. Rotar el enlace **no** revoca un JWT
> ya emitido. Ver Fase 5A y Fase 6.

## Seguridad

- `seguridad = backend/RLS + restricciones DB`
- `cliente = solo puede acceder/modificar sus propios datos permitidos`
- `frontend = no es frontera de seguridad`

## Invariantes

Las 11 invariantes originales de §36 permanecen vigentes.

Extensión propuesta y aprobada de las invariantes de §36:

- `invariante 12 = las cancelaciones conservan su contexto histórico`
- `invariante 13 = sin responder se determina respecto de la semana correspondiente`
- `invariante 14 = la oferta semanal es común; las diferencias individuales pertenecen a configuración/pedido`
- `invariante 15 = los hechos históricos no se reinterpretan mediante datos actuales`

---

# Fase 2 — Modelo conceptual

## Semana y oferta

- `semana + oferta = una sola entidad conceptual`
- `semana = período operativo + oferta`
- `semana → día → opciones de oferta`
- `opción de oferta = existe en contexto de (semana, día)`

## Días

- `día de semana = valor asociado al día dentro de una semana`
- `día de semana = no es entidad independiente`
- `day_of_week = 1..5`
- `1 = lunes`
- `5 = viernes`
- `fines de semana = no forman parte del dominio actual`

## Opciones de oferta

- `opción de oferta ≠ menú`
- `opción de oferta = abstracción seleccionable`
- `opción de oferta actual = plato o menú`
- `futura unidad de oferta = puede incorporarse mediante evolución explícita`

## Versionado

- `estrategia histórica = versiones inmutables`
- `cada edición = nueva versión`
- `versión anterior = nunca se modifica`
- `semana histórica = apunta a versión concreta`
- `precio base = forma parte de la versión`
- `cambio de precio base = nueva versión`

## Cliente

- `cliente = configuración actual`
- `cliente = datos + contacto + dirección + cuidado especial + observaciones + estado + precios + acceso`

## Pedido

- `pedido = cliente + semana + día + opción de oferta o producto de catálogo (solo media vianda) + modalidad + cantidad + precio aplicado`
- `varios pedidos por día = permitidos salvo idénticos (mismo cliente + opción/producto + modalidad)`
- `quantity = unidades`
- `applied_price = unitario`
- `pedido histórico = independiente de cambios posteriores`

## Cancelación

- `cancelación = hecho propio`
- `cancelación = cliente + día`
- `cancelación = día completo`
- `cancelación = respuesta`

## Token

- `token = identidad de acceso del cliente`
- `token = hash`
- `token rotado = invalidación estricta`
- `tokens anteriores = historial`

---

# Fase 3 — Modelo PostgreSQL

## Entidades principales

- `clients = clientes actuales`
- `dishes = identidad lógica de platos`
- `dish_versions = versiones inmutables de platos`
- `menus = identidad lógica de menús`
- `menu_versions = versiones inmutables de menús`
- `menu_version_items = composición de una versión de menú`
- `weeks = período + estado`
- `week_days = día concreto dentro de una semana`
- `week_day_options = opción disponible para un día`
- `week_expected_clients = clientes esperados para la semana`
- `client_prices = precios generales especiales`
- `client_product_prices = precios especiales por plato`
- `client_tokens = historial de tokens`
- `orders = pedidos`
- `cancellations = cancelaciones`

## Versiones

- `dish_versions.price = precio base`
- `menu_versions.price = precio base`
- `dish_versions = inmutables`
- `menu_versions = inmutables`
- `cada edición = nueva versión`
- `version histórica = nunca se sobrescribe`

## Menús

- `menu_version = exactamente 1 main + 0..N side`
- `main = plato principal`
- `side = guarnición`

## Opciones de día

- `week_day_options = pertenece a un week_day`
- `offer_option_type = flexible mediante text + CHECK`
- `tipo actual de opción = dish | menu`
- `opción = exactamente una fuente actual`
- `dish_version_id XOR menu_version_id`

## Clientes esperados

- `week_expected_clients PK = (week_id, client_id)`
- `población esperada = congelada al activar semana`
- `clients.active = no reemplaza week_expected_clients`

## Precios especiales

- `client_prices = general + opcional`
- `client_prices.media_vianda = no existe`
- `client_product_prices = solo platos`
- `precedencia = precio específico por plato > precio general > precio base`
- `media_vianda = precio normal aplicable / 2`

## Pedidos

- `orders.applied_price = numeric(10,2)`
- `orders.applied_price = unitario`
- `orders.quantity = entero positivo`
- `pedido.total = quantity × applied_price`
- `UNIQUE parcial = (client_id, week_day_option_id, modality) donde hay opción de oferta; (client_id, week_day_id, dish_version_id / menu_version_id, modality) para media vianda de catálogo`
- `order.notes = nota específica del pedido`

> Nota: la unicidad es por combinación idéntica (cliente + opción/producto + modalidad), no "una única selección" por día: un día admite varios pedidos distintos.

## Cancelaciones

- `UNIQUE = (client_id, week_day_id)`
- `cancelación = día completo`
- `cancelación + pedido del mismo cliente/día = no permitido`
- `cancelación = cuenta como respuesta`

## Semanas

- `week.status = draft | active | closed`
- `active = máximo una semana`
- `weeks con rangos solapados = no permitidos`
- `week_day.day_of_week = 1..5`

## Tokens

- `token_hash = único`
- `token = nunca almacenado en texto plano`
- `invalidated_at = NULL mientras vigente`
- `máximo un token vigente por cliente`
- `token histórico = permanece registrado`

## Índices requeridos

- `week_day_options(dish_version_id) = requerido para uso histórico`
- `week_day_options(menu_version_id) = requerido para uso histórico`
- `week_days(week_id) = índice`
- `week_expected_clients(client_id) = índice`
- `orders(client_id) = índice`
- `orders(week_day_option_id) = índice`
- `cancellations(client_id) = índice`
- `cancellations(week_day_id) = índice`
- `client_tokens(client_id) = índice`
- `dish_versions(dish_id) = índice`
- `menu_versions(menu_id) = índice`
- `menu_version_items(menu_version_id) = índice`

---

# Fase 4 — decisiones cerradas

## Tipos y CHECKs

- `weeks.status = text + CHECK (draft | active | closed)`
- `week_day_options.option_type = text + CHECK (dish | menu)`
- `week_day_options.offer_modality = text + CHECK (general | opcional)` (agregado en 2026-09-26, ver Fase 4B)
- `menu_version_items.role = text + CHECK (main | side)`
- `orders.modality = text + CHECK (general | opcional | media_vianda)`
- `client_prices.modality = text + CHECK (general | opcional)`
- `dishes.climate = text nullable, CHECK (frio | templado | calor)`
- `dishes.category = text libre, sin CHECK (taxonomía no cerrada)`
- `climate: NULL = ausencia de preferencia, no "cualquiera"`

## Catálogo

- `categoría y clima = atributos del plato (dishes), no de su versión`
- `dish_versions = nombre, price, version_number`
- `menu_versions = nombre, price, version_number`
- `dishes.active / menus.active = boolean not null default true, estado actual, no versionado`
- `dish_versions.version_number = obligatorio, CHECK > 0`
- `menu_versions.version_number = obligatorio, CHECK > 0`
- `dish_versions UNIQUE (dish_id, version_number)`
- `menu_versions UNIQUE (menu_id, version_number)`

## Menú items

- `menu_version_items: UNIQUE (menu_version_id, dish_version_id)`
- `menu_version_items: partial unique WHERE role='main'` (máximo 1 main)
- `menu_version_items: minimum 1 main = constraint trigger diferible`
  (implementado en `02_triggers.sql`)

## Semanas y días

- `weeks.no_overlap = EXCLUDE gist daterange [start_date, end_date]`
- `weeks.one_active = partial unique index WHERE status='active'`
- `week_days.date = materializado`
- `week_days.date = CHECK coherencia con day_of_week (extract isodow)`
- `week_days UNIQUE (week_id, day_of_week)`
- `week_days UNIQUE (week_id, date)`

## Tokens

- `client_tokens.invalidated_at >= created_at = CHECK`

## Pedidos y cancelaciones

- `orders.quantity = integer not null default 1, CHECK > 0`
- `orders.applied_price = numeric(10,2) CHECK >= 0`
- `orders.notes = nullable`
- `cancellations: UNIQUE (client_id, week_day_id)`

## Ajuste aplicado a schema-v1.sql

- `clients.allows_half_portion = boolean not null default false`
  - Habilita la modalidad media_vianda por cliente.
  - Default false: la posibilidad se habilita por cliente.
  - `calculate_order_price` valida este flag cuando modality = media_vianda.

## Semántica de orders

- `orders INSERT: applied_price = calculado desde calculate_order_price`
  (se ignora cualquier valor que mande el cliente)
- `orders UPDATE: solo quantity y notes son editables`
- `orders UPDATE: applied_price inmutable post-creación`
- `orders UPDATE: client_id / week_day_option_id / modality no editables`
  - Para cambiar esos campos: DELETE + INSERT
- `orders DELETE: permitido mientras la semana no esté closed`

## week_day_options — congelamiento post-pedido

- `week_day_options UPDATE: rechazar si la opción ya tiene pedidos asociados`
- `week_day_options DELETE: rechazar si la opción ya tiene pedidos asociados`
- Fundamento: cierra gap de invariante #15 dentro de semanas active.
  Si un pedido ya se hizo contra una opción, esa opción queda congelada.
  Sin pedidos, sigue editable/borrable.

## Seguridad

- `private.admin_users = creada en 03_rls.sql`
  (la tabla, no el contenido)
- `private.is_admin() = security definer, lee auth.uid() contra admin_users`
- `private.current_client_id() = security definer, lee auth.jwt() ->> 'client_id'`
  - Devuelve NULL si el claim no existe o no es UUID válido (defensiva).
- `public.is_user_admin(p_user_id) = security definer, RPC público para que
la Edge Function verifique admins sin acceder al schema private`
- `RLS habilitado en las 15 tablas públicas + admin_users`
- `policies admin = FOR ALL en todas las tablas, con is_admin()`
- `policies cliente = según checklist (ver abajo)`
- `cliente NO accede a: client_tokens, week_expected_clients, dishes, menus`
- `service_role grants defensivos = usage schema + all tables + all functions
  - usage private + select admin_users`
- `primer admin = INSERT manual en 04_admin_setup.sql`

## Checklist de policies de cliente

Cliente SÍ accede:

- `clients → SELECT propio`
- `weeks → SELECT active`
- `week_days → SELECT de semanas active`
- `week_day_options → SELECT de semanas active`
- `dish_versions → SELECT usadas en oferta active`
- `menu_versions → SELECT usadas en oferta active`
- `menu_version_items → SELECT de versiones usadas en oferta active`
- `orders → SELECT/INSERT/UPDATE propio (sin DELETE)`
- `cancellations → SELECT/INSERT/UPDATE propio (sin DELETE)`
- `client_prices → SELECT propio`
- `client_product_prices → SELECT propio`

Cliente NO accede (sin policy):

- `client_tokens`
- `week_expected_clients`
- `dishes`
- `menus`

Nota: cliente no puede filtrar por `dishes.category` ni `dishes.climate`.
Si en el futuro se necesitan filtros, agregar policy sobre `dishes`.

## Ciclo de vida de la semana

- `activate_week(week_id) = draft → active`
  - Valida admin, semana draft, no otra active, 5 días,
    cada día con al menos una opción, cada menu_version con exactamente
    1 main.
  - Congela `week_expected_clients` con `clients.active = true`.
  - Usa variable de sesión `todo_artesanal.allow_week_transition`
    (set_config con is_local = true) para autorizar el UPDATE.
- `close_week(week_id) = active → closed` (terminal)
- `trigger BEFORE UPDATE ON weeks` bloquea cambios directos de status.

## Inmutabilidad

- `dish_versions: rechazar UPDATE/DELETE` (trigger)
- `menu_versions: rechazar UPDATE/DELETE` (trigger)
- `weeks closed: rechazar INSERT/UPDATE/DELETE sobre week_days,
week_day_options, orders, cancellations de esa semana`

---

# Fase 4B — Decisiones posteriores (2026-09-26)

## General y Opcional son modalidades de oferta, no del pedido

Detalle completo en `docs/decisiones/20260926-oferta-general-opcional.md`.

- `week_day_options.offer_modality = general | opcional`, definida por
  administración al configurar cada día.
- `UNIQUE (week_day_id, offer_modality)`: por día existe una oferta General
  y una Opcional, nunca dos de la misma.
- `activate_week` exige que los 5 días tengan ambas modalidades.
- Al crear un pedido, `general`/`opcional` **no lo elige el cliente**: la
  modalidad la determina `week_day_options.offer_modality` de la opción
  elegida. El trigger `private.validate_order` garantiza esa
  consistencia **normalizando** (`new.modality := offer_modality`):
  - `media_vianda` se conserva tal cual (no es modalidad de oferta).
  - En la práctica tampoco se nota: el `OrderDrawer` admin envía siempre
    `modality` derivado de `selectedOption.offerModality`.
- La única modalidad seleccionable en el pedido es `media_vianda` (más la
  que la opción ya determina).
- `client_prices.modality` sigue siendo `general | opcional`: es precio
  del cliente, concepto distinto de la modalidad de oferta.

## Producto único por semana

- Un mismo plato o menú lógico no puede aparecer en dos días distintos de
  una misma semana.
- La identidad se toma desde `dish_versions.dish_id` /
  `menu_versions.menu_id`, no desde la versión concreta.
- Implementado con el trigger
  `trg_validate_week_day_option_product_uniqueness` →
  `public.validate_week_day_option_product_uniqueness()`
  (advisory lock transaccional por semana) **y** un chequeo agregado en
  `activate_week` (ambos presentes en la cadena consolidada).


---

# Fase 5 — Implementación backend (completa)

## Fase 5A — Migraciones

La cadena es **6 archivos por responsabilidad** (consolidada el 2026-10-02;
inventario en "Archivos SQL generados", al final):

| Archivo                            | Responsabilidad                                |
| ---------------------------------- | ---------------------------------------------- |
| `20261002000001_schema`            | schemas, tablas, constraints, índices, RLS     |
| `20261002000002_functions_private` | funciones de `private` (helpers + trigger fns) |
| `20261002000003_triggers`          | triggers de dominio                            |
| `20261002000004_rls`               | policies                                        |
| `20261002000005_rpc_admin`         | RPCs de admin/catálogo/precio interno           |
| `20261002000006_rpc_client`        | RPCs de cliente (`security definer`)            |

- Proyecto Supabase: `Todo-Artesanal` (linkeado).
- 15 tablas en `public` + `private.admin_users` en `private`.
- Funciones públicas: `calculate_order_price`,
  `calculate_catalog_media_vianda_price`, `calculate_my_order_price`,
  `activate_week`, `close_week`, `create_menu`, `create_menu_version`,
  `create_week`, `update_week`, `is_user_admin`, `list_client_catalog`,
  `validate_week_day_option_product_uniqueness`.
- Funciones privadas: `private.is_admin`, `private.current_client_id`,
  `private.validate_order`, `private.enforce_client_day_cutoff`,
  `private.default_week_day_cutoff` y las de inmutabilidad/uniqueness.
- Edge Functions deployadas: `rotate-client-token`, `authenticate-client-token`.
- 1 admin creado en `private.admin_users`.
- El historial de la reconciliación local/remoto (2026-09-27) quedó en
  `docs/historico/20260927-local-fuente-de-verdad.md`.

## Fase 5B — Tipos y helpers

- `src/types/database.ts` — generado con `npx supabase gen types typescript --linked`.
- `src/types/domain.ts` — tipos transversales:
  - `Modality = 'general' | 'opcional' | 'media_vianda'`
  - `ClientPriceModality = 'general' | 'opcional'`
  - `WeekStatus = 'draft' | 'active' | 'closed'`
  - `MenuItemRole = 'main' | 'side'`
  - `OptionType = 'dish' | 'menu'`
  - `Climate = 'frio' | 'templado' | 'calor'`
  - `DayOfWeek = 1 | 2 | 3 | 4 | 5`
- `src/lib/supabase.ts` — cliente Supabase inicializado.
- `src/lib/errors.ts` — `AppError` + `isAppError`.
- `src/lib/error-handler.ts` — `runSupabase`, `runSupabaseFull`, `runSupabaseOrThrow`, `toAppError`.
- `src/lib/formatters.ts` — `formatCurrency`, `formatDate`, `formatDateRange`.
- `src/vite-env.d.ts` — declaración de `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

## Fase 5C — Servicios (completa)

### Patrón establecido

- Manejo de errores: `throw AppError`, nunca `return { data, error }`.
- Helpers de acceso a Supabase:
  - `runSupabase<T>` → `T | null`
  - `runSupabaseFull<T>` → `{ data, count, status }`
  - `runSupabaseOrThrow<T>` → `T` (falla con NOT_FOUND si null)
  - Todos aceptan `() => PromiseLike<SupabaseResult<T>>`.
- Genéricos explícitos en cada llamada. La inferencia no funciona con `PostgrestBuilder`.
- Validación manual de inputs con `AppError` (sin Zod).
- `validateUuid` con regex antes de usar IDs.
- `escapeIlikePattern` antes de `.or(...ilike...)`.
- Mappers snake_case (DB) → camelCase (app).
- Retorno tipos de dominio, no `Tables<'...'>`.
- Uso de `Tables<>`, `TablesInsert<>`, `TablesUpdate<>` de `database.ts`.
- `deleteX` documenta advertencias de FK.
- RPCs que devuelven `void` usan `runSupabase` (no `runSupabaseOrThrow`).

### Servicios implementados

**clientes/**

- `clients.service.ts`: listClients, getClient, createClient, updateClient, setClientActive, deleteClient.
- `client-prices.service.ts`: getClientPrices, setClientPrice, removeClientPrice, listClientProductPrices, setClientProductPrice, removeClientProductPrice.
- `client-tokens.service.ts`: getActiveTokenStatus, rotateClientToken (llama Edge Function rotate-client-token).

**platos/**

- `dishes.service.ts`: listDishes, getDish, createDish (identidad + versión 1 con rollback manual), updateDish, setDishActive, deleteDish.
- `dish-versions.service.ts`: listDishVersions, getDishVersion, createDishVersion.
- `dish-usage.service.ts`: getDishUsage, getRecentDishUsage, getDishSuggestions.

**menus/**

- `menus.service.ts`: listMenus, getMenu, createMenu (RPC create_menu), setMenuActive, deleteMenu.
- `menu-versions.service.ts`: listMenuVersions, getMenuVersion, getLatestMenuVersion, createMenuVersion (RPC create_menu_version).

**semanas/**

- `weeks.service.ts`: listWeeks, getWeek, getActiveWeek(client?), createWeek (RPC create_week), updateWeek (RPC update_week), activateWeek (RPC activate_week), closeWeek (RPC close_week).
  - `getActiveWeek(client = supabase)` acepta un cliente Supabase propio: se usa igual desde admin (JWT de Auth) y desde `/menu/:token` (JWT ES256 de cliente). RLS decide qué filas ve.
- `week-days.service.ts`: listWeekDays, getWeekDay, updateWeekDayCutoff (única
  edición de días: el corte de horario; no recrea días ni toca opciones).
- `week-offer.service.ts`: listDayOptions, getWeekOffer, addDayOption, updateDayOption, removeDayOption.
  - `addDayOption` / `updateDayOption` aceptan `offerModality: 'general' | 'opcional'` (`AddDayOptionInput` discrimina por `optionType`).
- `week-expected-clients.service.ts`: getExpectedClients, getExpectedClientCount.

**pedidos/**

- `orders.service.ts`: listOrders, getOrder, createOrder, updateOrder, deleteOrder, getOrderTotals.
  - `orders.modality` **no la valida el service**: la garantiza el trigger
    `private.validate_order` contra `week_day_options.offer_modality`
    (normaliza en local y en remoto — ver Fase 4B). El service solo
    valida forma.

**cancelaciones/**

- `cancellations.service.ts`: listCancellations, getCancellation, createCancellation, deleteCancellation.

**auth/**

- `auth.service.ts`: getAuthenticatedUser, isCurrentUserAdmin (RPC `is_user_admin`), signInAdmin, signOutAdmin.

**dashboard/**

- `dashboard.service.ts`: getDashboardSummary (consolida semana activa, totales de pedidos, clientes esperados, sin responder, cancelaciones y conteos de catálogo; todo con `Promise.allSettled` para que un bloque no tire abajo el panel).

**historial/**

- `history.service.ts`: listHistoricalWeeks, getClientHistory, getUnansweredClients.
- `historical-week-detail.service.ts`: getHistoricalWeekDetail (semana + días + opciones + pedidos + cancelaciones, para la vista drill-down).

**menu/** (acceso del cliente)

- `client-auth.service.ts`: authenticateClientToken (link → JWT vía Edge Function), readStoredSession, storeSession, clearStoredSession (sesión en `sessionStorage`, clave `todo-artesanal:client-session:v1`).
  - La clave guarda `{ linkToken, accessToken, clientId, expiresAt }`: si el admin rota el link, la sesión vieja deja de servir.

### Edge Functions implementadas

**rotate-client-token/**

- Recibe `{ clientId: uuid }` por POST.
- Requiere JWT de admin en `Authorization: Bearer <jwt>`.
- Verifica admin vía RPC público `is_user_admin`.
- Invalida el token vigente del cliente (`invalidated_at = now()`).
- Genera token random de 32 bytes (base64url).
- Persiste SHA-256 del token en `client_tokens.token_hash`.
- Devuelve `{ token: plaintext, clientId }`.
- El plaintext se devuelve una única vez, nunca se persiste.
- Variables de entorno inyectadas por Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Usa `service_role` internamente para operar sobre `client_tokens` (que no tiene policy de cliente).

**authenticate-client-token/**

- Recibe `{ token: string }` por POST. Sin `Authorization`: el propio link token es la credencial.
- `verify_jwt = false` en `supabase/config.toml` (si no, el anon token del navegador bloquearía la llamada).
- Busca `token_hash` (SHA-256) en `client_tokens`; exige `invalidated_at IS NULL`. Los tokens no caducan solos: solo se invalidan al rotar (no existe `expires_at`).
- Devuelve un **JWT ES256** con `client_id` como claim (lo lee `private.current_client_id()`); `sub` se omite a propósito (no hay fila en `auth.users` que impersonar, así que `auth.uid()` da null).
- Firma con `CLIENT_JWT_PRIVATE_KEY_JWK` + `CLIENT_JWT_KID` (secrets) contra la signing key subida con `supabase gen signing-key --algorithm ES256`. `SUPABASE_JWT_SECRET` no sirve: es HS256.
- TTL 1 hora. Rotar el link invalida el `token` del enlace, pero **no** revoca un JWT ya emitido (ver `docs/adr/004-jwt-custom-para-clientes.md`).
- Frontend: `src/features/menu/services/client-auth.service.ts` + `createClientWithToken()` de `src/lib/supabase.ts` (cliente Supabase con `accessToken: async () => jwt`; no se usa `setSession` porque no hay usuario GoTrue ni refresh token).
- Verificado en vivo: token desconocido → `401 {"error":"Token inválido o expirado"}` (confirma `verify_jwt=false`, secrets cargados y CORS).
- ✅ **Camino de éxito verificado (2026-10-01):** link real → `authenticate-client-token` (200) → JWT **ES256** con el `kid` de la signing key activa → PostgREST acepta la firma → `/menu/:token` renderiza la semana activa con los pedidos del cliente. Los dos bloqueos que aparecieron (secret sin cargar y `key_ops` incompatible con la firma) están documentados en `docs/decisiones/20261001-cliente-jwt-es256-signing-key.md`.

### TODOs anotados en el código

- `dishes.service.ts` listDishes: búsqueda por `.in()` puede romper con catálogos grandes. Migrar a vista o RPC.
- `dish-versions.service.ts` createDishVersion: race condition teórica entre MAX+1 e INSERT. UNIQUE evita corrupción.
- `dish-usage.service.ts`: uso actual = solo platos ofrecidos directamente. No cuenta dentro de menús.
- `dish-usage.service.ts`: agregaciones en cliente. Migrar a vista o RPC si crece el volumen.
- `createDish` sigue usando rollback manual. Convive con el problema conceptual de no-transacción, aunque no lo expone porque `dishes` no tiene trigger inmutable. TODO: migrar a RPC cuando toque refactor.
- `menus.service.ts` listMenus: búsqueda por `.in()` + agregación de itemCount en cliente. Migrar a vista si crece.
- `weeks.service.ts` updateWeek: borra week_day_options existentes (cascade). Documentado; evaluar flag `confirmDeleteOptions` en el futuro.
- `history.service.ts`: agregados (totalAmount, unanswered, etc.) calculados en cliente. Migrar a vista o RPC si el volumen crece.
- `orders.service.ts` getOrderTotals: SUM en cliente. Migrar a vista o RPC si crece.

---

# Fase 6 — Frontend

## Hecho

- **Routing propio** en `src/app/AppRouter.tsx` + `src/app/routes.ts`
  (`window.history` + `useSyncExternalStore`). Sin react-router.
- **Auth de admin**: `AuthProvider`, `/admin/login`, chequeo con RPC
  `is_user_admin` (la UI es UX: la barrera real es RLS).
- **Shell admin**: navegación lateral, tema claro/oscuro con
  `src/lib/theme.ts` (zero-dependency, `localStorage` + `prefers-color-scheme`).
- **Secciones admin implementadas** (listado con filtros/paginación por
  `requestKey` + `reloadToken`, drawer de edición remontado por `key`,
  confirmaciones con `ConfirmDialog`):
  - `/admin` → `DashboardPage` (resumen con `getDashboardSummary`)
  - `/admin/clientes` → `ClientsPage` (CRUD + precios + estado del link/rotación)
  - `/admin/platos` → `PlatosPage` (versiones, uso, sugerencias)
  - `/admin/menus` → `MenusPage` (compositor + sugerencias, `menu-suggest.ts`)
  - `/admin/semanas` → `SemanasPage` (días, opciones con `offerModality`, activar/cerrar)
  - `/admin/pedidos` → `PedidosPage` (filtros por semana/día/modalidad/cliente, totales)
  - `/admin/cancelaciones` → `CancelacionesPage`
  - `/admin/historial` → `HistoryPage` (detalle por semana con `getHistoricalWeekDetail`)
- **`AdminSectionPage`** quedó solo como fallback de rutas desconocidas:
  ya no es el placeholder de ninguna sección.
- **`/menu/:token`** → `ClientSessionProvider` + `ClientMenuPage` +
  `useClientWeekData` + `ClientDayCard` + `ClientOrderLine`:
  sesión resuelta (autenticando / link inválido o rotado / error de red),
  oferta de la semana activa (día por día, General/Opcional con precio
  efectivo), y **pedidos + cancelaciones por día** (crear, cambiar
  cantidad, editar notas, quitar; "no quiero ese día" / "volver a pedir").
  El precio efectivo se consulta al RPC `calculate_my_order_price`.
- **UI kit compartido**: `ConfirmDialog` + `useConfirm`, `EmptyState`
  (estilos `.app-empty-state*` en `index.css`).
- **Estilos**: un CSS por feature, siempre con tokens semánticos de
  `src/index.css` (`--bg-surface`, `--text-main`, `--border-subtle`…),
  nunca hex sueltos.

## Hecho — UI de cliente (`/menu/:token`)

- Oferta de la semana: `week_days` + `week_day_options` con su
  `offerModality` y sus referencias a `dish_versions` / `menu_versions`.
  `getWeekOffer` / `listDayOptions` (y `listWeekDays`) aceptan un
  `SupabaseClient` propio, igual que `getActiveWeek`.
- Precios efectivos del cliente (general/opcional y media vianda de la
  oferta) vía el RPC `calculate_my_order_price`
  (`20261002000006_rpc_client.sql`): la identidad sale de
  `private.current_client_id()`, nunca de un parámetro.
- Crear / modificar (cantidad, notas) / quitar pedidos y cancelaciones del
  cliente (cuentan como respuesta). Los servicios aceptan el cliente de la
  sesión.
- **Media vianda desde el catálogo** (`ClientCatalogPicker`): el RLS de
  cliente no expone `dishes` / `menus`, así que el catálogo llega por el
  RPC `list_client_catalog`
  (`20261002000006_rpc_client.sql`, `security definer`, identidad
  resuelta en `private.current_client_id()`, concedido solo a
  `authenticated`). Se carga una vez y se filtra en memoria; al elegir un
  producto se pide el precio al mismo `calculate_my_order_price` (pasando
  `p_dish_version_id` / `p_menu_version_id` y
  `modality = 'media_vianda'`), y el pedido se crea con `dishVersionId` /
  `menuVersionId` + `modality: 'media_vianda'`. El botón solo aparece si
  `clients.allows_half_portion`.
- **Varios pedidos por día**: el dominio solo prohíbe los **idénticos**
  (cliente + opción + modalidad), así que la tarjeta del día no se cierra
  con un pedido: lista los existentes y sigue dejando pedir, con lo ya
  pedido deshabilitado ("Ya pediste"). "No quiero ese día" solo aparece
  cuando el día no tiene pedidos (la DB rechaza cancelar junto a pedidos).
- Estados de la UI: sin semana activa, cargando, error de sesión y error de
  consulta; estados vacíos con `EmptyState`.

### "Fuera de horario" ✅ (hecho: corte por día, 2026-10-01)

- **Regla:** cada día cierra por su cuenta con `week_days.cutoff_at`
  (default 20:00 del día anterior, `America/Argentina/Buenos_Aires`).
  Después del corte el cliente no responde —ni pedidos ni
  cancelaciones—; el admin no se ve afectado. Ver
  `docs/decisiones/20261001-fuera-de-horario-cutoff-por-dia.md`.
- En la cadena consolidada (`20261002000001_schema.sql`): columna + backfill +
  default por trigger (`week_days_default_cutoff`) +
  `private.enforce_client_day_cutoff()` sobre `orders` y `cancellations`
  (INSERT/UPDATE/DELETE). Validada con `db reset` (6/6) + smoke test
  en local; la columna y los triggers viajan en la cadena consolidada.
- UI: banner "Fuera de horario" + acciones deshabilitadas en
  `ClientDayCard` (`closedDayIds` se calcula al cargar en
  `useClientWeekData`; `ClientMenuPage` programa un `reload()` al
  llegar cada corte); editor por día en `WeekWorkspace` y lectura en
  `WeekDetailDrawer` (servicio `updateWeekDayCutoff`).

---

# Pendientes — Fase 7 en adelante

## 1. Migraciones consolidadas ✅ (hecho 2026-10-02)

- La cadena de 20 archivos (con parches y una migracion de reconciliación) se
  reemplazó por **6 archivos por responsabilidad**. Validado: `db reset` +
  `pg_dump --schema-only` diff = **0 diferencias**.
- La cadena consolidada se aplica sobre un **proyecto Supabase nuevo**; no se
  corre `db push` contra el proyecto actual (conserva la cadena vieja). El
  historial de la reconciliación local/remoto quedó en
  `docs/historico/20260927-local-fuente-de-verdad.md`.

## 2. Verificar el camino de éxito del JWT ✅ (hecho 2026-10-01)

- Verificado con un link real: token → JWT ES256 → PostgREST acepta la firma →
  `/menu/:token` renderiza la semana activa. Decisión operativa en
  `docs/decisiones/20261001-cliente-jwt-es256-signing-key.md`.

## 3. UI de cliente (oferta + pedidos) ✅ (hecha)

- Ver "Fase 6 → Hecho — UI de cliente" (incluye la media vianda desde el
  catálogo y el "fuera de horario" con corte por día).

## 4. Reportes

- Vistas o funciones de reporte de montos consolidados.

## 5. Tests

- Tests de invariantes contra la DB real.

## 6. Documentación

- `001`–`005` escritos (`versionado-inmutable`, `media-vianda-es-modalidad`,
  `precio-congelado-en-pedido`, `jwt-custom-para-clientes`,
  `semana-no-pertenece-a-cliente`).
- `docs/historico/prompt.md` se conserva como contrato original; no se actualiza.

---

# Archivos SQL generados

La cadena son **6 archivos por responsabilidad** (consolidada el 2026-10-02).
Reproducen el esquema final: `db reset` aplica las 6 sin errores y
`pg_dump --schema-only` (public + private) da **0 diferencias** contra la
baseline (3505 líneas idénticas). Los tipos generados son equivalentes a
`src/types/database.ts`.

## 20261002000001_schema.sql

- Schemas (`private`), 15 tablas de `public` + `private.admin_users`.
- Constraints (PK/FK/UNIQUE/CHECK), índices y RLS habilitado en las 16 tablas.
- Incluye `clients.allows_half_portion` y `week_days.cutoff_at` (fuera de horario).

## 20261002000002_functions_private.sql

- 17 funciones de `private`: identidad (`is_admin`, `current_client_id`),
  trigger functions (inmutabilidad, validaciones, `validate_order`,
  `enforce_client_day_cutoff`, `default_week_day_cutoff`) y helpers de menú.
- Grants: `execute` de `is_admin`/`current_client_id` a `authenticated`,
  `usage` de `private` a `authenticated`/`service_role`, `select` de
  `private.admin_users` a `service_role`.

## 20261002000003_triggers.sql

- 17 triggers de dominio + la función de soporte
  `public.validate_week_day_option_product_uniqueness()`.
- Inmutabilidad de versiones, validación de pedidos/cancelaciones,
  congelamiento post-pedido, protección de semanas `closed`, transiciones de
  `weeks.status` y corte por horario.

## 20261002000004_rls.sql

- 30 policies: admin (`private.is_admin()`), cliente
  (`client_id = private.current_client_id()`) y service_role.

## 20261002000005_rpc_admin.sql

- RPCs de admin/catálogo/precio: `activate_week`, `close_week`, `create_week`,
  `update_week`, `create_menu`, `create_menu_version`, `is_user_admin`,
  `calculate_order_price`, `calculate_catalog_media_vianda_price`.
- Grants: `is_user_admin` sin `anon`; los dos precios internos sin `authenticated`.

## 20261002000006_rpc_client.sql

- RPCs de cliente (`security definer`, identidad desde
  `private.current_client_id()`): `calculate_my_order_price` y `list_client_catalog`.
