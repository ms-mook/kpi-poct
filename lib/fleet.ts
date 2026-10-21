// Meter (SN) monitoring: where each SN has been, how much it was used there,
// and whether it looks healthy now. Usage is recorded per ward (per meter row
// for wards like 4ข(1)/(2)), so a meter's usage = its ward row's usage during
// the months of its stay. Two meters sharing one ward row in the same month
// can't be told apart; those months are flagged `shared`.

import type { TestType } from "./constants";
import type { Dataset, DeviceRow, UsageRow } from "./data";
import { monthCompleteness } from "./aggregate";
import { keyYM, monthSpan, shiftKey, ymKey } from "./range";

export type Stay = DeviceRow & {
  fromKey: number; toKey: number | null;
  /** Usage per month of the stay (ascending); null = no row that month. */
  series: { key: number; count: number | null; shared: boolean }[];
  total: number; monthsWithData: number; avg: number | null;
};

export type Health = "ok" | "low" | "none" | "idle" | "moved" | "unknown";
export const HEALTH_LABEL: Record<Health, string> = {
  ok: "ปกติ", low: "ใช้ต่ำผิดปกติ", none: "ไม่มียอดใช้งาน", idle: "ไม่ได้อยู่หอใด (สำรอง/ซ่อม)", moved: "ย้ายหอบ่อย", unknown: "ยังไม่มีข้อมูลเทียบ",
};

export type DeviceSummary = {
  test: TestType; sn: string; stays: Stay[]; current: Stay | null;
  usageLast: number | null; avgPrev: number | null; ratio: number | null;
  total: number; wardsVisited: number; movesLast12: number;
  health: Health; note: string;
};

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

export function buildFleet(data: Dataset, test: TestType, asOf: number | null): { devices: DeviceSummary[]; asOf: number | null } {
  const rows = data.devices.filter((d) => d.test === test);
  const usage = new Map<string, number>(); // ward|key → count
  for (const u of data.usage as UsageRow[]) if (u.test === test) usage.set(`${u.ward}|${ymKey(u.year, u.month)}`, (usage.get(`${u.ward}|${ymKey(u.year, u.month)}`) ?? 0) + u.count);

  const comp = monthCompleteness(data.usage, data.wards, test);
  let latest = asOf;
  if (latest == null) for (const [k, c] of comp) if (c.complete && (latest == null || k > latest)) latest = k;

  // Meters per ward row per month, to flag shared rows.
  const occupancy = new Map<string, number>();
  const stays: Stay[] = rows.map((d) => {
    const fromKey = ymKey(d.fromYear, d.fromMonth);
    const toKey = d.toYear != null && d.toMonth != null ? ymKey(d.toYear, d.toMonth) : null;
    const end = toKey ?? latest ?? fromKey;
    const keys = end >= fromKey ? monthSpan(fromKey, end).map((m) => ymKey(m.year, m.month)) : [];
    keys.forEach((k) => occupancy.set(`${d.ward}|${k}`, (occupancy.get(`${d.ward}|${k}`) ?? 0) + 1));
    return { ...d, fromKey, toKey, series: keys.map((key) => ({ key, count: usage.get(`${d.ward}|${key}`) ?? null, shared: false })), total: 0, monthsWithData: 0, avg: null };
  });
  for (const s of stays) {
    s.series.forEach((p) => { p.shared = (occupancy.get(`${s.ward}|${p.key}`) ?? 0) > 1; });
    const done = s.series.filter((p) => p.count != null && comp.get(p.key)?.complete !== false);
    s.total = done.reduce((a, p) => a + p.count!, 0);
    s.monthsWithData = done.length;
    s.avg = done.length ? s.total / done.length : null;
  }

  const bySn = new Map<string, Stay[]>();
  for (const s of stays) (bySn.get(s.sn) ?? bySn.set(s.sn, []).get(s.sn)!).push(s);

  const devices: DeviceSummary[] = [];
  for (const [sn, list] of bySn) {
    list.sort((a, b) => a.fromKey - b.fromKey);
    const current = list.find((s) => s.toKey == null) ?? null;
    const movesLast12 = latest == null ? 0 : list.filter((s) => s.fromKey > shiftKey(latest!, -12)).length;
    let usageLast: number | null = null, avgPrev: number | null = null, ratio: number | null = null;
    let health: Health = "unknown", note = "";
    if (!current) {
      health = "idle"; note = "ทุกช่วงสิ้นสุดแล้ว — ไม่มีหอปัจจุบัน";
    } else if (latest != null && current.fromKey <= latest) {
      const lastPoint = current.series.find((p) => p.key === latest);
      usageLast = lastPoint?.count ?? null;
      const prev = current.series.filter((p) => p.key < latest! && p.count != null && comp.get(p.key)?.complete !== false).slice(-6).map((p) => p.count!);
      avgPrev = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : null;
      const shared = lastPoint?.shared;
      if (usageLast == null || usageLast === 0) { health = "none"; note = "เดือนล่าสุดไม่มียอดใช้งาน"; }
      else if (prev.length >= 2 && !shared && usageLast < 0.4 * median(prev) && median(prev) >= 30) {
        health = "low"; note = `ต่ำกว่าปกติ ~${Math.round((1 - usageLast / median(prev)) * 100)}%`;
      } else if (prev.length >= 1) { health = "ok"; }
      if (avgPrev && usageLast != null) ratio = usageLast / avgPrev;
      if (shared) note = (note ? note + " · " : "") + "หอเดียวกันมีหลายเครื่อง ยอดนับรวม";
    } else {
      note = "เพิ่งเริ่มอยู่หอปัจจุบัน";
    }
    if (health === "ok" && movesLast12 >= 3) { health = "moved"; note = `ย้ายหอ ${movesLast12} ครั้งใน 12 เดือน`; }
    devices.push({
      test, sn, stays: list, current, usageLast, avgPrev, ratio,
      total: list.reduce((a, s) => a + s.total, 0), wardsVisited: new Set(list.map((s) => s.ward)).size, movesLast12, health, note,
    });
  }
  devices.sort((a, b) => a.sn.localeCompare(b.sn));
  return { devices, asOf: latest };
}

export const monthLabelOf = (k: number, abbr: string[]) => { const { year, month } = keyYM(k); return `${abbr[month - 1]} ${String(year).slice(-2)}`; };
