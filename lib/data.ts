import Papa from "papaparse";
import snapshot from "./snapshot.json";
import type { TestType } from "./constants";
import { APPS_SCRIPT_URL } from "./backend";

// ---------------------------------------------------------------------------
// Where the data comes from (first one configured wins)
// ---------------------------------------------------------------------------
// 1. NEXT_PUBLIC_APPS_SCRIPT_URL — the Apps Script backend (apps-script/Code.gs)
//    returns every tab except "ผู้ใช้งาน". Preferred: the sheet itself can stay
//    private, which matters once it holds staff PIN hashes.
// 2. NEXT_PUBLIC_SHEET_ID — read each tab as CSV via the public "gviz"
//    endpoint. Needs the sheet shared "Anyone with the link → Viewer", which
//    exposes *every* tab, so don't combine it with the users tab.
// 3. lib/snapshot.json — the merged workbook as of the last `npm run
//    snapshot`, so the page never shows blank.
//
// Column layout matches kpi-dashboard's tabs (long format, row 1 = header),
// so the same sheet can later be read/written by a Vercel version with the
// service-account code from that repo.

export const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID ?? "";

export const TAB = {
  usage: "ข้อมูลการใช้งาน",
  wards: "หอผู้ป่วย",
  devices: "เครื่อง Glucose", // legacy (ward, SN, from FY, to FY) — read only when the history tab below is empty
  fleet: "เครื่อง POCT (ประวัติ)",
  kpi: "ตัวชี้วัด",
  kpiConfig: "ตัวชี้วัดคุณภาพ (ตั้งค่า)",
} as const;

export type UsageRow = { year: number; month: number; test: TestType; ward: string; count: number };
export type WardRow = { test: TestType; ward: string; order: number; active: boolean };
/** One SN's stay in one ward. to* = null → still there ("ปัจจุบัน"). A meter that moves
 * between wards has one row per stay. */
export type DeviceRow = {
  test: TestType; sn: string; ward: string;
  fromYear: number; fromMonth: number; toYear: number | null; toMonth: number | null;
  note: string;
  /** Derived, for the older "ปีงบ x–y" labels. */
  fromFy: number; toFy: number | null;
};
const fyOf = (y: number, m: number) => (m >= 10 ? y + 1 : y);
/** value === null means "ND" (ไม่ได้ดำเนินการ): recorded on purpose, never used in any calculation. */
export type KpiRow = { year: number; month: number; indicator: string; field: string; value: number | null };

/** "ND" / "nd" / "N/D" / "N.D." typed in a cell. */
export const isND = (v: unknown): boolean => /^n\.?\/?d\.?$/i.test(String(v ?? "").trim());
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

export const LIVE_CONFIGURED = Boolean(APPS_SCRIPT_URL || SHEET_ID);

export type Dataset = {
  usage: UsageRow[];
  wards: WardRow[];
  devices: DeviceRow[];
  /** Content versions of the admin-editable tables (live data only) — sent back on save to detect concurrent edits. */
  versions?: { wards: string; kpiConfig: string; devices: string };
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

function mkDevice(test: TestType, sn: string, ward: string, fy: number, fm: number, ty: number | null, tm: number | null, note: string): DeviceRow {
  return { test, sn, ward, fromYear: fy, fromMonth: fm, toYear: ty, toMonth: tm, note, fromFy: fyOf(fy, fm), toFy: ty != null && tm != null ? fyOf(ty, tm) : null };
}

/** New history tab if it has rows; otherwise the legacy Glucose tab (FY → months). */
function parseDevices(fleet: Raw, legacy: Raw): DeviceRow[] {
  const out: DeviceRow[] = [];
  for (const [t, sn, ward, fy, fm, ty, tm, note] of fleet) {
    const test = str(t), y = num(fy), m = num(fm);
    if (!isTest(test) || !str(sn) || !str(ward) || y == null || m == null) continue;
    const ey = num(ty), em = num(tm);
    out.push(mkDevice(test, str(sn), str(ward), y, m, ey != null && em != null ? ey : null, ey != null && em != null ? em : null, str(note)));
  }
  if (out.length) return out;
  for (const [ward, sn, from, to] of legacy) {
    const f = num(from), e = num(to);
    if (!str(ward) || !str(sn) || f == null) continue;
    out.push(mkDevice("Glucose", str(sn), str(ward), f - 1, 10, e ?? null, e != null ? 9 : null, ""));
  }
  return out;
}

function parseKpi(rows: Raw): KpiRow[] {
  const out: KpiRow[] = [];
  for (const [y, m, , indicator, field, value] of rows) {
    const year = num(y), month = num(m);
    const v = isND(value) ? null : num(value);
    if (year == null || month == null || !str(indicator) || !str(field)) continue;
    if (v == null && !isND(value)) continue;
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
    devices: parseDevices(get(TAB.fleet), get(TAB.devices)),
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

async function loadViaAppsScript(): Promise<Dataset> {
  const res = await fetch(`${APPS_SCRIPT_URL}?action=read&_=${Date.now()}`, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`อ่านข้อมูลจากหลังบ้านไม่ได้ (HTTP ${res.status})`);
  let body: { ok: boolean; error?: string; tabs?: Record<string, Raw>; versions?: Dataset["versions"] };
  try {
    body = await res.json();
  } catch {
    throw new Error("หลังบ้านตอบกลับผิดรูปแบบ — ตรวจการ Deploy web app (Who has access = Anyone)");
  }
  if (!body.ok || !body.tabs) throw new Error(body.error ?? "อ่านข้อมูลจากหลังบ้านไม่ได้");
  const tabs = body.tabs;
  const ds = build((tab) => tabs[tab] ?? [], "live");
  ds.versions = body.versions;
  if (ds.usage.length === 0) throw new Error(`แท็บ "${TAB.usage}" ไม่มีข้อมูล`);
  return ds;
}

/** Live data when configured; otherwise (or on any failure) the snapshot. */
export async function loadDataset(): Promise<Dataset> {
  if (APPS_SCRIPT_URL) {
    try {
      return await loadViaAppsScript();
    } catch (err) {
      return snapshotDataset(err instanceof Error ? err.message : String(err));
    }
  }
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
