"use client";

import { useMemo } from "react";
import { useTheme } from "./useTheme";

/** Recharts needs plain color strings for tooltip/axis/grid, so the
 * dark/light pair lives here (same values as kpi-dashboard). Series colors
 * use the theme's CSS vars, which SVG fill/stroke accept directly. */
export function useChartColors() {
  const { mode } = useTheme();
  const isLight = mode === "light";
  return useMemo(
    () => ({
      tooltip: {
        background: isLight ? "#FFFFFF" : "#0F1524",
        border: isLight ? "1px solid rgba(15,21,36,0.08)" : "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
        fontSize: 12,
        color: isLight ? "#1A2033" : "#E7EAF3",
      },
      axisTick: isLight ? "#64748B" : "#8C98B8",
      grid: isLight ? "rgba(15,21,36,0.09)" : "rgba(255,255,255,0.06)",
      cursor: isLight ? "rgba(15,21,36,0.05)" : "rgba(255,255,255,0.04)",
      muted: isLight ? "rgba(15,21,36,0.28)" : "rgba(231,234,243,0.32)",
    }),
    [isLight],
  );
}

export const SERIES = {
  current: "var(--color-primary)",
  accent: "var(--color-accent)",
  secondary: "var(--color-secondary)",
};
