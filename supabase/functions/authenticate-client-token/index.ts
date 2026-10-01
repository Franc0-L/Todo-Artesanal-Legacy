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

    if (!supabaseUrl || !serviceRoleKey || !privateKeyRaw || !kid) {
      console.error(
        "Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLIENT_JWT_PRIVATE_KEY_JWK o CLIENT_JWT_KID",
      );
      return errorResponse("Configuración del servidor incompleta", 500);
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
      console.error("Token lookup failed:", tokenError.message);
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
      privateKeyJwk = JSON.parse(privateKeyRaw);
    } catch {
      console.error("CLIENT_JWT_PRIVATE_KEY_JWK no es JSON válido");
      return errorResponse("Configuración del servidor incompleta", 500);
    }

    const privateKey = await importJWK(privateKeyJwk, JWT_ALG);
    const now = Math.floor(Date.now() / 1000);

    // sub se omite a propósito: no hay una fila en auth.users que
    // impersonar. private.current_client_id() lee el claim client_id, no
    // sub, así que auth.uid() simplemente da null para un cliente — y
    // ninguna policy de cliente depende de auth.uid().
    const accessToken = await new SignJWT({
      role: "authenticated",
      aud: "authenticated",
      client_id: clientId,
    })
      .setProtectedHeader({ alg: JWT_ALG, typ: "JWT", kid })
      .setIssuedAt(now)
      .setExpirationTime(now + JWT_EXPIRY_SECONDS)
      .sign(privateKey);

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
