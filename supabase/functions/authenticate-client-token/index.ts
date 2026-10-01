import { createClient } from "jsr:@supabase/supabase-js@2";
import { SignJWT, importJWK } from "npm:jose@5";

interface AuthenticateRequestBody {
  token?: unknown;
}

interface AuthenticateResponse {
  accessToken: string;
  clientId: string;
  expiresIn: number;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Igual que auth.jwt_expiry en supabase/config.toml.
const JWT_EXPIRY_SECONDS = 3600;
const JWT_ALG = "ES256";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hashBuffer);

  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    // No pueden llamarse SUPABASE_*: ese prefijo está reservado para las
    // variables que Supabase inyecta automáticamente. Hay que setearlas a
    // mano (ver instrucciones de deploy).
    const privateKeyRaw = Deno.env.get("CLIENT_JWT_PRIVATE_KEY_JWK");
    const kid = Deno.env.get("CLIENT_JWT_KID");

    // Diagnóstico operativo: el error nombra QUÉ variable falta (sin
    // exponer valores). Se mantiene a propósito: el fallo típico es un
    // secret sin cargar, y un 500 genérico obliga a adivinar entre cuatro.
    if (!supabaseUrl || !serviceRoleKey || !privateKeyRaw || !kid) {
      const missing = [
        !supabaseUrl ? "SUPABASE_URL" : null,
        !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
        !privateKeyRaw ? "CLIENT_JWT_PRIVATE_KEY_JWK" : null,
        !kid ? "CLIENT_JWT_KID" : null,
      ].filter((name): name is string => name !== null);

      console.error("Missing env vars:", missing.join(","));

      return errorResponse(
        `Configuración del servidor incompleta: falta ${missing.join(", ")}`,
        500,
      );
    }

    let body: AuthenticateRequestBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Body inválido", 400);
    }

    const token = body?.token;

    // Los tokens los genera rotate-client-token: 32 bytes en base64url
    // (~43 caracteres). El rango solo descarta basura obvia, no valida
    // el formato exacto.
    if (typeof token !== "string" || token.length < 16 || token.length > 512) {
      return errorResponse("Token inválido", 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const tokenHash = await sha256Hex(token);

    // Buscamos únicamente entre los tokens vigentes. No distinguimos
    // "no existe" de "fue invalidado" en la respuesta: ambos casos
    // devuelven el mismo mensaje genérico, para no filtrar información
    // sobre existencia de tokens rotados.
    const { data: tokenRow, error: tokenError } = await supabase
      .from("client_tokens")
      .select("client_id")
      .eq("token_hash", tokenHash)
      .is("invalidated_at", null)
      .maybeSingle();

    if (tokenError) {
      console.error(
        "authenticate-client-token: token lookup failed:",
        tokenError.message,
      );
      return errorResponse("Error al validar el token", 500);
    }

    if (!tokenRow) {
      return errorResponse("Token inválido o expirado", 401);
    }

    const clientId = tokenRow.client_id;

    // Deliberadamente NO se valida clients.active acá. Qué puede hacer un
    // cliente ya está gobernado por RLS y por los triggers de dominio
    // (validate_order exige pertenencia a week_expected_clients, congelada
    // al activar la semana). Repetir esa condición acá duplicaría una regla
    // de negocio fuera de su única fuente de verdad (prompt.md §4, §14).
    let privateKeyJwk: JsonWebKey;
    try {
      const parsed = JSON.parse(privateKeyRaw) as JsonWebKey;

      if (!parsed.d) {
        console.error(
          "authenticate-client-token: la JWK no es privada (falta 'd')",
        );
        return errorResponse(
          "Configuración del servidor incompleta: JWK sin parte privada",
          500,
        );
      }

      // La privada generada por `supabase gen signing-key` trae
      // key_ops=["sign","verify"]. jose descarta `alg` y `use` al importar,
      // pero NO `key_ops`: se lo pasa a WebCrypto como usages, y una clave
      // privada ECDSA solo admite "sign" → "Invalid key usage".
      // Se pisa key_ops para dejar únicamente "sign".
      privateKeyJwk = { ...parsed, key_ops: ["sign"] };
    } catch {
      console.error(
        "authenticate-client-token: CLIENT_JWT_PRIVATE_KEY_JWK no es JSON válido",
      );
      return errorResponse(
        "Configuración del servidor incompleta: JWK inválida",
        500,
      );
    }

    let privateKey;
    try {
      privateKey = await importJWK(privateKeyJwk, JWT_ALG);
    } catch (err) {
      console.error(
        "authenticate-client-token: importJWK falló:",
        err instanceof Error ? err.message : String(err),
      );
      return errorResponse(
        "Configuración del servidor incompleta: JWK no importable",
        500,
      );
    }

    let accessToken: string;
    try {
      const now = Math.floor(Date.now() / 1000);

      // sub se omite a propósito: no hay una fila en auth.users que
      // impersonar. private.current_client_id() lee el claim client_id, no
      // sub, así que auth.uid() simplemente da null para un cliente — y
      // ninguna policy de cliente depende de auth.uid().
      accessToken = await new SignJWT({
        role: "authenticated",
        aud: "authenticated",
        client_id: clientId,
      })
        .setProtectedHeader({ alg: JWT_ALG, typ: "JWT", kid })
        .setIssuedAt(now)
        .setExpirationTime(now + JWT_EXPIRY_SECONDS)
        .sign(privateKey);
    } catch (err) {
      console.error(
        "authenticate-client-token: firma ES256 falló:",
        err instanceof Error ? err.message : String(err),
      );
      return errorResponse("Error al emitir la sesión", 500);
    }

    const response: AuthenticateResponse = {
      accessToken,
      clientId,
      expiresIn: JWT_EXPIRY_SECONDS,
    };

    return jsonResponse(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Unhandled error:", message);
    return errorResponse("Error inesperado", 500);
  }
});
