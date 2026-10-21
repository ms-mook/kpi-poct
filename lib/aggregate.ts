import { fiscalYearMonths, fiscalYearOf, type TestType } from "./constants";
import type { KpiConfig, KpiRow, UsageRow } from "./data";

// ---------------------------------------------------------------------------
// Usage (จำนวนการใช้งาน)
// ---------------------------------------------------------------------------

const key = (y: number, m: number) => y * 100 + m;

export function availableFiscalYears(usage: UsageRow[], test: TestType): number[] {
  const set = new Set<number>();
  for (const r of usage) if (r.test === test) set.add(fiscalYearOf(r.year, r.month));
  return Array.from(set).sort((a, b) => a - b);
}

/** Month totals for one fiscal year (ต.ค. → ก.ย.). `null` = no row at all for
 * that month, so charts show a gap instead of a fake zero. */
export function monthlyTotals(usage: UsageRow[], test: TestType, fy: number): (number | null)[] {
  const sums = new Map<number, number>();
  for (const r of usage) {
    if (r.test !== test) continue;
    sums.set(key(r.year, r.month), (sums.get(key(r.year, r.month)) ?? 0) + r.count);
  }
  return fiscalYearMonths(fy).map(({ year, month }) => sums.get(key(year, month)) ?? null);
}

export function yearlyTotals(usage: UsageRow[], test: TestType) {
  return availableFiscalYears(usage, test).map((fy) => {
    const months = monthlyTotals(usage, test, fy);
    const filled = months.filter((v): v is number => v != null);
    return { fy, total: filled.reduce((s, v) => s + v, 0), monthsWithData: filled.length };
  });
}

/** Per-ward totals for a fiscal year, highest first. */
export function wardTotals(usage: UsageRow[], test: TestType, fy: number) {
  const sums = new Map<string, number>();
  for (const r of usage) {
    if (r.test !== test || fiscalYearOf(r.year, r.month) !== fy) continue;
    sums.set(r.ward, (sums.get(r.ward) ?? 0) + r.count);
  }
  return Array.from(sums, ([ward, total]) => ({ ward, total })).sort((a, b) => b.total - a.total);
}

/** One ward's 12 monthly counts for a fiscal year. */
export function wardMonthly(usage: UsageRow[], test: TestType, ward: string, fy: number): (number | null)[] {
  const byKey = new Map<number, number>();
  for (const r of usage) {
    if (r.test === test && r.ward === ward) byKey.set(key(r.year, r.month), (byKey.get(key(r.year, r.month)) ?? 0) + r.count);
  }
  return fiscalYearMonths(fy).map(({ year, month }) => byKey.get(key(year, month)) ?? null);
}

/** Latest (year, month) that has any usage row for this test. */
export function latestMonth(usage: UsageRow[], test: TestType): { year: number; month: number } | null {
  let best = -1;
  for (const r of usage) if (r.test === test) best = Math.max(best, key(r.year, r.month));
  return best < 0 ? null : { year: Math.floor(best / 100), month: best % 100 };
}

export function monthTotal(usage: UsageRow[], test: TestType, year: number, month: number): number | null {
  let total = 0;
  let any = false;
  for (const r of usage) {
    if (r.test === test && r.year === year && r.month === month) {
      total += r.count;
      any = true;
    }
  }
  return any ? total : null;
}

// ---------------------------------------------------------------------------
// Month completeness
// ---------------------------------------------------------------------------
// Data is entered ward by ward, so the newest month is often half-filled.
// Treating it as a full month makes totals, "latest month", forecasts and the
// ratio_auto KPI denominator all look like a collapse. A month counts as
// complete once ≥ 90% of the test's registered (active) wards have a row —
// history has at most 2 of 67 Glucose wards blank in any month.

export const COMPLETE_SHARE = 0.9;
export type Completeness = { filled: number; expected: number; complete: boolean };

export function monthCompleteness(
  usage: UsageRow[], wards: { test: TestType; ward: string; active: boolean }[], test: TestType,
): Map<number, Completeness> {
  const expected = wards.filter((w) => w.test === test && w.active).length;
  const perMonth = new Map<number, Set<string>>();
  for (const r of usage) {
    if (r.test !== test) continue;
    const k = key(r.year, r.month);
    const s = perMonth.get(k) ?? new Set<string>();
    s.add(r.ward);
    perMonth.set(k, s);
  }
  const out = new Map<number, Completeness>();
  for (const [k, s] of perMonth) {
    // No ward list (tab missing) → can't judge; treat as complete.
    out.set(k, { filled: s.size, expected, complete: expected === 0 || s.size >= expected * COMPLETE_SHARE });
  }
  return out;
}

