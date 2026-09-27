# Todo Artesanal

Aplicación para gestionar un emprendimiento de viandas.

Dos áreas principales:

- **`/admin`** — Panel de administración privado (clientes, platos, menús, semanas, pedidos, cancelaciones, historial).
- **`/menu/:token`** — Menú personalizado por cliente, sin autenticación tradicional.

Los clientes no se registran. Reciben un link personal y desde ahí
arman su pedido de la semana activa.

---

## Stack

| Capa     | Tecnología                                       |
| -------- | ------------------------------------------------ |
| Frontend | React 19 + Vite 8 + TypeScript 6                 |
| Backend  | Supabase (PostgreSQL 17 + Auth + Edge Functions) |
| Estilos  | CSS por feature con tokens semánticos            |
| Linting  | ESLint 10                                        |

---

## Estado del proyecto

- ✅ **Fases 1–4** — Dominio, modelo conceptual, modelo PostgreSQL, RLS, funciones y triggers.
- ✅ **Fase 5** — Migraciones, tipos, servicios y las dos Edge Functions (`rotate-client-token`, `authenticate-client-token`).
- ✅ **Fase 6** — UI de admin completa (`/admin`) y sesión + estados en `/menu/:token`.
- ⏳ **Pendiente** — UI de oferta y pedidos del cliente, correr el
  `db push` de las migraciones pendientes (historial ya reconciliado:
  gana el local), tests.

Ver `docs/estado-fases-1-5.md` para el estado consolidado completo
(incluida la **reconciliación de migraciones**) y `docs/README.md` para
el índice de documentación.

---

## Estructura del proyecto

```
Todo-Artesanal/
├── docs/                   Documentación (ver docs/README.md)
│   ├── adr/                Architecture Decision Records
│   └── decisiones/         Decisiones de dominio fechadas
├── src/
│   ├── app/                Router propio (AppRouter, routes)
│   ├── features/           UI + servicios organizados por feature
│   │   ├── admin/          Sección admin compartida
│   │   ├── auth/           Sesión del admin (Supabase Auth)
│   │   ├── cancelaciones/
│   │   ├── clientes/
│   │   ├── dashboard/
│   │   ├── historial/
│   │   ├── menu/           Vista del cliente /menu/:token
│   │   ├── menus/
│   │   ├── pedidos/
│   │   ├── platos/
│   │   └── semanas/
│   ├── components/ui/      Primitivas compartidas (ConfirmDialog, EmptyState)
│   ├── lib/                Helpers compartidos (errors, formatters, supabase, theme)
│   ├── types/              Tipos generados y de dominio
│   ├── App.tsx
│   ├── index.css           Tokens de tema (claro/oscuro)
│   └── main.tsx
├── supabase/
│   ├── functions/          Edge Functions (Deno)
│   │   ├── authenticate-client-token/
│   │   └── rotate-client-token/
│   ├── migrations/         Migraciones SQL
│   └── config.toml
├── .env.local              Variables de entorno (no commiteado)
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Conceptos principales

El dominio se divide en cuatro conceptos que no deben mezclarse:

```
Oferta / Semana  = qué se ofrece
Cliente          = qué tiene configurado actualmente
Pedido           = qué eligió realmente
Historial        = qué ocurrió y bajo qué contexto
```

Regla maestra: una modificación posterior de la configuración actual
nunca debe alterar retrospectivamente el significado de un hecho
histórico.

Ver `docs/dominio.md` para el detalle.

---

## Cómo levantar el proyecto

### Requisitos

- Node.js 20+
- npm
- Supabase CLI (`npx supabase` funciona sin instalación global)

### Variables de entorno

Crear `.env.local` en la raíz:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Los valores se obtienen de Supabase Dashboard → **Project Settings → API**.

### Instalación

```bash
npm install
```

### Desarrollo

```bash
npm run dev
```

Servidor local en `http://localhost:5173`.

### Compilación y verificación

```bash
npm run build       # compila para producción (tsc + vite build)
npx tsc -b          # solo chequeo de tipos (más rápido)
npm run lint        # ESLint
npm run preview     # sirve el build de producción local
```

---

## Base de datos

### Migraciones

Las migraciones viven en `supabase/migrations/` y se aplican con:

```bash
npx supabase db push
```

