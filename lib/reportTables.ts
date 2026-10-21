// The two report tables of the back office ("ตารางข้อมูล"). The screen and the
// Excel export both read these structures, so what is shown is what is exported.

import { fiscalYearMonths, MONTH_ABBR_TH, type TestType } from "./constants";
import type { Dataset, KpiConfig } from "./data";
import {
  groupUsageByWard, kpiIsND, kpiResult, kpiStatus, kpiYearSeries, kpiYearSummary,
  monthCompleteness, wardGroupName, wardMonthly,
} from "./aggregate";

export type MonthHead = { year: number; month: number; label: string; partial: boolean };

// ---------------------------------------------------------------------------
// Table 1 — usage per ward × month
// ---------------------------------------------------------------------------

export type UsageRowData = { ward: string; values: (number | null)[]; total: number; average: number | null; monthsCounted: number };
export type UsageTable = {
  test: TestType;
  fy: number;
  months: MonthHead[];
  rows: UsageRowData[];
  /** Per month; null where the month has no data or is only partly filled. */
  monthTotals: (number | null)[];
  grandTotal: number;
  partialMonths: MonthHead[];
};

export function buildUsageTable(data: Dataset, test: TestType, fy: number, grouped: boolean): UsageTable {
  const usage = grouped ? groupUsageByWard(data.usage) : data.usage;
  const comp = monthCompleteness(data.usage, data.wards, test);
  const months: MonthHead[] = fiscalYearMonths(fy).map(({ year, month }) => {
    const c = comp.get(year * 100 + month);
    return { year, month, label: `${MONTH_ABBR_TH[month - 1]} ${String(year).slice(-2)}`, partial: c != null && !c.complete };
  });

  // Configured ward order first; wards that only appear in the data are appended.
  const listed = data.wards.filter((w) => w.test === test && w.active).map((w) => (grouped ? wardGroupName(w.ward) : w.ward));
  const inData = usage.filter((r) => r.test === test).map((r) => r.ward);
  const names = Array.from(new Set([...listed, ...inData]));

  const rows: UsageRowData[] = [];
  for (const ward of names) {
    const values = wardMonthly(usage, test, ward, fy);
    if (values.every((v) => v == null)) continue;
    // Half-filled months stay visible but are left out of totals and averages.
    const counted = values.filter((v, i): v is number => v != null && !months[i].partial);
    const total = counted.reduce((s, v) => s + v, 0);
    rows.push({ ward, values, total, average: counted.length ? total / counted.length : null, monthsCounted: counted.length });
  }

  const monthTotals = months.map((m, i) => {
    if (m.partial) return null;
    let any = false, sum = 0;
    for (const r of rows) if (r.values[i] != null) { any = true; sum += r.values[i]!; }
    return any ? sum : null;
  });
  return {
    test, fy, months, rows, monthTotals,
    grandTotal: monthTotals.reduce<number>((s, v) => s + (v ?? 0), 0),
    partialMonths: months.filter((m) => m.partial),
  };
}

// ---------------------------------------------------------------------------
// Table 2 — quality indicators × month
// ---------------------------------------------------------------------------

export type KpiCell = {
  /** Number to show (percentage, or head-count for `count`). */
  value: number | null;
  status: "pass" | "fail" | null;
  nd: boolean;
  /** e.g. "63 / 67" when the cell is a ratio. */
  detail: string | null;
};
export type KpiRowData = {
  cfg: KpiConfig;
  title: string;
  sub: string;
  targetText: string;
  cells: KpiCell[];
  summary: KpiCell & { months: number | null };
  asCount: boolean;
};
export type KpiTable = { fy: number; months: MonthHead[]; rows: KpiRowData[] };

export function buildKpiTable(data: Dataset, fy: number): KpiTable {
  const months: MonthHead[] = fiscalYearMonths(fy).map(({ year, month }) => ({
    year, month, label: `${MONTH_ABBR_TH[month - 1]} ${String(year).slice(-2)}`, partial: false,
  }));
  const configs = data.kpiConfig.filter((c) => c.active).sort((a, b) => a.order - b.order);

  const rows: KpiRowData[] = configs.map((cfg) => {
    const series = kpiYearSeries(cfg, data.kpi, data.usage, fy, data.wards);
    const toCell = (r: ReturnType<typeof kpiResult>, nd: boolean): KpiCell => ({
      value: r ? r.value : null,
      status: kpiStatus(cfg, r),
      nd: nd && !r,
      detail: r?.numerator != null && r.denominator != null ? `${r.numerator.toLocaleString()} / ${r.denominator.toLocaleString()}` : null,
    });
    const cells = series.map((s) => toCell(s.result, kpiIsND(cfg, data.kpi, s.year, s.month)));
    const sum = kpiYearSummary(cfg, data.kpi, data.usage, fy, data.wards);
    const asCount = cfg.kind === "count" && !series.some((s) => s.result?.denominator != null);
    const [title, sub] = cfg.name.split(" — ");
    return {
      cfg,
      title: title.trim(),
      sub: (sub ?? cfg.shortName).trim(),
      targetText: cfg.targetValue == null || asCount ? "—" : `${cfg.targetDirection === "min" ? "ไม่เกิน" : "ตั้งแต่"} ${cfg.targetValue}%`,
      cells,
      summary: { ...toCell(sum, false), months: sum?.months ?? (sum ? 1 : null) },
      asCount,
    };
  });
  return { fy, months, rows };
}

export function kpiCellText(row: KpiRowData, c: KpiCell): string {
  if (c.nd) return "ND";
  if (c.value == null) return "–";
  return row.asCount ? `${c.value.toLocaleString()} คน` : `${c.value.toFixed(row.cfg.decimals)}%`;
}

/** Fiscal years that have any usage or KPI data, newest last. */
export function reportYears(data: Dataset): number[] {
  const set = new Set<number>();
  for (const r of data.usage) set.add(r.month >= 10 ? r.year + 1 : r.year);
  for (const r of data.kpi) set.add(r.month >= 10 ? r.year + 1 : r.year);
  return Array.from(set).sort((a, b) => a - b);
}
