import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import {
  getAuthenticatedUser,
  isCurrentUserAdmin,
  signInAdmin,
  signOutAdmin,
} from "./auth.service";
import type { AuthState } from "./auth.types";
import { AuthContext } from "./useAuth";

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error de autenticación.";
}

/**
 * Resuelve el estado de autenticación del usuario actual. Vive fuera del
 * componente a propósito: el efecto de rehidratación no puede llamar a nada
 * del componente que fije estado de forma sincrónica (regla
 * `react-hooks/set-state-in-effect`), así que devuelve el estado y el efecto
 * solo lo aplica dentro de sus callbacks.
 */
async function resolveAuthState(): Promise<AuthState> {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return { status: "signed-out", user: null, error: null };
    }

    const isAdmin = await isCurrentUserAdmin(user.id);

    return {
      status: isAdmin ? "signed-in" : "forbidden",
      user: isAdmin ? user : null,
      error: isAdmin ? null : "Esta cuenta no tiene permisos de administrador.",
    };
  } catch (error) {
    return { status: "error", user: null, error: errorMessage(error) };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    void resolveAuthState().then((next) => {
      if (!cancelled) setState(next);
    });

    const { data } = supabase.auth.onAuthStateChange(() => {
      void resolveAuthState().then((next) => {
        if (cancelled) return;
        setState(next);
      });
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const user = await signInAdmin(email, password);
    const isAdmin = await isCurrentUserAdmin(user.id);

    if (!isAdmin) {
      await signOutAdmin();
      setState({
        status: "forbidden",
        user: null,
        error: "Esta cuenta no tiene permisos de administrador.",
      });
      return;
    }

    setState({ status: "signed-in", user, error: null });
  }, []);

  const signOut = useCallback(async () => {
    await signOutAdmin();
    setState({ status: "signed-out", user: null, error: null });
  }, []);

  const value = useMemo(
    () => ({ ...state, signIn, signOut }),
    [signIn, signOut, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

