# Decisión — El repo local es la fuente de verdad de la base

**Fecha:** 2026-09-27
**Estado:** aceptada y ejecutada (historial reparado; falta correr el `db push`)

## Regla

El historial de migraciones de `supabase/migrations/` es la fuente de
verdad del esquema. **Lo que se aceptó en local pisa lo que haya quedado
aplicado en la base remota**, sea reciente o histórico.

No se edita la historia local para acomodarla a lo remoto: se
reconcilia el historial y se fija el estado final con una migración de
consolidación.

## Contexto

Al 2026-09-27 los dos historiales divergían:

| Situación                              | Migraciones                                                            |
| -------------------------------------- | ---------------------------------------------------------------------- |
| Solo local (nunca aplicadas en remoto) | `20260924000005`, `20260924000006`, `20260926000001`, `20260926170000` |
| Solo remoto (sin archivo en el repo)   | `20260924131042`, `20260924131127`, `20260926161458`, `20260926165602` |

> **Estado actual (2026-09-29):** resuelto. El push aplicó el backlog
> local en remoto y el historial quedó en sync; además se sumaron
> `20260929000001_catalog_media_vianda.sql` y
> `20260929000002_fix_media_vianda_text.sql`.

Dos problemas:

1. **Orden desfasado:** `20260926000001` es _anterior_ a
   `20260926165141` (ya aplicada en remoto), así que aplicar el backlog
   tal cual haría que su `create or replace function activate_week`
   pisara la validación "cada día con General + Opcional".
2. **El CLI bloquea `db push`** mientras existan versiones remotas sin
   archivo local (verificado con `db push --dry-run`).

## Inspección (ejecutada el 2026-09-27)

Las 4 migraciones remotas se leyeron del historial real con:

```bash
npx supabase db dump --linked --data-only --schema supabase_migrations -f remote_migrations.sql
```

| Remota           | Nombre                                | Contenido                                                                                 | Equivalente local | Veredicto |
| ---------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------- | --------- |
| `20260924131042` | `grant_admin_check_rpc_authenticated` | `grant execute is_user_admin to authenticated`                                            | `20260924000005`  | idéntico  |
| `20260924131127` | `restrict_admin_check_rpc_anon`       | `revoke from anon; grant to authenticated`                                                | `20260924000006`  | idéntico  |
| `20260926161458` | `week_option_unique_product_per_week` | limpieza del duplicado + trigger de unicidad + `activate_week` con chequeos de duplicados | `20260926000001`  | idéntico  |
| `20260926165602` | `normalize_order_offer_modality`      | `private.validate_order` en modo **normalización**                                        | `20260926170000`  | idéntico  |

**Conclusión:** las 4 eran el mismo trabajo del repo aplicado desde el
dashboard con timestamps auto-generados. **La divergencia era de
bookkeeping, no de decisiones.** Todas las decisiones locales ya están
en producción.

## Verificación de esquema (remoto vs. cadena local)

Para descartar que las remotas hayan creado algo que el repo no tiene:

1. `npx supabase start` + `npx supabase db reset` → la cadena completa
   de **15 migraciones locales corre limpia**, incluida la de
   consolidación.
2. `npx supabase db dump --local` vs `npx supabase db dump --linked`,
   comparado por bloques:

| Comparación                                                                                      | Resultado                                                                                                 |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Estructura (tablas, columnas, constraints, índices, triggers, policies, grants) — 229 statements | **0 diferencias**                                                                                         |
| Funciones — 24 vs 24                                                                             | 3 difieren, todas explicadas abajo                                                                        |
| `private.validate_order`                                                                         | idéntica semánticamente (normaliza en ambos: `new.modality := v_offer_modality`)                          |
| `public.validate_week_day_option_product_uniqueness`                                             | idéntica (mismo advisory lock, mismos 5 raises)                                                           |
| `public.activate_week`                                                                           | remota: **7** chequeos · local consolidada: **9** (los mismos 7 + "platos repetidos" + "menús repetidos") |

