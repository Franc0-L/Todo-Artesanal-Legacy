import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

/**
 * Crea un cliente Supabase independiente que viaja con un JWT propio.
 *
 * Se usa en `/menu/:token`: ese JWT lo emite la Edge Function
 * `authenticate-client-token` (ES256 + claim `client_id`), no GoTrue, así
 * que no existe usuario en `auth.users` ni refresh token. Por eso no se
 * puede usar `supabase.auth.setSession()` y se pasa por `accessToken`,
 * que supabase-js usa como `Authorization` en cada request (PostgREST,
 * RPC y functions).
 *
 * Es una instancia aparte del `supabase` de admin: con `persistSession:
 * false` no toca el storage ni la sesión del panel.
 */
export function createClientWithToken(
  accessToken: string,
): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => accessToken,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
