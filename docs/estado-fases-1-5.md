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

- `pedido = cliente + opción de día + modalidad + cantidad + precio aplicado`
- `pedido = una única selección por cliente + opción + modalidad`
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
- `UNIQUE = (client_id, week_day_option_id, modality)`
- `order.notes = nota específica del pedido`

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
  - Local `20260926170000` y remoto `20260926165602`
    (`normalize_order_offer_modality`) hacen **exactamente lo mismo** —
    verificado comparando los cuerpos de ambas funciones.
  - `media_vianda` se conserva tal cual (no es modalidad de oferta).
  - En la práctica tampoco se nota: el `OrderDrawer` admin envía siempre
    `modality` derivado de `selectedOption.offerModality`.
  - Nota histórica: el `validate_order` de `20260926165141` (16:51) sí
    **rechazaba** con error; `20260926165602` lo reemplazó 5 minutos
    después por la versión normalizadora, que es la vigente.
- La única modalidad seleccionable en el pedido es `media_vianda` (más la
  que la opción ya determina).
- `client_prices.modality` sigue siendo `general | opcional`: es precio
  del cliente, concepto distinto de la modalidad de oferta.

## Producto único por semana

- Un mismo plato o menú lógico no puede aparecer en dos días distintos de
  una misma semana.
- La identidad se toma desde `dish_versions.dish_id` /
  `menu_versions.menu_id`, no desde la versión concreta.
- Implementado en `20260926000001` con el trigger
  `trg_validate_week_day_option_product_uniqueness` →
  `public.validate_week_day_option_product_uniqueness()`
  (advisory lock transaccional por semana) **y** un chequeo agregado en
  `activate_week`.
- ⚠️ En el encadenamiento de archivos locales ese chequeo agregado ya no
  existe: `20260926165141` (posterior) reescribió `activate_week` **sin**
  los duplicados, dejándolos solo en el trigger. La migración de
  consolidación `20260927000001` devuelve la versión **fusionada**
  (ambos chequeos).

> ⚠️ En la base remota el **trigger también rige** (la misma migración
> se aplicó allí como `20260926161458`). El chequeo agregado en
> `activate_week` que faltaba lo repuso `20260927000001`, aplicada en
> remoto con el push del 2026-09-29. Ver "Divergencia local ↔ remoto →
> decisión tomada" en Fase 5A.

---

# Fase 5 — Implementación backend (completa)

## Fase 5A — Migraciones

- Proyecto Supabase: `Todo-Artesanal` (linkeado).
- **17 archivos** de migración locales (inventario completo en
  "Archivos SQL generados", al final).
- 15 tablas en `public` + `private.admin_users` en `private`.
- Funciones de dominio en `public`:
  - `calculate_order_price`, `activate_week`, `close_week`
  - `create_menu`, `create_menu_version`
  - `create_week`, `update_week`
  - `is_user_admin` (RPC público; grants a `service_role` y `authenticated`)
- Funciones privadas:
  - `private.is_admin`, `private.current_client_id`, `private.validate_order`
  - `public.validate_week_day_option_product_uniqueness()` (security definer)
- Edge Functions deployadas: `rotate-client-token`, `authenticate-client-token`.
- 1 admin creado en `private.admin_users`.

### ⚠️ Divergencia local ↔ remoto → decisión tomada (2026-09-27)

> **Decisión:** el repo local es la fuente de verdad; **lo aceptado en
> local pisa lo que haya quedado en la base remota.**
> Procedimiento completo: `docs/decisiones/20260927-local-fuente-de-verdad.md`.

Estado de `npx supabase migration list` (actualizado 2026-09-29, con el
push ya corrido):

| Situación                     | Migraciones                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Local y remoto (al día)       | `20260923000001`…`20260927000001` + `20260929000001` + `20260929000002` (historial completo) |
| **Solo local**                | ninguna: el `db push` del 2026-09-29 aplicó el backlog pendiente                             |
| **Solo remoto** (sin archivo) | ninguna: las 4 originales quedaron `reverted`                                                |

Antes de la reparación el historial tenía, además, esas 4 versiones solo
en remoto:

#### Resultado de la inspección (ejecutada el 2026-09-27)

