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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    error: null,
  });

  const refreshAuth = useCallback(async () => {
    try {
      const user = await getAuthenticatedUser();

      if (!user) {
        setState({ status: "signed-out", user: null, error: null });
        return;
      }

      const isAdmin = await isCurrentUserAdmin(user.id);

      setState({
        status: isAdmin ? "signed-in" : "forbidden",
        user: isAdmin ? user : null,
        error: isAdmin
          ? null
          : "Esta cuenta no tiene permisos de administrador.",
      });
    } catch (error) {
      setState({
        status: "error",
        user: null,
        error: errorMessage(error),
      });
    }
  }, []);

  useEffect(() => {
    function init() {
      void refreshAuth();
    }
    init();

    const { data } = supabase.auth.onAuthStateChange(() => {
      void refreshAuth();
    });

    return () => data.subscription.unsubscribe();
  }, [refreshAuth]);

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