/** Latest month that is complete (see monthCompleteness). */
export function latestCompleteMonth(
  usage: UsageRow[], wards: { test: TestType; ward: string; active: boolean }[], test: TestType,
): { year: number; month: number } | null {
  let best = -1;
  for (const [k, c] of monthCompleteness(usage, wards, test)) if (c.complete) best = Math.max(best, k);
  return best < 0 ? null : { year: Math.floor(best / 100), month: best % 100 };
}

/** "หอผู้ป่วย 4ข(2)" → "หอผู้ป่วย 4ข": wards with several Glucose meters are
 * listed once per meter; this folds them back into one ward. */
export function wardGroupName(ward: string): string {
  return ward.replace(/\s*\(\d+\)$/, "");
}

/** Usage rows with every meter of the same ward merged under one name. */
export function groupUsageByWard(usage: UsageRow[]): UsageRow[] {
  return usage.map((r) => (/\(\d+\)$/.test(r.ward) ? { ...r, ward: wardGroupName(r.ward) } : r));
}

export function hasMultiDeviceWards(usage: UsageRow[], test: TestType): boolean {
  return usage.some((r) => r.test === test && /\(\d+\)$/.test(r.ward));
}

/** Per-ward totals for a fiscal year plus the same months of the previous
 * fiscal year (like-for-like), for "which wards grew / dropped". */
export function wardTotalsWithChange(usage: UsageRow[], test: TestType, fy: number) {
  const cur = wardTotals(usage, test, fy);
  return cur.map(({ ward, total }) => {
    const a = wardMonthly(usage, test, ward, fy);
    const b = wardMonthly(usage, test, ward, fy - 1);
    let sa = 0, sb = 0, n = 0;
    a.forEach((v, i) => {
      if (v != null && b[i] != null) { sa += v; sb += b[i]!; n++; }
    });
    const change = n > 0 && sb > 0 ? ((sa - sb) / sb) * 100 : null;
    return { ward, total, change };
  });
}

/** Per-ward totals for one month, with change vs the previous month. */
export function wardTotalsForMonth(usage: UsageRow[], test: TestType, year: number, month: number) {
  const pYear = month === 1 ? year - 1 : year;
  const pMonth = month === 1 ? 12 : month - 1;
  const cur = new Map<string, number>();
  const prev = new Map<string, number>();
  for (const r of usage) {
    if (r.test !== test) continue;
    if (r.year === year && r.month === month) cur.set(r.ward, (cur.get(r.ward) ?? 0) + r.count);
    else if (r.year === pYear && r.month === pMonth) prev.set(r.ward, (prev.get(r.ward) ?? 0) + r.count);
  }
  return Array.from(cur, ([ward, total]) => {
    const p = prev.get(ward);
    return { ward, total, change: p ? ((total - p) / p) * 100 : null };
  }).sort((a, b) => b.total - a.total);
}

export type UsageAnomaly ={ ward: string; year: number; month: number; value: number; typical: number };

/** Ward-months in the fiscal year that fell far below that ward's own normal
 * level — usually a broken/missing meter, a closed ward, or a data-entry
 * slip. "Normal" = median of the ward's previous 12 recorded months (needs
 * ≥ 6). Wards averaging under `minTypical` a month are skipped: at that
 * volume a quiet month is ordinary noise, not a signal. */
export function detectAnomalies(
  usage: UsageRow[], test: TestType, fy: number, { ratio = 0.4, minTypical = 100 } = {},
): UsageAnomaly[] {
  const byWard = new Map<string, Map<number, number>>();
  for (const r of usage) {
    if (r.test !== test) continue;
    const m = byWard.get(r.ward) ?? new Map<number, number>();
    m.set(key(r.year, r.month), (m.get(key(r.year, r.month)) ?? 0) + r.count);
    byWard.set(r.ward, m);
  }
  const out: UsageAnomaly[] = [];
  for (const [ward, months] of byWard) {
    const keys = Array.from(months.keys()).sort((a, b) => a - b);
    keys.forEach((k, i) => {
      const year = Math.floor(k / 100), month = k % 100;
      if (fiscalYearOf(year, month) !== fy) return;
      const prev = keys.slice(Math.max(0, i - 12), i).map((x) => months.get(x)!);
      if (prev.length < 6) return;
      const sorted = [...prev].sort((a, b) => a - b);
      const mid = sorted.length / 2;
      const typical = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
      const value = months.get(k)!;
      if (typical >= minTypical && value < typical * ratio) out.push({ ward, year, month, value, typical });
    });
  }
  return out.sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month) || a.value / a.typical - b.value / b.typical);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year - 543, month, 0).getDate();
}