Las 4 "solo remoto" se leyeron del historial real
(`db dump --linked --data-only --schema supabase_migrations`) y son
**equivalentes a archivos locales** — la divergencia era de
bookkeeping, no de decisiones:

| Remota           | Nombre                                | Equivalente local |
| ---------------- | ------------------------------------- | ----------------- |
| `20260924131042` | `grant_admin_check_rpc_authenticated` | `20260924000005`  |
| `20260924131127` | `restrict_admin_check_rpc_anon`       | `20260924000006`  |
| `20260926161458` | `week_option_unique_product_per_week` | `20260926000001`  |
| `20260926165602` | `normalize_order_offer_modality`      | `20260926170000`  |

Es decir, en producción **ya rigen** los grants de `is_user_admin`, la
unicidad de producto por semana (por el trigger) y `validate_order` en
modo normalización. Verificación con dumps de esquema (remoto vs. cadena
local con `db reset`, 15/15 OK):

- **Estructura** (229 statements: tablas, columnas, constraints,
  índices, triggers, policies, grants): **0 diferencias**.
- **Funciones** 24 vs 24: `validate_order` y
  `validate_week_day_option_product_uniqueness` idénticas
  semánticamente; `activate_week` remota = 7 chequeos, local
  consolidada = 9.

**Único gap real (ya cerrado):** `20260926165141` reescribió
`activate_week` sin los chequeos de duplicados (igual en repo que en
remoto); la doble red de unicidad en `activate_week` era lo único que
agregaba el push y quedó aplicada el 2026-09-29.

#### Estado del procedimiento

1. ✅ **Consolidación escrita y validada:**
   `20260927000001_reconcile_local_source_of_truth.sql` — idempotente,
   va al final del backlog (última palabra). Fija:
   - `activate_week` **fusionada**: General + Opcional por día **y**
     producto único por semana;
   - `private.validate_order` en modo normalización;
   - trigger `trg_validate_week_day_option_product_uniqueness`;
   - grants de `is_user_admin`;
   - objetos de `week_day_options.offer_modality`;
   - limpieza del duplicado conocido (ya aplicada en remoto: queda como
     no-op defensivo).
     Validada con `npx supabase db reset` sobre el stack local.
2. ✅ **Historial reparado** (las 4 remotas eran equivalentes a
   archivos locales):
   `npx supabase migration repair --status reverted 20260924131042
20260924131127 20260926161458 20260926165602`. Solo bookkeeping de
   `supabase_migrations`; no toca esquema ni datos (revirtible con
   `--status applied`).
3. ✅ **Push corrido** (2026-09-29): el backlog quedó aplicado en remoto.

   ```bash
   npx supabase db push --include-all
   ```

   `--include-all` fue necesario porque `000005`, `000006` y `000001`
   tienen timestamp anterior al último remoto aplicado. Empujó
   exactamente `20260924000005`, `20260924000006`, `20260926000001`,
   `20260926170000`, `20260927000001`.

4. ✅ **`migration list` sin versiones huérfanas** y **local = remoto**
   (verificado el 2026-09-29): las 15 del backlog + las 2 del 2026-09-29.

> ✅ **Ventana transitoria (histórica, ya cerrada):** durante el push del
> 2026-09-29, `20260926000001` reescribe `activate_week` a la versión
> previa a la modalidad y la consolidación la restaura fusionada apenas
> después. Por eso no se activan semanas mientras se empuja. Alternativa
> mínima que evita la ventana: marcar `000005`, `000006`, `000001` y
> `170000` con `migration repair --status applied` —su efecto ya está
> verificado presente— y empujar solo la consolidación.

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
- `week-days.service.ts`: listWeekDays, getWeekDay.
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
- Busca `token_hash` (SHA-256) en `client_tokens`; valida que no esté invalidado ni expirado (`expires_at`).
- Devuelve un **JWT ES256** con `sub = client_id` y `client_id` como claim (lo lee `private.current_client_id()`).
- Firma con `CLIENT_JWT_PRIVATE_KEY_JWK` + `CLIENT_JWT_KID` (secrets) contra la signing key subida con `supabase gen signing-key --algorithm ES256`. `SUPABASE_JWT_SECRET` no sirve: es HS256.
- TTL 1 hora. Rotar el link invalida el `token` del enlace, pero **no** revoca un JWT ya emitido (ver ADR pendiente `004-jwt-custom-para-clientes.md`).
- Frontend: `src/features/menu/services/client-auth.service.ts` + `createClientWithToken()` de `src/lib/supabase.ts` (cliente Supabase con `accessToken: async () => jwt`; no se usa `setSession` porque no hay usuario GoTrue ni refresh token).
- Verificado en vivo: token desconocido → `401 {"error":"Token inválido o expirado"}` (confirma `verify_jwt=false`, secrets cargados y CORS).
- **Pendiente de verificar:** el camino de éxito (token real → JWT → PostgREST acepta la firma ES256 → semana activa). Requiere abrir un `/menu/<token>` real.

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
  (`20261001000001_client_effective_price.sql`): la identidad sale de
  `private.current_client_id()`, nunca de un parámetro.
