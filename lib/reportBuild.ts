// Data for the printable report (รายงานสรุป). Everything is computed with the
// same helpers as the dashboard / Excel export so the numbers agree.

import { fiscalYearMonths, MONTH_NAMES_TH, TESTS, type TestType } from "./constants";
import type { Dataset, KpiConfig } from "./data";
import {
  detectAnomalies, groupUsageByWard, kpiIsND, kpiResult, kpiStatus, latestCompleteMonth, monthCompleteness, type KpiResult, type UsageAnomaly,
} from "./aggregate";
import { forecastMonthly, type ForecastPoint } from "./forecast";
import { buildFleet, type DeviceSummary } from "./fleet";
import { buildRange, keyYM, monthSpan, shiftKey, ymKey, type RangeData, type YM } from "./range";

export type PeriodKind = "month" | "fy" | "cy";
export type Period = { kind: PeriodKind; from: number; to: number; label: string; short: string };

const th = (k: number) => `${MONTH_NAMES_TH[keyYM(k).month - 1]} ${keyYM(k).year}`;

export function monthPeriod(k: number): Period { return { kind: "month", from: k, to: k, label: `เดือน${th(k)}`, short: th(k) }; }
export function fyPeriod(fy: number): Period {
  const m = fiscalYearMonths(fy);
  return { kind: "fy", from: ymKey(m[0].year, m[0].month), to: ymKey(m[11].year, m[11].month), label: `ปีงบประมาณ ${fy} (ต.ค. ${fy - 1} – ก.ย. ${fy})`, short: `ปีงบ ${fy}` };
}
export function cyPeriod(y: number): Period { return { kind: "cy", from: ymKey(y, 1), to: ymKey(y, 12), label: `ปีปฏิทิน ${y} (ม.ค. – ธ.ค. ${y})`, short: `ปี ${y}` }; }

export type ReportKpiRow = {
  cfg: KpiConfig; title: string; sub: string; targetText: string;
  cells: { value: number | null; status: "pass" | "fail" | null; nd: boolean; detail: string | null }[];
  summary: { value: number | null; status: "pass" | "fail" | null; months: number | null; detail: string | null };
  asCount: boolean;
};

export type TestReport = {
  test: TestType;
  range: RangeData;        // the period itself (previous period = same length just before)
  chart: RangeData;        // monthly → the 12 months ending at the month; otherwise = range
  yoy: number | null;      // like-for-like vs the same months a year earlier
  anomalies: UsageAnomaly[];
  forecast: { total: number; low: number; high: number; mape: number | null; points: ForecastPoint[] } | null;
  fleet: { asOf: number | null; devices: DeviceSummary[]; check: DeviceSummary[]; idle: number; inWard: number };
  hasData: boolean;
};

export type Report = {
  period: Period; tests: TestReport[]; kpi: ReportKpiRow[]; kpiMonths: YM[];
  partial: { test: TestType; key: number; filled: number; expected: number }[];
  dataUntil: number | null; summaryLines: string[];
};

/** Same year-figure rule as kpiYearSummary, over any run of months. */
function summarise(cfg: KpiConfig, results: (KpiResult | null)[]): KpiResult | null {
  const done = results.filter((r): r is KpiResult => r != null);
  if (!done.length) return null;
  if (cfg.kind === "ratio_pair" || cfg.kind === "ratio_auto") {
    const n = done.reduce((s, x) => s + (x.numerator ?? 0), 0), d = done.reduce((s, x) => s + (x.denominator ?? 0), 0);
    return d ? { value: (n / d) * 100, numerator: n, denominator: d, months: done.length } : null;
  }
  if (cfg.kind === "direct_percent") return { value: done.reduce((s, x) => s + x.value, 0) / done.length, months: done.length };
  return { ...done[done.length - 1], months: done.length };
}

