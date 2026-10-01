# Decisión operativa — Firma ES256 del JWT de cliente (signing key)

> **Fecha:** 2026-10-01 · **Fase:** 6 (UI de cliente)
> **Afecta:** `supabase/functions/authenticate-client-token/index.ts` y los secrets del proyecto
> **Relacionado:** `docs/adr/004-jwt-custom-para-clientes.md`

## Contexto

El JWT de cliente se firma con la **signing key** del proyecto (ES256), no con
`SUPABASE_JWT_SECRET` (HS256). Poner eso a funcionar costó varias iteraciones de
deploy por causas que no eran obvias. Sin documentarlas, el rearme del
proyecto las repetiría.

## Los tres problemas

### 1. El secret no estaba cargado en la función

**Síntoma:** el canje devolvía `500` con "Configuración del servidor incompleta"
(o un 500 genérico) aunque los secrets parecieran configurados.

**Causa:** cargar la signing key en el **panel** (Auth → Signing Keys) y setear
los secrets de la Edge Function son **dos pasos distintos**.
`supabase gen signing-key` imprime/subre la clave al panel; los secrets de la
función (`CLIENT_JWT_PRIVATE_KEY_JWK`, `CLIENT_JWT_KID`) hay que setearlos aparte
con `supabase secrets set`.

**Qué se hizo:** diagnóstico granular en la función: el 500 **nombra** la
variable que falta (`falta CLIENT_JWT_PRIVATE_KEY_JWK`) sin exponer valores, en
vez de un mensaje genérico que obliga a adivinar entre cuatro.

### 2. El `key_ops` de la JWK rompe la firma

**Síntoma:** `500` con `importJWK falló: Invalid key usage` en los logs.

**Causa:** la JWK privada que genera `supabase gen signing-key` trae
`key_ops: ["sign", "verify"]`. `jose` descarta `alg` y `use` al importar, pero
**no** `key_ops`: se lo pasa a WebCrypto como _usages_, y una clave privada
ECDSA solo admite `sign`. Con `verify` en la lista, WebCrypto rechaza la clave.

**Qué se hizo:** normalizar `key_ops` antes de `importJWK`:

```ts
privateKeyJwk = { ...parsed, key_ops: ["sign"] };
```

### 3. La clave tiene que estar activa y en el JWKS

**Síntoma:** la función devuelve el JWT, pero PostgREST lo rechaza con
`PGRST301 "No suitable key was found to decode the JWT"` (401).

**Causa:** PostgREST valida el JWT contra las **signing keys activas** del
proyecto. Si la clave quedó `Inactive` (o su pública no está publicada en el
JWKS), ninguna firma vale aunque el `kid` coincida.

**Qué se hizo:** dejar la clave en **Active** en Auth → Signing Keys.

## Procedimiento (rearme / rotación)

1. `npx supabase gen signing-key --algorithm ES256` → JWK privada.
2. Panel → **Auth → Signing Keys**: confirmar que esa clave está **Active**.
3. `npx supabase secrets set` con `CLIENT_JWT_PRIVATE_KEY_JWK` (JWK privada
   completa en JSON) y `CLIENT_JWT_KID` (`kid` de esa JWK).
4. `npx supabase functions deploy authenticate-client-token`.
5. Verificar con un `/menu/<token>` real: la función responde 200 y la semana
   activa renderiza con los pedidos del cliente.

## Notas operativas

- El secret **no** puede llamarse `SUPABASE_*`: ese prefijo está reservado para
  las variables que Supabase inyecta y `secrets set` lo rechaza.
- `supabase gen signing-key` escribe por defecto `supabase/signing_keys.json`:
  es la **clave privada** → tiene que estar en `.gitignore`.
- Rotar la clave invalida los JWT ya emitidos (deseable) y exige re-setear el
  secret y redeployar la función.

## Verificación (2026-10-01)

- Camino de éxito end-to-end con un link real: token → JWT ES256 → PostgREST
  acepta la firma → `/menu/:token` renderiza la semana activa.
- `npx supabase functions list` → `authenticate-client-token` **ACTIVE**.
