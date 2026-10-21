"use client";

import { MONTH_NAMES_TH } from "@/lib/constants";

export function currentBE(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getFullYear() + 543, month: d.getMonth() + 1 };
}

/** The month after `latest`, but never past the current calendar month —
 * the most likely month someone opening the form is about to fill in. */
export function nextMonthToFill(latest: { year: number; month: number } | null) {
  const now = currentBE();
  if (!latest) return now;
  const next = latest.month === 12 ? { year: latest.year + 1, month: 1 } : { year: latest.year, month: latest.month + 1 };
  return next.year * 100 + next.month > now.year * 100 + now.month ? latest : next;
}

export function PeriodPicker({ year, month, minYear, onChange, hasData }: {
  year: number;
  month: number;
  minYear: number;
  onChange: (p: { year: number; month: number }) => void;
  /** Marks months that already have data (shown with a ✓). */
  hasData?: (year: number, month: number) => boolean;
}) {
  const now = currentBE();
  const years: number[] = [];
  for (let y = now.year; y >= Math.min(minYear, now.year); y--) years.push(y);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="select select-sm select-bordered w-40 bg-base-200/60"
        value={month}
        onChange={(e) => onChange({ year, month: Number(e.target.value) })}
        aria-label="เดือน"
      >
        {MONTH_NAMES_TH.map((name, i) => {
          const m = i + 1;
          const future = year * 100 + m > now.year * 100 + now.month;
          return (
            <option key={m} value={m} disabled={future}>
              {name}{hasData?.(year, m) ? " ✓" : ""}
            </option>
          );
        })}
      </select>
      <select
        className="select select-sm select-bordered w-28 bg-base-200/60"
        value={year}
        onChange={(e) => {
          const y = Number(e.target.value);
          const m = y * 100 + month > now.year * 100 + now.month ? now.month : month;
          onChange({ year: y, month: m });
        }}
        aria-label="ปี (พ.ศ.)"
      >
        {years.map((y) => <option key={y} value={y}>พ.ศ. {y}</option>)}
      </select>
      <span className="text-xs text-base-content/45">
        ปีงบ {month >= 10 ? year + 1 : year} · ✓ = มีข้อมูลแล้ว
      </span>
    </div>
  );
}