> ⚠️ **Primero `npx supabase migration list`.** Historial **reconciliado
> el 2026-09-27** bajo la decisión "gana el repo local"
> (`docs/decisiones/20260927-local-fuente-de-verdad.md`): las 4
> migraciones que solo existían en remoto (dashboard) se inspeccionaron
> —su contenido es equivalente a archivos locales— y se marcaron
> `reverted`.
>
> **Falta correr el push** de las 5 migraciones pendientes. Ojo: hay que
> usar `--include-all`, si no el CLI se niega porque `000005`, `000006`
> y `000001` son anteriores al último remoto aplicado:
>
> ```bash
> npx supabase db push --dry-run --include-all   # revisar las 5 líneas
> npx supabase db push --include-all
> ```
>
> No activar semanas mientras se empuja (ventana transitoria en
> `activate_week`; detalle en la decisión).

Estado al 2026-09-27 (`✅` = aplicada en remoto, `⚠️` = solo local en el
historial — en general su efecto ya está en producción, ver columna):

| #   | Archivo                                                  | Contenido                                                         | Estado |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------- | ------ |
| 1   | `20260923000001_schema.sql`                              | 15 tablas + `private.admin_users`                                 | ✅     |
| 2   | `20260923000002_functions.sql`                           | `calculate_order_price`, `activate_week`, `close_week`            | ✅     |
| 3   | `20260923000003_triggers.sql`                            | Inmutabilidad, validaciones, protección de semanas `closed`       | ✅     |
| 4   | `20260923000004_rls.sql`                                 | RLS, policies, grants                                             | ✅     |
| 5   | `20260923000005_admin_setup.sql`                         | INSERT del primer admin (comentado)                               | ✅     |
| 6   | `20260924000001_menu_rpc.sql`                            | `create_menu`, `create_menu_version`                              | ✅     |
| 7   | `20260924000002_week_rpc.sql`                            | `create_week`, `update_week`                                      | ✅     |
| 8   | `20260924000003_edge_function_grants.sql`                | Grants de `service_role` sobre `private`                          | ✅     |
| 9   | `20260924000004_admin_check_rpc.sql`                     | `is_user_admin` (RPC público)                                     | ✅     |
| 10  | `20260924000005_grant_admin_check_rpc_authenticated.sql` | Grant de `is_user_admin` a `authenticated` (efecto ya en prod)    | ⚠️     |
| 11  | `20260924000006_restrict_admin_check_rpc_anon.sql`       | Revocación a `anon` (efecto ya en prod)                           | ⚠️     |
| 12  | `20260926000001_week_option_unique_product_per_week.sql` | Producto único por semana (efecto ya en prod)                     | ⚠️     |
| 13  | `20260926165141_add_week_offer_modality.sql`             | `offer_modality`, unicidad General/Opcional por día, validaciones | ✅     |
| 14  | `20260926170000_normalize_order_offer_modality.sql`      | `validate_order` en modo normalización (efecto ya en prod)        | ⚠️     |
| 15  | `20260927000001_reconcile_local_source_of_truth.sql`     | **Consolidación**: fija el estado final local (ver decisión)      | ⚠️     |

Las 4 migraciones que faltaban en el repo (`20260924131042`,
`20260924131127`, `20260926161458`, `20260926165602`) se aplicaron desde
el dashboard con timestamps propios; **ya fueron inspeccionadas el
2026-09-27** (contenido equivalente a los archivos 10, 11, 12 y 14 de
esta tabla) y se marcaron `reverted` en el historial. Único cambio
real que aporta el push: la `activate_week` fusionada (fila 15).

### Regenerar tipos TypeScript

Cuando cambia el schema, regenerar los tipos:

```bash
npx supabase gen types typescript --linked > src/types/database.ts
```

**Nunca** editar `database.ts` a mano.

---

## Edge Functions

### `rotate-client-token`

Genera un nuevo token personal para un cliente.

- **Método:** POST
- **Auth:** requiere JWT de admin en `Authorization: Bearer <jwt>`
- **Body:** `{ clientId: uuid }`
- **Respuesta:** `{ token: string, clientId: string }`

El token plaintext se devuelve **una única vez** y nunca se persiste en
frontend. El servidor guarda solo el hash SHA-256.

### `authenticate-client-token`

Canjea el token de un enlace `/menu/:token` por un JWT de sesión.

- **Método:** POST
- **Auth:** ninguna en la llamada (`verify_jwt = false`); la credencial
  es el propio token del link
