"use client";

import { useCallback, useEffect, useState } from "react";

// Three color families, each with a dark/light pair — 6 daisyUI themes total
// (see app/globals.css). Stored as "<family>-<mode>" in localStorage and on
// <html data-theme>. A blocking inline script in app/layout.tsx applies the
// saved value before paint so there's no flash of the wrong theme.
export const THEME_FAMILIES = [
  { id: "ocean", label: "Ocean", swatch: "#3DA9FC" },
  { id: "emerald", label: "Emerald", swatch: "#34D399" },
  { id: "violet", label: "Violet", swatch: "#B794F6" },
] as const;

export type ThemeFamily = (typeof THEME_FAMILIES)[number]["id"];
export type ThemeMode = "dark" | "light";

export const THEME_STORAGE_KEY = "kpi-theme";
const DEFAULT_FAMILY: ThemeFamily = "ocean";
const DEFAULT_MODE: ThemeMode = "dark";

function isFamily(v: string): v is ThemeFamily {
  return THEME_FAMILIES.some((f) => f.id === v);
}

function parseThemeName(name: string | null): { family: ThemeFamily; mode: ThemeMode } {
  if (name) {
    const [family, mode] = name.split("-");
    if (family && isFamily(family) && (mode === "dark" || mode === "light")) {
      return { family, mode };
    }
  }
  return { family: DEFAULT_FAMILY, mode: DEFAULT_MODE };
}

function applyTheme(family: ThemeFamily, mode: ThemeMode) {
  const name = `${family}-${mode}`;
  document.documentElement.setAttribute("data-theme", name);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, name);
  } catch {
    // best-effort only — a private window or blocked storage just won't persist
  }
}

export function useTheme() {
  const [{ family, mode }, setState] = useState<{ family: ThemeFamily; mode: ThemeMode }>({
    family: DEFAULT_FAMILY,
    mode: DEFAULT_MODE,
  });

  // Read back whatever the blocking inline script (or a previous session)
  // already applied, so React state matches the DOM instead of re-flashing.
  useEffect(() => {
    // Sync from the DOM attribute the blocking inline script (or a previous
    // session) already applied before paint, so React state matches what's
    // on screen instead of re-flashing to the default on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(parseThemeName(document.documentElement.getAttribute("data-theme")));
  }, []);

  const setFamily = useCallback((next: ThemeFamily) => {
    setState((s) => {
      applyTheme(next, s.mode);
      return { ...s, family: next };
    });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setState((s) => {
      applyTheme(s.family, next);
      return { ...s, mode: next };
    });
  }, []);

  const toggleMode = useCallback(() => {
    setState((s) => {
      const next: ThemeMode = s.mode === "dark" ? "light" : "dark";
      applyTheme(s.family, next);
      return { ...s, mode: next };
    });
  }, []);

  return { family, mode, setFamily, setMode, toggleMode };
}
