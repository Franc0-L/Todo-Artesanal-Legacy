import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export async function getAuthenticatedUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    if (error.name === "AuthSessionMissingError") return null;
    throw error;
  }

  return data.user;
}

export async function isCurrentUserAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_user_admin", {
    p_user_id: userId,
  });

  if (error) throw error;
  return data === true;
}

export async function signInAdmin(
  email: string,
  password: string,
): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  if (!data.user)
    throw new Error("Supabase no devolvió un usuario autenticado.");

  return data.user;
}

export async function signOutAdmin(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
