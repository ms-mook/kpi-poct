"use client";

import { useState, useRef, useEffect } from "react";
import { Sun, Moon, Palette, Check } from "lucide-react";
import { THEME_FAMILIES, useTheme } from "@/lib/useTheme";

/** Mode toggle (sun/moon) + a popover color-family picker. Self-contained —
 * drop it in the dashboard header or the entry AppShell, both read/write the
 * same localStorage key so the choice follows the user across pages. */
export function ThemeSwitcher({ className = "" }: { className?: string }) {
  const { family, mode, setFamily, toggleMode } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button
        onClick={toggleMode}
        title={mode === "dark" ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
        aria-label="สลับโหมดสว่าง/มืด"
        className="icon-badge btn btn-circle btn-ghost glass-panel border-0 text-base-content/60 hover:text-primary"
      >
        {mode === "dark" ? <Moon size={18} strokeWidth={2.2} /> : <Sun size={18} strokeWidth={2.2} />}
      </button>

      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          title="เลือกธีมสี"
          aria-label="เลือกธีมสี"
          className="icon-badge btn btn-circle btn-ghost glass-panel border-0 text-base-content/60 hover:text-primary"
        >
          <Palette size={18} strokeWidth={2.2} />
        </button>
        {open && (
          <div className="glass-panel banner-enter absolute right-0 top-full z-50 mt-2 w-44 rounded-box p-2 shadow-xl">
            <div className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-base-content/40">
              ธีมสี
            </div>
            {THEME_FAMILIES.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setFamily(f.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-sm text-base-content/80 transition-colors hover:bg-base-content/5"
              >
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ background: f.swatch, boxShadow: `0 0 0 2px color-mix(in oklab, ${f.swatch} 25%, transparent)` }}
                />
                <span className="flex-1 text-left">{f.label}</span>
                {family === f.id && <Check size={14} className="text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
