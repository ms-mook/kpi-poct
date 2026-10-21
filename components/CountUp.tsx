"use client";

import { useEffect, useRef, useState } from "react";

/** Animates from 0 to `value` once, on mount/when value changes. Respects
 * prefers-reduced-motion by jumping straight to the final value. */
export function CountUp({
  value,
  durationMs = 900,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      // Reduced motion: jump straight to the final value instead of animating.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(value);
      prevValue.current = value;
      return;
    }

    const start = prevValue.current;
    const delta = value - start;
    const startTime = performance.now();
    let raf: number;

    function tick(now: number) {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      setDisplay(Math.round(start + delta * eased));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevValue.current = value;
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <span className={`stat-figure-num ${className ?? ""}`}>{display.toLocaleString()}</span>;
}