export function buildReport(data: Dataset, period: Period): Report {
  const grouped = groupUsageByWard(data.usage);
  const months = monthSpan(period.from, period.to);
  const fyOf = (m: YM) => (m.month >= 10 ? m.year + 1 : m.year);
  const fys = Array.from(new Set(months.map(fyOf)));

  const tests: TestReport[] = TESTS.map((test) => {
    const range = buildRange(data.usage, grouped, data.wards, test, period.from, period.to);
    const chart = period.kind === "month" ? buildRange(data.usage, grouped, data.wards, test, shiftKey(period.to, -11), period.to) : range;
    // Like-for-like vs the same months one year earlier.
    let a = 0, b = 0, n = 0;
    const comp = monthCompleteness(data.usage, data.wards, test);
    const byMonth = new Map<number, number>();
    for (const u of data.usage) if (u.test === test) byMonth.set(ymKey(u.year, u.month), (byMonth.get(ymKey(u.year, u.month)) ?? 0) + u.count);
    for (const m of months) {
      const k = ymKey(m.year, m.month), p = shiftKey(k, -12);
      if (byMonth.has(k) && byMonth.has(p) && comp.get(k)?.complete !== false && comp.get(p)?.complete !== false) { a += byMonth.get(k)!; b += byMonth.get(p)!; n++; }
    }
    const yoy = n && b > 0 ? ((a - b) / b) * 100 : null;

    const anomalies = fys.flatMap((fy) => detectAnomalies(grouped, test, fy))
      .filter((x) => ymKey(x.year, x.month) >= period.from && ymKey(x.year, x.month) <= period.to);

    let forecast: TestReport["forecast"] = null;
    if (period.kind !== "month") {
      const hist = Array.from(byMonth, ([k, value]) => ({ ...keyYM(k), value, k })).filter((x) => x.k <= period.to && comp.get(x.k)?.complete !== false);
      const f = hist.length >= 6 ? forecastMonthly(hist.map(({ year, month, value }) => ({ year, month, value }))) : null;
      if (f) forecast = { total: f.points.reduce((s, x) => s + x.value, 0), low: f.points.reduce((s, x) => s + x.low, 0), high: f.points.reduce((s, x) => s + x.high, 0), mape: f.backtestMape, points: f.points };
    }

    let asOf: number | null = null;
    for (const [k, c] of comp) if (c.complete && k <= period.to && (asOf == null || k > asOf)) asOf = k;
    const fl = buildFleet(data, test, asOf);
    const check = fl.devices.filter((d) => d.health === "low" || d.health === "none" || d.health === "moved");
    return {
      test, range, chart, yoy, anomalies, forecast, hasData: range.counted > 0 || range.months.some((m) => m.total != null),
      fleet: { asOf: fl.asOf, devices: fl.devices, check, idle: fl.devices.filter((d) => d.health === "idle").length, inWard: fl.devices.filter((d) => d.current).length },
    };
  });

  const kpi: ReportKpiRow[] = data.kpiConfig.filter((c) => c.active).sort((x, y) => x.order - y.order).map((cfg) => {
    const results = months.map((m) => kpiResult(cfg, data.kpi, data.usage, m.year, m.month, data.wards));
    const asCount = cfg.kind === "count" && !results.some((r) => r?.denominator != null);
    const toCell = (r: KpiResult | null, nd: boolean) => ({
      value: r ? r.value : null, status: kpiStatus(cfg, r), nd: nd && !r,
      detail: r?.numerator != null && r.denominator != null ? `${r.numerator.toLocaleString()} / ${r.denominator.toLocaleString()}` : null,
    });
    const cells = results.map((r, i) => toCell(r, kpiIsND(cfg, data.kpi, months[i].year, months[i].month)));
    const sum = months.length === 1 ? results[0] : summarise(cfg, results);
    const [title, sub] = cfg.name.split(" — ");
    return {
      cfg, title: title.trim(), sub: (sub ?? cfg.shortName).trim(), asCount, cells,
      targetText: cfg.targetValue == null || asCount ? "—" : `${cfg.targetDirection === "min" ? "ไม่เกิน" : "ตั้งแต่"} ${cfg.targetValue}%`,
      summary: { value: sum ? sum.value : null, status: kpiStatus(cfg, sum), months: sum?.months ?? (sum ? 1 : null), detail: sum?.numerator != null && sum.denominator != null ? `${sum.numerator.toLocaleString()} / ${sum.denominator.toLocaleString()}` : null },
    };
  });

  const partial: Report["partial"] = [];
  for (const test of TESTS) for (const [k, c] of monthCompleteness(data.usage, data.wards, test)) if (!c.complete && k >= period.from && k <= period.to) partial.push({ test, key: k, filled: c.filled, expected: c.expected });
  partial.sort((x, y) => x.key - y.key);

  const du = [latestCompleteMonth(data.usage, data.wards, "Glucose"), latestCompleteMonth(data.usage, data.wards, "Blood gas")].filter(Boolean).map((m) => ymKey(m!.year, m!.month));
  const dataUntil = du.length ? Math.max(...du) : null;

  // ---- plain-language summary lines ----
  const lines: string[] = [];
  const prevWord = period.kind === "month" ? "เดือนก่อนหน้า" : "ช่วงก่อนหน้า (ความยาวเท่ากัน)";
  for (const t of tests) {
    if (!t.range.counted) { lines.push(`${t.test}: ยังไม่มีเดือนที่ข้อมูลครบในช่วงนี้`); continue; }
    const ch = t.range.change;
    lines.push(`${t.test}: ยอดใช้งานรวม ${t.range.total.toLocaleString()} ครั้ง${ch != null ? ` (${ch >= 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(ch).toFixed(1)}% เทียบ${prevWord}` : ""}${t.yoy != null ? `${ch != null ? " · " : " ("}${t.yoy >= 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(t.yoy).toFixed(1)}% เทียบช่วงเดียวกันของปีก่อน` : ""}${ch != null || t.yoy != null ? ")" : ""}`);
  }
  const judged = kpi.filter((r) => r.summary.status);
  const fails = judged.filter((r) => r.summary.status === "fail");
  const nd = kpi.filter((r) => r.cells.every((c) => c.value == null) && r.cells.some((c) => c.nd));
  lines.push(`ตัวชี้วัดคุณภาพ: ผ่านเกณฑ์ ${judged.length - fails.length} จาก ${judged.length} ตัวที่ประเมิน${fails.length ? ` — ไม่ผ่าน: ${fails.map((r) => r.cfg.shortName).join(", ")}` : ""}${nd.length ? ` · ไม่ได้ดำเนินการ (ND) ${nd.length} ตัว` : ""}`);
  const chk = tests.reduce((s, t) => s + t.fleet.check.length, 0);
  const anom = tests.reduce((s, t) => s + t.anomalies.length, 0);
  lines.push(`เครื่องตรวจ (SN) ที่ควรตรวจสอบ ${chk} เครื่อง · หอ/เดือนที่ยอดใช้ต่ำผิดปกติ ${anom} รายการ`);

  return { period, tests, kpi, kpiMonths: months, partial, dataUntil, summaryLines: lines };
}
