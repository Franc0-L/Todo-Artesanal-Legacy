import type { User } from "@supabase/supabase-js";

export type AuthStatus =
  | "loading"
  | "signed-out"
  | "signed-in"
  | "forbidden"
  | "error";

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  error: string | null;
}
