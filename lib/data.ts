import Papa from "papaparse";
import snapshot from "./snapshot.json";
import type { TestType } from "./constants";

// ---------------------------------------------------------------------------
// Where the data comes from
// ---------------------------------------------------------------------------
// GitHub Pages can't run a server, so there is no service account here: the
// browser reads each tab of the Google Sheet directly as CSV through the
// Sheets "gviz" endpoint. That only works when the sheet is shared as
// "Anyone with the link → Viewer" (see SETUP.md). If no sheet ID is set, or
// the sheet can't be reached, the page falls back to lib/snapshot.json — the
// merged workbook as of the last `npm run snapshot` — so it never shows blank.
//
// Column layout matches kpi-dashboard's tabs (long format, row 1 = header),
// so the same sheet can later be read/written by a Vercel version with the
// service-account code from that repo.

export const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID ?? "";

export const TAB = {
  usage: "ข้อมูลการใช้งาน",
  wards: "หอผู้ป่วย",
  devices: "เครื่อง Glucose",
  kpi: "ตัวชี้วัด",
  kpiConfig: "ตัวชี้วัดคุณภาพ (ตั้งค่า)",
} as const;

export type UsageRow = { year: number; month: number; test: TestType; ward: string; count: number };
export type WardRow = { test: TestType; ward: string; order: number; active: boolean };
export type DeviceRow = { ward: string; sn: string; fromFy: number | null; toFy: number | null };
export type KpiRow = { year: number; month: number; indicator: string; field: string; value: number };
export type KpiKind = "direct_percent" | "ratio_pair" | "ratio_auto" | "count";
export type KpiConfig = {
  id: string;
  group: string;
  name: string;
  shortName: string;
  criteria: string;
  kind: KpiKind;
  field1Label: string;
  field2Label: string;
  targetValue: number | null;
  targetDirection: "max" | "min";
  decimals: number;
  order: number;
  active: boolean;
};

export type Dataset = {
  usage: UsageRow[];
  wards: WardRow[];
  devices: DeviceRow[];
  kpi: KpiRow[];
  kpiConfig: KpiConfig[];
  source: "live" | "snapshot";
  /** Why the live sheet wasn't used, when it was configured but failed. */
  liveError?: string;
  loadedAt: Date;
};

type Raw = string[][];

const num = (v: string | undefined): number | null => {
  if (v == null) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const str = (v: string | undefined) => String(v ?? "").trim();
const bool = (v: string | undefined) => {
  const s = str(v).toUpperCase();
  return s === "" ? true : s === "TRUE" || s === "1" || s === "ใช่";
};
const isTest = (v: string): v is TestType => v === "Glucose" || v === "Blood gas";

function parseUsage(rows: Raw): UsageRow[] {
  const out: UsageRow[] = [];
  for (const [y, m, , test, ward, count] of rows) {
    const year = num(y), month = num(m), c = num(count), t = str(test), w = str(ward);
    // A blank count is "no data" (not 0) — skip it rather than inventing a zero.
    if (year == null || month == null || month < 1 || month > 12 || c == null || !isTest(t) || !w) continue;
    out.push({ year, month, test: t, ward: w, count: c });
  }
  return out;
}

function parseWards(rows: Raw): WardRow[] {
  const out: WardRow[] = [];
  rows.forEach(([test, ward, order, active], i) => {
    const t = str(test), w = str(ward);
    if (!isTest(t) || !w) return;
    out.push({ test: t, ward: w, order: num(order) ?? i, active: bool(active) });
  });
  return out.sort((a, b) => a.order - b.order);
}

function parseDevices(rows: Raw): DeviceRow[] {
  return rows
    .map(([ward, sn, from, to]) => ({ ward: str(ward), sn: str(sn), fromFy: num(from), toFy: num(to) }))
    .filter((d) => d.ward && d.sn);
}

function parseKpi(rows: Raw): KpiRow[] {
  const out: KpiRow[] = [];
  for (const [y, m, , indicator, field, value] of rows) {
    const year = num(y), month = num(m), v = num(value);
    if (year == null || month == null || v == null || !str(indicator) || !str(field)) continue;
    out.push({ year, month, indicator: str(indicator), field: str(field), value: v });
  }
  return out;
}

function parseKpiConfig(rows: Raw): KpiConfig[] {
  const kinds: KpiKind[] = ["direct_percent", "ratio_pair", "ratio_auto", "count"];
  const out: KpiConfig[] = [];
  rows.forEach((r, i) => {
    const [id, group, name, shortName, criteria, kind, f1, f2, target, dir, decimals, order, active] = r;
    const k = str(kind) as KpiKind;
    if (!str(id) || !kinds.includes(k)) return;
    out.push({
      id: str(id),
      group: str(group) || str(id),
      name: str(name),
      shortName: str(shortName) || str(name),
      criteria: str(criteria),
      kind: k,
      field1Label: str(f1),
      field2Label: str(f2),
      targetValue: num(target),
      targetDirection: str(dir) === "min" ? "min" : "max",
      decimals: num(decimals) ?? 2,
      order: num(order) ?? i,
      active: bool(active),
    });
  });
  return out.sort((a, b) => a.order - b.order);
}

function build(get: (tab: string) => Raw, source: Dataset["source"], liveError?: string): Dataset {
  return {
    usage: parseUsage(get(TAB.usage)),
    wards: parseWards(get(TAB.wards)),
    devices: parseDevices(get(TAB.devices)),
    kpi: parseKpi(get(TAB.kpi)),
    kpiConfig: parseKpiConfig(get(TAB.kpiConfig)),
    source,
    liveError,
    loadedAt: new Date(),
  };
}

export function snapshotDataset(liveError?: string): Dataset {
  const snap = snapshot as Record<string, Raw>;
  return build((tab) => snap[tab] ?? [], "snapshot", liveError);
}

async function fetchTab(tab: string): Promise<Raw> {
  const url =
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(SHEET_ID)}/gviz/tq` +
    `?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}&_=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`อ่านแท็บ "${tab}" ไม่ได้ (HTTP ${res.status})`);
  const text = await res.text();
  // A sheet that isn't shared publicly answers with a Google sign-in HTML
  // page instead of CSV — catch that rather than parsing HTML as data.
  if (text.trimStart().startsWith("<")) {
    throw new Error("Google Sheet ยังไม่ได้แชร์แบบ \"ทุกคนที่มีลิงก์ดูได้\"");
  }
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  return parsed.data.slice(1); // drop header row
}

/** Live sheet when configured; otherwise (or on any failure) the snapshot. */
export async function loadDataset(): Promise<Dataset> {
  if (!SHEET_ID) return snapshotDataset();
  try {
    const tabs = Object.values(TAB);
    const results = await Promise.all(tabs.map((t) => fetchTab(t)));
    const byTab = new Map(tabs.map((t, i) => [t as string, results[i]]));
    const ds = build((tab) => byTab.get(tab) ?? [], "live");
    if (ds.usage.length === 0) throw new Error(`แท็บ "${TAB.usage}" ไม่มีข้อมูล`);
    return ds;
  } catch (err) {
    return snapshotDataset(err instanceof Error ? err.message : String(err));
  }
}