- Crear / modificar (cantidad, notas) / quitar pedidos y cancelaciones del
  cliente (cuentan como respuesta). Los servicios aceptan el cliente de la
  sesión.
- **Media vianda desde el catálogo** (`ClientCatalogPicker`): el RLS de
  cliente no expone `dishes` / `menus`, así que el catálogo llega por el
  RPC `list_client_catalog`
  (`20261001000002_client_catalog.sql`, `security definer`, identidad
  resuelta en `private.current_client_id()`, concedido solo a
  `authenticated`). Se carga una vez y se filtra en memoria; al elegir un
  producto se pide el precio al mismo `calculate_my_order_price` (pasando
  `p_dish_version_id` / `p_menu_version_id` y
  `modality = 'media_vianda'`), y el pedido se crea con `dishVersionId` /
  `menuVersionId` + `modality: 'media_vianda'`. El botón solo aparece si
  `clients.allows_half_portion`.
- Estados de la UI: sin semana activa, cargando, error de sesión y error de
  consulta; estados vacíos con `EmptyState`.

### Pendiente

- **"Fuera de horario"**: no existe como regla de dominio (haría falta, por
  ejemplo, un horario de cierre en `weeks`).

---

# Pendientes — Fase 7 en adelante

## 1. Reconciliar migraciones ✅ (hecho: historial alineado + push 2026-09-29)

- **Decisión tomada: local gana**
  (`docs/decisiones/20260927-local-fuente-de-verdad.md`).
- ✅ **Hecho:** las 4 migraciones remotas sin archivo se inspeccionaron
  (son equivalentes a `20260924000005`, `20260924000006`,
  `20260926000001`, `20260926170000`) y se marcaron `reverted`:
  `npx supabase migration repair --status reverted 20260924131042
20260924131127 20260926161458 20260926165602`.
- ✅ **Hecho:** consolidación `20260927000001` escrita y validada con
  `npx supabase db reset` (15/15 OK); dump de esquema remoto vs. local:
  estructura idéntica (0 diferencias).
- ✅ **Hecho:** push corrido (2026-09-29) — el backlog local quedó
  aplicado en remoto con `npx supabase db push --include-all`
  (`--include-all` porque tres archivos eran anteriores al último
  remoto). `migration list` quedó en sync.
- ✅ **Hecho:** el 2026-10-01 se aplicaron `20261001000001_client_effective_price.sql`
  (RPC `calculate_my_order_price`) y `20261001000002_client_catalog.sql`
  (RPC `list_client_catalog`) con `npx supabase db push --yes`.
  `migration list` sigue en sync.

## 2. Verificar el camino de éxito del JWT

- Falta abrir un `/menu/<token>` real para confirmar que PostgREST acepta
  la firma ES256 y que la semana activa se renderiza.

## 3. UI de cliente (oferta + pedidos) ✅ (hecha)

- Ver "Fase 6 → Hecho — UI de cliente" (incluye la media vianda desde el
  catálogo). Pendiente: "fuera de horario".

## 4. Reportes

- Vistas o funciones de reporte de montos consolidados.

## 5. Tests

- Tests de invariantes contra la DB real.

## 6. Documentación

- `docs/adr/002-media-vianda-es-modalidad.md`,
  `003-precio-congelado-en-pedido.md`, `004-jwt-custom-para-clientes.md`,
  `005-semana-no-pertenece-a-cliente.md` → archivos **vacíos**, sin redactar.
  (El ADR `001-versionado-inmutable.md` está escrito.)
