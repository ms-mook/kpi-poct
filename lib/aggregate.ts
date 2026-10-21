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

export function kpiResult(
  cfg: KpiConfig, kpi: KpiRow[], usage: UsageRow[], year: number, month: number,
): KpiResult | null {
  const field = (suffix: string) =>
    kpi.find((r) => r.indicator === cfg.id && r.field === `${cfg.id}_${suffix}` && r.year === year && r.month === month)?.value;

  switch (cfg.kind) {
    case "direct_percent": {
      const v = field("pct");
      return v == null ? null : { value: v };
    }
    case "count": {
      const v = field("count");
      return v == null ? null : { value: v };
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
  if (!r || cfg.kind === "count" || cfg.targetValue == null) return null;
  return cfg.targetDirection === "min"
    ? (r.value <= cfg.targetValue ? "pass" : "fail")
    : (r.value >= cfg.targetValue ? "pass" : "fail");
}

export function availableKpiYears(kpi: KpiRow[]): number[] {
  return Array.from(new Set(kpi.map((r) => fiscalYearOf(r.year, r.month)))).sort((a, b) => a - b);
}

/** 12 monthly results for a fiscal year. */
export function kpiYearSeries(cfg: KpiConfig, kpi: KpiRow[], usage: UsageRow[], fy: number) {
  return fiscalYearMonths(fy).map(({ year, month }) => ({ year, month, result: kpiResult(cfg, kpi, usage, year, month) }));
}

/** Whole-year figure: summed num/den for ratios, latest value otherwise. */
export function kpiYearSummary(cfg: KpiConfig, kpi: KpiRow[], usage: UsageRow[], fy: number): KpiResult | null {
  const series = kpiYearSeries(cfg, kpi, usage, fy).filter((s) => s.result);
  if (series.length === 0) return null;
  if (cfg.kind === "ratio_pair" || cfg.kind === "ratio_auto") {
    const n = series.reduce((s, x) => s + (x.result!.numerator ?? 0), 0);
    const d = series.reduce((s, x) => s + (x.result!.denominator ?? 0), 0);
    return d ? { value: (n / d) * 100, numerator: n, denominator: d } : null;
  }
  return series[series.length - 1].result;
}
