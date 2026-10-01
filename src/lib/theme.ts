import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "todo-artesanal-theme";

function getSystemTheme(): Theme {
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function getSavedTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return getSystemTheme();
}

let currentTheme: Theme = getSavedTheme();
const listeners = new Set<() => void>();

function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
}

// Inicializar de inmediato al importar el módulo
applyTheme(currentTheme);

export function setTheme(theme: Theme) {
  currentTheme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
  listeners.forEach((listener) => listener());
}

export function toggleTheme() {
  setTheme(currentTheme === "dark" ? "light" : "dark");
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function useTheme(): {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
} {
  const theme = useSyncExternalStore(
    subscribe,
    () => currentTheme,
    () => "light" as Theme,
  );

  return { theme, toggleTheme, setTheme };
}
