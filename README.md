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
- ✅ **Fase 6** — UI de admin completa (`/admin`) y UI de cliente en `/menu/:token` (oferta, pedidos, cancelaciones y media vianda del catálogo).
- ⏳ **Pendiente** — tests de invariantes, verificación del camino de éxito
  del JWT con un enlace real (la UI ya lo consume), reportes.

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

Las migraciones viven en `supabase/migrations/` y son **6 archivos por
responsabilidad** (consolidados 2026-10-02; reproducen el esquema final,
validado con `db reset` + `pg_dump --schema-only` diff = 0 diferencias):

| #   | Archivo                            | Responsabilidad                                                       |
| --- | ---------------------------------- | --------------------------------------------------------------------- |
| 1   | `20261002000001_schema`            | schemas, 15 tablas + `private.admin_users`, constraints, índices, RLS |
| 2   | `20261002000002_functions_private` | 17 funciones de `private` (helpers + trigger fns) y sus grants        |
| 3   | `20261002000003_triggers`          | 17 triggers de dominio + su función de soporte                        |
| 4   | `20261002000004_rls`               | 30 policies (frontera de seguridad)                                   |
| 5   | `20261002000005_rpc_admin`         | RPCs de admin/catálogo/precio interno                                 |
| 6   | `20261002000006_rpc_client`        | RPCs de cliente (`security definer`)                                  |

Se aplican contra un proyecto Supabase linkeado con:

```bash
npx supabase db push --dry-run   # revisar primero
npx supabase db push --yes
```

> ⚠️ **No correr `db push` contra el proyecto remoto actual**
> (`dnkgmwyrvhkablbzsofb`): conserva la cadena vieja (20 migraciones) y
> divergiría. La cadena consolidada se aplica sobre un proyecto Supabase
> **nuevo** (rearranque); `migration list` mostrará las 6 como "solo local"
> hasta entonces.

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
- **Requisito:** la signing key tiene que estar **activa** en el panel
  (Auth → Signing Keys) y su pública publicada en el JWKS; si no, PostgREST
  rechaza el JWT. Procedimiento y errores típicos en
  `docs/decisiones/20261001-cliente-jwt-es256-signing-key.md`.

### Deploy

```bash
# 1. Signing key ES256 del JWT de cliente.
npx supabase gen signing-key --algorithm ES256
#    → confirmar en el panel que la clave queda Active
# 2. Secrets de la funcion (secrets set --env-file <archivo>):
#    CLIENT_JWT_PRIVATE_KEY_JWK=<jwk privada> / CLIENT_JWT_KID=<kid>
# 3. Deploy.
npx supabase functions deploy rotate-client-token
npx supabase functions deploy authenticate-client-token
```

Los dos fallos típicos de este paso (secret sin cargar y `key_ops` incompatible
con la firma) están en
`docs/decisiones/20261001-cliente-jwt-es256-signing-key.md`.

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

- **`historico/prompt.md`** — Contrato completo del proyecto (histórico, no se actualiza).
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

- [x] **Migraciones consolidadas** (2026-10-02) en 6 archivos por
      responsabilidad; la narrativa de la reconciliación previa quedó
      archivada en `docs/historico/`.
- [x] Verificar el camino de éxito del JWT con un enlace real (hecho 2026-10-01)
- [x] UI de oferta y pedidos en `/menu/:token`
- [x] Media vianda desde el catálogo para el cliente (RPC
      `list_client_catalog` + `ClientCatalogPicker`)
- [ ] Tests de invariantes contra la DB real
- [x] ADRs `001`–`005` escritos (`versionado-inmutable`,
      `media-vianda-es-modalidad`, `precio-congelado-en-pedido`,
      `jwt-custom-para-clientes`, `semana-no-pertenece-a-cliente`)
- [ ] Realtime: descartado por ahora (la UI refresca por `reload()`)

### Descartado por ahora

- Integración con WhatsApp
- Estadísticas avanzadas
- Generación automática de flyers

---

## Licencia

Proyecto privado. Sin licencia pública por ahora.