- `docs/prompt.md` se conserva como contrato original; no se actualiza.

---

# Archivos SQL generados

## 20260923000001_schema.sql

- DDL base completo. Estructura base (tablas, constraints, índices).
- Incluye `clients.allows_half_portion`.
- NO incluye funciones, triggers, RLS, datos iniciales.

## 20260923000002_functions.sql

- `calculate_order_price(client_id, week_day_option_id, modality)`
  - precedencia: dish_specific > client_prices[modalidad] > base_price
  - media_vianda: precio normal (rama general) / 2
  - no aplica client_product_prices a menús
  - security definer
- `activate_week(week_id)` — draft → active
  - security definer + chequeo admin
  - congela week_expected_clients
  - usa variable `todo_artesanal.allow_week_transition`
- `close_week(week_id)` — active → closed
  - security definer + chequeo admin

## 20260923000003_triggers.sql

- Inmutabilidad dish_versions / menu_versions (UPDATE/DELETE)
- `menu_version_items`: constraint trigger DEFERRABLE INITIALLY DEFERRED
  que garantiza ≥1 main al COMMIT
- `weeks.status`: trigger que bloquea cambios directos
  (usa `todo_artesanal.allow_week_transition`)
- `weeks closed`: protección de week_days, week_day_options, orders,
  cancellations
- `orders`: validación + congelamiento de applied_price + inmutabilidad
  de campos clave
- `week_day_options`: congelamiento post-pedido
- `orders ↔ cancellations`: no coexistencia (cliente + día)

## 20260923000004_rls.sql

- `create schema if not exists private`
- `private.admin_users` (tabla)
- `private.is_admin()` (security definer)
- `private.current_client_id()` (security definer, defensiva)
- RLS habilitado en las 15 tablas públicas + admin_users
- Policies de admin (FOR ALL) en todas las tablas
- Policies de cliente según checklist
- Grants de tablas y funciones
- Grants defensivos para service_role

## 20260923000005_admin_setup.sql

- INSERT del primer administrador (comentado, placeholder UUID).
- Comentarios con instrucciones para agregar futuros admins.

## 20260924000001_menu_rpc.sql

- `create_menu(p_name, p_price, p_items jsonb, p_active bool) → uuid`
  - security definer + is_admin()
  - valida: nombre no vacío, precio ≥ 0, items array no vacío, sin
    dish_version_id repetidos, exactamente 1 main, dish_versions existen
  - inserta menus + menu_versions (v1) + menu_version_items en una
    transacción
- `create_menu_version(p_menu_id, p_name, p_price, p_items jsonb) → uuid`
  - mismas validaciones
  - calcula MAX(version_number) + 1
  - inserta en una transacción

## 20260924000002_week_rpc.sql

- `create_week(p_start_date date, p_end_date date) → uuid`
  - security definer + is_admin()
  - valida: lunes a viernes, 5 días exactos, fechas válidas
  - inserta weeks (draft) + 5 week_days en una transacción
  - el EXCLUDE gist weeks_no_overlap impide solapamiento (23P01)
- `update_week(p_week_id, p_start_date, p_end_date)`
  - solo permite modificar semanas en draft
  - borra week_days actuales (cascade a week_day_options) y recrea
  - ADVERTENCIA documentada: si había opciones cargadas, se pierden

## 20260924000003_edge_function_grants.sql

- `grant usage on schema private to service_role`
- `grant select on table private.admin_users to service_role`
- Necesario porque la Edge Function necesita verificar admins
  (aunque terminó usando el RPC público `is_user_admin`).

## 20260924000004_admin_check_rpc.sql

- `is_user_admin(p_user_id uuid) → boolean`
  - security definer + set search_path = public, private
  - consulta private.admin_users
  - revocado de public y authenticated
  - grant execute a service_role
  - necesario para que la Edge Function verifique admins sin acceder
    al schema private vía PostgREST (que solo expone public)

## 20260924000005_grant_admin_check_rpc_authenticated.sql

