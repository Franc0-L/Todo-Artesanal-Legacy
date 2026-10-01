# ADR-004: JWT custom para identificar clientes

## Contexto

Los clientes no tienen cuenta: entran con un link personal (`/menu/:token`).
El token del enlace es una credencial de largo plazo (se guarda hasheada,
SHA-256, una vigente por cliente), pero no puede hablar directo con
PostgREST: habría que exponer `client_tokens` en lectura y confiar en que
el frontend filtre por el hash correcto.

Además, el modelo de seguridad de Supabase Auth (GoTrue) presupone usuarios
en `auth.users` con `auth.uid()`. Crear un usuario Auth por cliente solo
para tener sesión sería sobre-ingeniería y mezclaría dos poblaciones
distintas (admins con cuenta real vs. clientes con link).

La pregunta: ¿cómo convierte el cliente su link en una credencial de corta
vida que PostgREST entienda, sin crear usuarios Auth y sin exponer
`client_tokens`?

## Decisión

La Edge Function `authenticate-client-token` canjea el token del enlace
por un **JWT firmado con ES256** (clave dedicada del proyecto, no
`SUPABASE_JWT_SECRET` que es HS256):

- El JWT lleva `client_id` como claim (además de `role: authenticated`).
  `private.current_client_id()` lo lee desde `auth.jwt()`; `auth.uid()`
  queda en null y ninguna policy de cliente depende de él.
- TTL de 1 hora. Vive en `sessionStorage` de la pestaña y el frontend lo
  renueva en segundo plano.
- La llamada a la Edge Function viaja con `verify_jwt = false`: la
  credencial es el propio token del link, no un token de Supabase Auth.
- El frontend nunca usa `setSession` (no hay usuario GoTrue ni refresh
  token): crea un cliente aparte con `accessToken: async () => jwt`.

## Consecuencias

**A favor:**

- Sin usuarios Auth por cliente: la población de clientes vive solo en
  `public.clients` + `client_tokens`.
- Las policies existentes funcionan sin cambios: leen
  `private.current_client_id()` igual para admin (null) y cliente.
- El token del enlace nunca viaja más allá del canje; el JWT que circula
  expira en 1 h.

**En contra:**

- Rotar el enlace **no** revoca un JWT ya emitido: sigue válido hasta 1 h.
  Revocación inmediata exigiría una denylist (descartado por ahora).
- Hay una signing key ES256 más que operar (secrets
  `CLIENT_JWT_PRIVATE_KEY_JWK` + `CLIENT_JWT_KID`); si se pierde, hay que
  rotarla y re-emitir.
- La clave tiene que estar **activa** en el panel y su pública publicada en
  el JWKS; si no, PostgREST rechaza el JWT (`PGRST301`). Es dependencia de
  configuración, no de código: ver
  `docs/decisiones/20261001-cliente-jwt-es256-signing-key.md`.
- El JWT en `sessionStorage` muere con la pestaña: cada pestaña re-canjea.

## Alternativas consideradas

1. **Token del enlace como credencial directa a PostgREST.** Expondría
   `client_tokens` y confiaría el filtrado al frontend. Descartada: viola
   la frontera RLS.
2. **Usuario Supabase Auth por cliente.** Un `auth.users` por cada cliente
   solo para sesión. Descartada: mezcla admins con clientes y obliga a
   gestionar credenciales que nadie usa.
3. **JWT HS256 con `SUPABASE_JWT_SECRET`.** Reutilizar el secreto del
   proyecto. Descartada: ese secreto firma los tokens de Auth; compartirlo
   con una Edge Function amplía la superficie de riesgo.