- **Body:** `{ token: string }`
- **Respuesta:** `{ accessToken: string, clientId: string, expiresIn: number }`
- **Firma:** ES256 con la signing key del proyecto (secrets
  `CLIENT_JWT_PRIVATE_KEY_JWK` y `CLIENT_JWT_KID`), TTL 1 hora

### Deploy

```bash
npx supabase functions deploy rotate-client-token
npx supabase functions deploy authenticate-client-token
```

---

## RLS y seguridad

- **Frontera real:** RLS + constraints + funciones de PostgreSQL.
- **Frontend:** no es frontera de seguridad.
- **Admin:** autenticado con Supabase Auth, autorizado en `private.admin_users`.
- **Cliente:** sin cuenta. Su enlace se canjea por un JWT con claim
  `client_id` (Edge Function `authenticate-client-token`); las policies
  limitan todo a sus propios datos + la oferta activa.

Ver `docs/arquitectura.md` y `docs/modelo-datos.md`.

---

## Testing

No hay tests automatizados todavía. Ver `docs/estado-fases-1-5.md` sección
"Pendientes" para el plan de tests de invariantes.

Verificación manual disponible:

```bash
npx tsc -b          # chequeo de tipos
npm run lint        # chequeo de estilo
npm run build       # compilación completa
```

---

## Documentación

Toda la documentación está en `docs/` (índice completo en
`docs/README.md`):

- **`prompt.md`** — Contrato completo del proyecto (histórico, no se actualiza).
- **`estado-fases-1-5.md`** — Estado consolidado: qué está hecho, inventario de migraciones/servicios/UI y pendientes.
- **`arquitectura.md`** — Capas, patrones de datos, Edge Functions y diagramas.
- **`dominio.md`** — Conceptos, invariantes y reglas del negocio.
- **`modelo-datos.md`** — Esquema PostgreSQL, ERD y migraciones.
- **`flujos.md`** — Secuencias operativas típicas (13 flujos).
- **`servicios.md`** — Catálogo de la capa de servicios.
- **`glosario.md`** — Términos del dominio.
- **`decisiones/`** — Decisiones de dominio fechadas.
- **`adr/`** — Architecture Decision Records (`001` escrito; `002`–`005` pendientes).

---

## Flujo operativo

Resumen del ciclo de una semana:

```
1. Admin crea semana (draft)          → createWeek
2. Admin configura oferta por día     → addDayOption (General + Opcional)
     └─ un producto no se repite entre días
3. Admin activa la semana             → activateWeek
     └─ valida 5 días, General+Opcional por día, menús con 1 main
     └─ se congela week_expected_clients
4. Cliente abre su enlace             → authenticate-client-token (JWT 1 h)
5. Clientes piden/cancelan            → createOrder / createCancellation
6. Admin cierra la semana             → closeWeek
     └─ datos históricos inmutables
7. Admin consulta historial           → getClientHistory / listHistoricalWeeks
```

Ver `docs/flujos.md` para el detalle de cada paso.

---

## Roadmap

### Completado

- [x] Dominio y reglas de negocio
- [x] Modelo de datos PostgreSQL (RLS, funciones, triggers, RPCs)
- [x] Capa de servicios TypeScript
- [x] Edge Functions `rotate-client-token` y `authenticate-client-token`
- [x] UI de admin (`/admin`: dashboard, clientes, platos, menús, semanas, pedidos, cancelaciones, historial)
- [x] Sesión y estados en `/menu/:token`
- [x] Estrategia de estilos (tokens semánticos + CSS por feature)
- [x] Documentación de estado, arquitectura, servicios y flujos

### Próximo

- [ ] **Terminar la reconciliación de migraciones** — hecho: inspección
      de las 4 remotas (equivalentes a archivos locales), historial
      reparado (`migration repair --status reverted`) y consolidación
      `20260927000001` validada con `db reset`. Falta el push:
      `npx supabase db push --include-all`
- [ ] Verificar el camino de éxito del JWT con un enlace real
- [ ] UI de oferta y pedidos en `/menu/:token`
- [ ] Tests de invariantes contra la DB real
- [ ] ADRs pendientes (`002`–`005`)
- [ ] Supabase Realtime para el panel admin

### Descartado por ahora

- Integración con WhatsApp
- Estadísticas avanzadas
- Generación automática de flyers

---

## Licencia

Proyecto privado. Sin licencia pública por ahora.