- `grant execute on function public.is_user_admin(uuid) to authenticated`
- Habilita el chequeo de admin desde el frontend (`isCurrentUserAdmin`).
- Aplicada en remoto (push del 2026-09-29); su efecto ya regía en
  producción desde la migración del dashboard `20260924131042` (mismo
  contenido).

## 20260924000006_restrict_admin_check_rpc_anon.sql

- `revoke execute ... from anon` (defensa: el RPC solo para
  `service_role` y `authenticated`).
- Aplicada en remoto (push del 2026-09-29); su efecto ya estaba en
  producción vía dashboard `20260924131127`.

## 20260926000001_week_option_unique_product_per_week.sql

- Regla "producto único por semana": ni el mismo `dish_id` ni el mismo
  `menu_id` en dos días distintos de una misma semana (identidad lógica,
  tomada desde `dish_versions.dish_id` / `menu_versions.menu_id`).
- Borra el único duplicado existente al momento de crear la migración
  (fila con id fijo; si no existe, es no-op).
- Crea `public.validate_week_day_option_product_uniqueness()`
  (security definer) + trigger
  `trg_validate_week_day_option_product_uniqueness`
  (BEFORE INSERT/UPDATE de `week_day_id`, `option_type`,
  `dish_version_id`, `menu_version_id`) con `pg_advisory_xact_lock` por
  semana para cerrar la carrera entre escrituras concurrentes.
- Reemplaza `activate_week` sumando el chequeo agregado de duplicados +
  "exactamente 1 main" + "ningún día vacío".
- Aplicada en remoto (push del 2026-09-29); su efecto ya regía en
  producción vía `20260926161458` (mismo SQL, aplicado desde el
  dashboard): trigger, función, limpieza del duplicado y `activate_week`
  con duplicados. Ese último chequeo lo pisó después `20260926165141`
  **tanto en el repo como en remoto**; lo repone la consolidación
  `20260927000001`.

## 20260926165141_add_week_offer_modality.sql

- `week_day_options.offer_modality` (nullable primero): backfill por
  orden de creación dentro de cada día (1ª = `general`, 2ª = `opcional`),
  y falla si alguna queda NULL.
- `NOT NULL` + CHECK `week_day_options_offer_modality_check`
  (`general` / `opcional`).
- Índice único `week_day_options_week_day_offer_modality_unique`
  `(week_day_id, offer_modality)`.
- Reemplaza `activate_week`: **exige que cada uno de los 5 días tenga
  ambas modalidades** (General y Opcional). ⚠️ Esta versión **no trae**
  los chequeos de duplicados de la migración anterior, así que en local
  `activate_week` los perdió (la unicidad de producto queda solo en el
  trigger).
- Reemplaza `private.validate_order`: si `new.modality` es `general` u
  `opcional` y no coincide con `offer_modality` de la opción,
  **rechaza con error** (no normaliza). En remoto esa versión duró
  5 minutos: `20260926165602` la reemplazó por la normalizadora.
- **Aplicada local y en remoto.**

## 20260926170000_normalize_order_offer_modality.sql

- Reemplaza `private.validate_order` por una versión comentada que, en
  vez de rechazar, **normaliza**: `new.modality := offer_modality` cuando
  es `general` u `opcional` (`media_vianda` se conserva).
- **Contenido idéntico** al de la versión vigente en remoto
  (`20260926165602`, `normalize_order_offer_modality`) — verificado
  comparando los cuerpos normalizados de ambas funciones.
- Aplicada en remoto (push del 2026-09-29).

## 20260927000001_reconcile_local_source_of_truth.sql

- **Migración de consolidación** (decisión
  `docs/decisiones/20260927-local-fuente-de-verdad.md`): fija el estado
  final local, sea cual sea lo que hayan hecho en remoto las migraciones
  sin archivo. Idempotente; va al final del backlog.
- `public.activate_week` **fusionada**: General + Opcional por día **y**
  producto único por semana **y** 1 main por menú (ninguna versión
  anterior tenía los dos chequeos a la vez).
- `private.validate_order` en modo **normalización** (versión local
  `20260926170000`).
- Trigger + función de unicidad de producto por semana.
- Grants de `is_user_admin`: `authenticated` y `service_role` sí,
  `anon` no.
- Garantiza objetos de `week_day_options.offer_modality` (NOT NULL, CHECK
  e índice único) idempotentemente.
