# Decisión de dominio — Fuera de horario con corte por día

> **Fecha:** 2026-10-01 · **Fase:** 6 (UI de cliente)
> **Implementación:** `supabase/migrations/20261001000003_week_day_cutoff.sql`

## Regla

Cada día de la semana tiene un **corte de horario** (`week_days.cutoff_at`): el
instante a partir del cual dejan de aceptarse **respuestas de clientes** para
ese día.

- Una _respuesta_ es cualquier creación, modificación o eliminación de un
  **pedido** o una **cancelación** del cliente para ese día.
- Después del corte el cliente queda en **solo lectura**: la UI muestra el
  banner "Fuera de horario" y oculta las acciones; la DB rechaza igual
  cualquier intento (la UI es UX, la frontera es el trigger).
- El **admin nunca se ve bloqueado**: la regla solo aplica cuando la identidad
  es de cliente (`private.current_client_id()` no nulo). Corregir a mano fuera
  de horario es responsabilidad del admin.
- El admin también puede **mover el corte** después (ej.: "hoy pedimos hasta
  las 21"), incluso con la semana activa. Solo en semanas `closed` lo rechaza
  el trigger de protección de días.

## Default

**20:00 del día anterior al día de servicio**, en
`America/Argentina/Buenos_Aires`:

- lunes → domingo 20:00; martes → lunes 20:00; …
- Coincide con la operación de cocina: la lista del martes se cierra el lunes
  a la noche.
- El default se aplica con un trigger BEFORE INSERT sobre `week_days`
  (`week_days_default_cutoff`, cubre `create_week` / `update_week`) y se
  backfillea en la migración sobre los días existentes.

**Por qué corte por día** (y no por semana ni global): cada día cierra por su
cuenta, así que el martes se sigue pudiendo pedir el miércoles aunque ya pasó
el lunes. Un corte único por semana cerraría todo de una; una regla global fija
no permite ajustes para semanas especiales.

## Persistencia

`week_days.cutoff_at timestamptz NOT NULL`.

- Todas las comparaciones son contra `now()` (timestamptz: sin dependencia de
  la zona del navegador ni de la sesión).
- El default usa zona **fija** (`America/Argentina/Buenos_Aires`), no
  `TimeZone` de la sesión.

## Enforcement

Trigger `private.enforce_client_day_cutoff()` — `orders_client_cutoff` y
`cancellations_client_cutoff` (BEFORE INSERT OR UPDATE OR DELETE, FOR EACH
ROW):

1. `private.current_client_id()` nulo → sin corte (admin, `service_role`,
   scripts).
2. El día sale de `week_day_id` (NOT NULL en ambas tablas desde
   `20260929000001`; la media vianda de catálogo no tiene opción de oferta).
3. `now() > cutoff_at` → `raise exception 'Fuera de horario: …'` (P0001 →
   `AppError("BUSINESS_RULE")` en el frontend).

En la vista de cliente, `closedDayIds` se calcula al cargar los datos
(`useClientWeekData`, fuera del render por la regla de pureza) y
`ClientMenuPage` programa un `reload()` al instante de cada corte para que el
banner aparezca solo. En el admin, `WeekWorkspace` (columna de cada día) edita
el corte con `updateWeekDayCutoff` y `WeekDetailDrawer` lo muestra en solo
lectura.

## Verificación (2026-10-01)

- `npx supabase db reset` local: 20/20 migraciones OK.
- Smoke test contra la DB local: default 20:00 ART (23:00 UTC) ✅; admin
  exento en día vencido ✅; cliente bloqueado en INSERT/UPDATE/DELETE de
  cancelaciones con corte vencido ✅; inserción de cliente en día con cutoff
  futuro ✅; mensaje `Fuera de horario: las respuestas para este día cerraron
el …` ✅.
- Push a remoto con `npx supabase db push --yes`; `migration list` en sync.

## Alternativas consideradas

- **Corte por semana** (`weeks.ordering_deadline`): más simple (1 columna),
  pero cerraría toda la semana de una — no permite pedir el miércoles el
  martes a la mañana.
- **Regla global fija** (ej.: 18:00 del día anterior, guardada una vez): cero
  configuración semanal, pero menos flexible para semanas especiales.