// ---------------------------------------------------------------------------
// Quality indicators (ตัวชี้วัด)
// ---------------------------------------------------------------------------

export type KpiResult = {
  /** Percentage for %-type indicators; the head-count for `count`. */
  value: number;
  numerator?: number;
  denominator?: number;
};

/** Which usage stream a `ratio_auto` indicator divides by — taken from the id
 * suffix (`..._glucose` / `..._bloodgas`), the convention used in the
 * "ตัวชี้วัดคุณภาพ (ตั้งค่า)" tab. */
export function autoDenominatorTest(cfg: KpiConfig): TestType | null {
  if (cfg.id.endsWith("_glucose")) return "Glucose";
  if (cfg.id.endsWith("_bloodgas")) return "Blood gas";
  return null;
}

type WardList = { test: TestType; ward: string; active: boolean }[];

/** `wards` (optional) lets ratio_auto refuse a half-entered usage month
 * instead of dividing by a too-small total. */
export function kpiResult(
  cfg: KpiConfig, kpi: KpiRow[], usage: UsageRow[], year: number, month: number, wards?: WardList,
): KpiResult | null {
  const field = (suffix: string) =>
    kpi.find((r) => r.indicator === cfg.id && r.field === `${cfg.id}_${suffix}` && r.year === year && r.month === month)?.value;

  switch (cfg.kind) {
    case "direct_percent": {
      const v = field("pct");
      return v == null ? null : { value: v };
    }
    case "count": {
      // A head-count alone can't be judged against "ร้อยละ 100". If the
      // sheet also has `<id>_den` (ผู้ใช้งานทั้งหมดที่ต้องสอบ) the indicator
      // becomes a real percentage with pass/fail.
      const v = field("count");
      if (v == null) return null;
      const d = field("den");
      return d ? { value: (v / d) * 100, numerator: v, denominator: d } : { value: v };
    }
    case "ratio_pair": {
      const n = field("num"), d = field("den");
      if (n == null || d == null || d === 0) return null;
      return { value: (n / d) * 100, numerator: n, denominator: d };
    }
    case "ratio_auto": {
      const n = field("num");
      const test = autoDenominatorTest(cfg);
      if (n == null || !test) return null;
      if (wards && monthCompleteness(usage, wards, test).get(key(year, month))?.complete === false) return null;
      const d = monthTotal(usage, test, year, month);
      if (!d) return null;
      return { value: (n / d) * 100, numerator: n, denominator: d };
    }
  }
}

/** Same rule as kpi-dashboard: "max" passes at ≥ target, "min" at ≤ target.
 * `count` indicators have no denominator to compare against a % target, so
 * they carry no pass/fail. */
export function kpiStatus(cfg: KpiConfig, r: KpiResult | null): "pass" | "fail" | null {
  if (!r || cfg.targetValue == null) return null;
  if (cfg.kind === "count" && r.denominator == null) return null;
  return cfg.targetDirection === "min"
    ? (r.value <= cfg.targetValue ? "pass" : "fail")
    : (r.value >= cfg.targetValue ? "pass" : "fail");
}

export function availableKpiYears(kpi: KpiRow[]): number[] {
  return Array.from(new Set(kpi.map((r) => fiscalYearOf(r.year, r.month)))).sort((a, b) => a - b);
}

/** 12 monthly results for a fiscal year. */
export function kpiYearSeries(cfg: KpiConfig, kpi: KpiRow[], usage: UsageRow[], fy: number, wards?: WardList) {
  return fiscalYearMonths(fy).map(({ year, month }) => ({ year, month, result: kpiResult(cfg, kpi, usage, year, month, wards) }));
}

/** Whole-year figure: summed num/den for ratios, latest value otherwise. */
export function kpiYearSummary(cfg: KpiConfig, kpi: KpiRow[], usage: UsageRow[], fy: number, wards?: WardList): KpiResult | null {
  const series = kpiYearSeries(cfg, kpi, usage, fy, wards).filter((s) => s.result);
  if (series.length === 0) return null;
  if (cfg.kind === "ratio_pair" || cfg.kind === "ratio_auto") {
    // (count-with-denominator is a running head-count, so the latest month
    // is the year figure — handled by the fall-through below.)
    const n = series.reduce((s, x) => s + (x.result!.numerator ?? 0), 0);
    const d = series.reduce((s, x) => s + (x.result!.denominator ?? 0), 0);
    return d ? { value: (n / d) * 100, numerator: n, denominator: d } : null;
  }
  return series[series.length - 1].result;
}
