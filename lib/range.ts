// Custom period ("ช่วงเดือนกำหนดเอง"): any run of calendar months, possibly
// spanning fiscal years. Same rules as the fiscal-year view — half-entered
// months are shown but left out of totals and comparisons.

import type { TestType } from "./constants";
import type { UsageRow, WardRow } from "./data";
import { daysInMonth as daysIn, monthCompleteness } from "./aggregate";

export type YM = { year: number; month: number };
export const ymKey = (y: number, m: number) => y * 100 + m;
export const keyYM = (k: number): YM => ({ year: Math.floor(k / 100), month: k % 100 });

/** Inclusive list of months from a to b (keys), in order. */
export function monthSpan(from: number, to: number): YM[] {
  const out: YM[] = [];
  let { year, month } = keyYM(Math.min(from, to));
  const end = Math.max(from, to);
  while (ymKey(year, month) <= end && out.length < 240) {
    out.push({ year, month });
    month++; if (month > 12) { month = 1; year++; }
  }
  return out;
}

/** Shift a month key by n months (negative = earlier). */
export function shiftKey(k: number, n: number): number {
  const { year, month } = keyYM(k);
  const idx = year * 12 + (month - 1) + n;
  return ymKey(Math.floor(idx / 12), (idx % 12) + 1);
}

/** Every month that has any usage for the test, ascending. */
export function monthsWithData(usage: UsageRow[], test: TestType): number[] {
  const set = new Set<number>();
  for (const r of usage) if (r.test === test) set.add(ymKey(r.year, r.month));
  return Array.from(set).sort((a, b) => a - b);
}

export type RangeWard = { ward: string; values: (number | null)[]; total: number; prevTotal: number | null; change: number | null };
export type RangeData = {
  months: (YM & { total: number | null; prev: number | null; partial: boolean; filled?: number; expected?: number })[];
  counted: number;
  total: number;
  prevTotal: number | null;
  change: number | null;
  peak: (YM & { total: number }) | null;
  days: number;
  wards: RangeWard[];
  prevLabel: { from: YM; to: YM };
};

export function buildRange(
  rawUsage: UsageRow[], usage: UsageRow[], wardList: WardRow[], test: TestType, from: number, to: number,
): RangeData {
  const span = monthSpan(from, to);
  const n = span.length;
  const comp = monthCompleteness(rawUsage, wardList, test);
  const idx = new Map<number, number>(); // month key -> position
  span.forEach((m, i) => idx.set(ymKey(m.year, m.month), i));
  const first = ymKey(span[0].year, span[0].month);

  const perMonth = new Map<number, number>();
  const perWard = new Map<string, Map<number, number>>();
  for (const r of usage) {
    if (r.test !== test) continue;
    const k = ymKey(r.year, r.month);
    perMonth.set(k, (perMonth.get(k) ?? 0) + r.count);
    let w = perWard.get(r.ward);
    if (!w) perWard.set(r.ward, (w = new Map()));
    w.set(k, (w.get(k) ?? 0) + r.count);
  }

  const months = span.map((m) => {
    const k = ymKey(m.year, m.month);
    const c = comp.get(k);
    const total = perMonth.has(k) ? perMonth.get(k)! : null;
    const partial = total != null && c?.complete === false;
    const pk = shiftKey(k, -n);
    return { ...m, total, prev: perMonth.has(pk) ? perMonth.get(pk)! : null, partial, filled: c?.filled, expected: c?.expected };
  });

  const ok = (i: number) => months[i].total != null && !months[i].partial;
  const total = months.reduce((s, m, i) => s + (ok(i) ? m.total! : 0), 0);
  const counted = months.filter((_, i) => ok(i)).length;
  // Like-for-like: only months where the previous period also has data.
  let a = 0, b = 0, c2 = 0;
  months.forEach((m, i) => { if (ok(i) && m.prev != null) { a += m.total!; b += m.prev; c2++; } });
  const prevTotal = c2 ? b : null;
  const change = c2 && b > 0 ? ((a - b) / b) * 100 : null;
  let peak: RangeData["peak"] = null;
  months.forEach((m, i) => { if (ok(i) && (!peak || m.total! > peak.total)) peak = { year: m.year, month: m.month, total: m.total! }; });
  const days = months.reduce((s, m, i) => s + (ok(i) ? daysIn(m.year, m.month) : 0), 0);

  const wards: RangeWard[] = [];
  for (const [ward, map] of perWard) {
    const values = span.map((m) => map.get(ymKey(m.year, m.month)) ?? null);
    if (values.every((v) => v == null)) continue;
    let t = 0, wa = 0, wb = 0, wn = 0;
    values.forEach((v, i) => {
      if (v == null || !ok(i)) return;
      t += v;
      const p = map.get(shiftKey(ymKey(span[i].year, span[i].month), -n));
      if (p != null) { wa += v; wb += p; wn++; }
    });
    wards.push({ ward, values, total: t, prevTotal: wn ? wb : null, change: wn && wb > 0 ? ((wa - wb) / wb) * 100 : null });
  }
  wards.sort((x, y) => y.total - x.total);

  return {
    months, counted, total, prevTotal, change, peak, days, wards,
    prevLabel: { from: keyYM(shiftKey(first, -n)), to: keyYM(shiftKey(first, -1)) },
  };
}