### Único gap real

`20260926165141` reescribió `activate_week` **sin** los chequeos de
duplicados que había puesto `20260926161458`, igual que en el repo.
La unicidad de producto por semana **sí rige en producción** (vía el
trigger); lo que falta es la doble red en `activate_week`. Ese es el
único efecto nuevo que aporta el push.

## Cómo se garantiza

Migración de consolidación
`supabase/migrations/20260927000001_reconcile_local_source_of_truth.sql`
(idempotente, va al final del backlog = última palabra). Fija:

1. `public.activate_week` **fusionada**: General + Opcional por día
   **y** producto único por semana **y** 1 main por menú.
2. `private.validate_order` en modo **normalización**.
3. Trigger `trg_validate_week_day_option_product_uniqueness` + función.
4. Grants de `public.is_user_admin`: `authenticated` y `service_role`
   sí, `anon` no.
5. Objetos de `week_day_options.offer_modality` (NOT NULL, CHECK,
   índice único) garantizados idempotentemente.
6. Limpieza del duplicado conocido, solo si sigue existiendo y no tiene
   pedidos (en remoto ya se limpió: queda como no-op defensivo).

Validada con `npx supabase db reset` sobre el stack local.

## Procedimiento

1. ✅ **Inspeccionar** las 4 migraciones remotas (ver tabla de arriba).
2. ✅ **Reparar el historial** (las 4 son equivalentes a archivos
   locales, así que se marcan como no aplicadas):

   ```bash
   npx supabase migration repair --status reverted 20260924131042 20260924131127 20260926161458 20260926165602
   ```

   (Ejecutado el 2026-09-27. Es solo bookkeeping de la tabla
   `supabase_migrations`; no toca esquema ni datos. Se revierte con
   `--status applied`.)

3. ⏳ **Aplicar el backlog local** — falta correrlo:

   ```bash
   npx supabase db push --dry-run --include-all   # revisar las 5 líneas
   npx supabase db push --include-all
   ```

   `--include-all` es **obligatorio**: sin él el CLI se niega porque
   tres de los archivos (`000005`, `000006`, `000001`) tienen timestamp
   anterior al último remoto aplicado (`20260926165141`).

   Se empujan: `20260924000005`, `20260924000006`,
   `20260926000001`, `20260926170000`, `20260927000001`.

4. ✅ **Verificar**: `npx supabase migration list` ya no muestra
   versiones remotas sin archivo local; después del push debe mostrar
   las 15 alineadas.

## Consecuencias

- Único cambio de comportamiento en producción: `activate_week` pasa a
  tener **ambos** chequeos (modalidad por día + producto único por
  semana). El resto del push es re-ejecución idempotente de estado ya
  presente.
- El repo vuelve a ser la fuente de verdad completa: `migration list`
  alineado y cualquier `db reset` reproduce exactamente la base remota.
- Si en el futuro alguien vuelve a aplicar SQL desde el dashboard,
  volverá a divergir el historial (el CLI lo bloqueará).

## Limitaciones y notas

- **Ventana transitoria durante el push:** `20260926000001` reescribe
  `activate_week` a la versión previa a la modalidad y la consolidación
  (que corre inmediatamente después) la restaura fusionada. Durante
  esos pocos segundos no se debe activar ninguna semana. Alternativa
  mínima si se quiere evitar: marcar `000005`, `000006`, `000001` y
  `170000` como aplicadas con
  `supabase migration repair --status applied <version>` (su efecto ya
  está verificado presente en remoto) y empujar únicamente
  `20260927000001`.
- Las 4 migraciones del dashboard quedaron fuera del historial pero sus
  SQL siguen archivados en el dump `remote_migrations.sql` mientras
  dure la sesión; el repo no las necesita porque su contenido está
  cubierto por los archivos locales equivalentes.
- Rotar un link sigue sin revocar un JWT ya emitido (limitación
  aparte, ver ADR pendiente `004-jwt-custom-para-clientes.md`).