- Limpieza del duplicado conocido, solo si sigue existiendo y no tiene
  pedidos.
- **Estado:** aplicada en remoto (push del 2026-09-29).

## 20260929000001_catalog_media_vianda.sql

- **Media vianda desde el catálogo** (decisión
  `docs/decisiones/20260929-media-vianda-catalogo.md`; revierte
  parcialmente `docs/decisiones/20260926-oferta-general-opcional.md`).
- `orders.week_day_id` (nullable → backfill desde `week_day_options` →
  `NOT NULL`): el día deja de derivarse de la opción de oferta.
- `orders.dish_version_id` / `orders.menu_version_id`: producto de
  catálogo para la media vianda libre.
- CHECK `orders_product_source_check`: exactamente una fuente de
  producto según la modalidad.
- Índices: `orders_week_day_id_idx`, dos parciales por producto y dos
  **únicos parciales** (`orders_catalog_dish_unique`,
  `orders_catalog_menu_unique`).
- `public.calculate_catalog_media_vianda_price()`: 50% del precio normal
  (plato: específico > general > base; menú: general > base).
- `private.validate_order` unificado (día desde `week_day_id`, precios
  por fuente) + triggers de protección de cancelación leyendo el día
  desde `orders.week_day_id`.
- **Aplicada en remoto** (push del 2026-09-29).

## 20260929000002_fix_media_vianda_text.sql

- **Solo texto.** `create or replace` de `private.validate_order`,
  `private.prevent_order_with_cancellation` y
  `private.prevent_cancellation_with_order` para reparar el mojibake de 6
  mensajes de error que quedó en la 0001 (doble codificación al
  escribirla). Sin cambios de lógica; no necesita rollback.
- **Aplicada en remoto** (push del 2026-09-29).

## 20261001000001_client_effective_price.sql

- `public.calculate_my_order_price(p_week_day_option_id uuid, p_dish_version_id uuid, p_menu_version_id uuid, p_modality text) → numeric(10,2)`.
  Exige **exactamente una** fuente de producto (oferta, plato o menú).
- **`security definer`**: la identidad sale de `private.current_client_id()`
  (claim `client_id` del JWT ES256 del cliente), nunca de un parámetro.
- Devuelve la **vista previa** del precio efectivo del cliente: plato
  específico > general del cliente > base; menú: general > base; la
  `media_vianda` divide por 2.
- Es **solo UX**: el precio definitivo lo congela `validate_order` en
  `applied_price` al insertar.
- Concedido **solo a `authenticated`** (el JWT de cliente y el admin
  comparten ese rol; `anon` queda fuera).
- **Aplicada en remoto** (push del 2026-10-01).

## 20261001000002_client_catalog.sql

- **Media vianda desde el catálogo para el cliente.**
- `public.list_client_catalog() → { product_type, product_id, version_id, name }`
- **`security definer` + `stable`**: el RLS de cliente solo expone las
  `dish_versions` / `menu_versions` de la semana activa, no el catálogo
  entero, así que el buscador libre pasa por este RPC.
- Devuelve los platos activos y los menús activos con su **última**
  versión; la identidad se resuelve con `private.current_client_id()` y
  la función corta con un error si no hay cliente en la sesión.
- Concedido **solo a `authenticated`**. No devuelve precios: eso lo hace
  `calculate_my_order_price`.
- **Aplicada en remoto** (push del 2026-10-01).

---

## Migraciones del dashboard (inspeccionadas y reparadas 2026-09-27)

Existían solo en remoto (`20260924131042`, `20260924131127`,
`20260926161458`, `20260926165602`): se aplicaron desde el dashboard
con timestamps auto-generados. Inspeccionadas el 2026-09-27
(`db dump --linked --data-only --schema supabase_migrations`), **su
contenido es equivalente a los archivos locales** `20260924000005`,
`20260924000006`, `20260926000001` y `20260926170000` respectivamente,
y por eso se marcaron `reverted` en el historial:

```bash
npx supabase migration repair --status reverted 20260924131042 20260924131127 20260926161458 20260926165602
```

Ya no aparecen en `npx supabase migration list`. Detalle y verificación
de esquema en `docs/decisiones/20260927-local-fuente-de-verdad.md`.
