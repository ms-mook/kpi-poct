"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { Database, RefreshCw, Sheet } from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { LiveClock } from "@/components/LiveClock";
import { StatusBanner } from "@/components/StatusBanner";
import { UsageSection } from "@/components/UsageSection";
import { KpiSection } from "@/components/KpiSection";
import { TrendSection } from "@/components/TrendSection";
import { loadDataset, snapshotDataset, LIVE_CONFIGURED, type Dataset } from "@/lib/data";
import { KeyButton } from "@/components/KeyButton";
import { availableFiscalYears, hasMultiDeviceWards, latestCompleteMonth, latestMonth, monthCompleteness, monthlyTotals } from "@/lib/aggregate";
import { fiscalYearMonths, fiscalYearOf, MONTH_ABBR_TH, MONTH_NAMES_TH, TESTS, TEST_META, type TestType } from "@/lib/constants";

type Tab = "usage" | "trend" | "kpi";

export default function DashboardPage() {
  // Start from the bundled snapshot so the first paint already has numbers;
  // the live sheet (if configured) replaces it a moment later.
  const [data, setData] = useState<Dataset>(() => snapshotDataset());
  const [loading, setLoading] = useState(LIVE_CONFIGURED);
  const [tab, setTab] = useState<Tab>("usage");
  const [test, setTest] = useState<TestType>("Glucose");
  const [fy, setFy] = useState<number | null>(null);
  // Glucose lists wards with 2-3 meters as separate rows ("4ข(1)", "4ข(2)").
  // Default to one row per ward — that's how people talk about usage, and
  // load shifting between two meters of the same ward otherwise looks like
  // one ward collapsing while another booms.
  const [grouped, setGrouped] = useState(true);
  // null = ทั้งปีงบ; 0..11 = one month of the chosen fiscal year (0 = ต.ค.)
  const [monthIdx, setMonthIdx] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const ds = await loadDataset();
    setData(ds);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!LIVE_CONFIGURED) return;
    let cancelled = false;
    loadDataset().then((ds) => {
      if (cancelled) return;
      setData(ds);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const years = useMemo(() => availableFiscalYears(data.usage, test), [data.usage, test]);
  // Keep the chosen year when switching tests if that test has it; otherwise
  // jump to that test's latest year (Blood gas only has ปีงบ 2569 so far).
  // Default to the fiscal year of the latest *complete* month: when a new
  // FY starts and only a few wards are in, opening on a year of zeros would
  // look like the data vanished.
  const defaultFy = useMemo(() => {
    const lc = latestCompleteMonth(data.usage, data.wards, test);
    const f = lc ? fiscalYearOf(lc.year, lc.month) : null;
    return f != null && years.includes(f) ? f : years[years.length - 1];
  }, [data.usage, data.wards, test, years]);
  const viewFy = fy != null && years.includes(fy) ? fy : defaultFy;
  const multiDevice = hasMultiDeviceWards(data.usage, test);
  const monthHasData = useMemo(
    () => (viewFy ? monthlyTotals(data.usage, test, viewFy).map((v) => v != null) : []),
    [data.usage, test, viewFy],
  );
  // A month picked for one year/test may not exist in another — fall back to
  // the whole year instead of showing an empty month.
  const viewMonth = monthIdx != null && monthHasData[monthIdx] ? monthIdx : null;
  const completeness = useMemo(() => monthCompleteness(data.usage, data.wards, test), [data.usage, data.wards, test]);
  // "Data up to" is what a reader needs — not when the page happened to load.
  const dataUntil = useMemo(() => {
    // Only months entered for (almost) every ward count as "data up to".
    const g = latestCompleteMonth(data.usage, data.wards, "Glucose") ?? latestMonth(data.usage, "Glucose");
    const b = latestCompleteMonth(data.usage, data.wards, "Blood gas") ?? latestMonth(data.usage, "Blood gas");
    const pick = [g, b].filter(Boolean).sort((x, y) => y!.year * 100 + y!.month - (x!.year * 100 + x!.month))[0];
    return pick ? `${MONTH_NAMES_TH[pick.month - 1]} ${pick.year}` : "—";
  }, [data.usage, data.wards]);

  return (
    <div className="w-full px-4 py-5 sm:px-6 lg:px-10 2xl:px-14">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <LogoMark size={48} />
          <div className="leading-tight">
            <h1 className="text-lg font-semibold text-base-content sm:text-xl">KPI Dashboard — หน่วย POCT</h1>
            <p className="text-xs text-base-content/55">
              หน่วยเจาะเลือดเก็บสิ่งส่งตรวจและ POCT · รพ.ศรีนครินทร์
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden md:block"><LiveClock /></div>
          <ThemeSwitcher />
          <KeyButton />
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="tabs tabs-box glass-panel w-full sm:w-auto">
          <button role="tab" className={`tab flex-1 whitespace-nowrap px-2 text-xs sm:flex-none sm:px-4 sm:text-sm ${tab === "usage" ? "tab-active" : ""}`} onClick={() => setTab("usage")}>
            จำนวนการใช้งาน
          </button>
          <button role="tab" className={`tab flex-1 whitespace-nowrap px-2 text-xs sm:flex-none sm:px-4 sm:text-sm ${tab === "trend" ? "tab-active" : ""}`} onClick={() => setTab("trend")}>
            แนวโน้ม & พยากรณ์
          </button>
          <button role="tab" className={`tab flex-1 whitespace-nowrap px-2 text-xs sm:flex-none sm:px-4 sm:text-sm ${tab === "kpi" ? "tab-active" : ""}`} onClick={() => setTab("kpi")}>
            ตัวชี้วัดคุณภาพ
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/55">
          <span
            className={`badge badge-sm gap-1 border-0 ${data.source === "live" ? "bg-success/15 text-success" : "bg-base-content/8 text-base-content/60"}`}
            title={data.source === "live" ? "อ่านจาก Google Sheet โดยตรง" : "ข้อมูลที่ฝังมากับเว็บ (snapshot)"}
          >
            {data.source === "live" ? <Sheet size={12} /> : <Database size={12} />}
            {data.source === "live" ? "Google Sheet" : "Snapshot"}
          </span>
          <span suppressHydrationWarning title={`โหลดเมื่อ ${data.loadedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`}>
            ข้อมูลถึง {dataUntil}
          </span>
          {LIVE_CONFIGURED && (
            <button onClick={refresh} className="btn btn-ghost btn-xs btn-circle" aria-label="โหลดข้อมูลใหม่" disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          )}
        </div>
      </div>

      {data.liveError && (
        <div className="mb-5">
          <StatusBanner
            type="warning"
            title="อ่าน Google Sheet ไม่สำเร็จ — กำลังแสดงข้อมูล snapshot"
            message={data.liveError}
          />
        </div>
      )}

      {tab === "usage" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="join">
              {TESTS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTest(t)}
                  className={`btn join-item btn-sm ${test === t ? "btn-primary" : "glass-panel border-0 text-base-content/70"}`}
                  title={TEST_META[t].long}
                >
                  {TEST_META[t].label}
                </button>
              ))}
            </div>
            <select
              className="select select-sm select-bordered w-32 bg-base-200/60"
              value={viewFy ?? ""}
              onChange={(e) => setFy(Number(e.target.value))}
              aria-label="ปีงบประมาณ"
            >
              {[...years].reverse().map((y) => <option key={y} value={y}>ปีงบ {y}</option>)}
            </select>
            <select
              className="select select-sm select-bordered w-36 bg-base-200/60"
              value={viewMonth ?? ""}
              onChange={(e) => setMonthIdx(e.target.value === "" ? null : Number(e.target.value))}
              aria-label="เดือน"
            >
              <option value="">ทั้งปีงบ</option>
              {viewFy && fiscalYearMonths(viewFy).map((m, i) => (
                <option key={i} value={i} disabled={!monthHasData[i]}>
                  {MONTH_ABBR_TH[m.month - 1]} {m.year}{!monthHasData[i] ? " (ไม่มีข้อมูล)"
                    : completeness.get(m.year * 100 + m.month)?.complete === false
                      ? ` (กรอกแล้ว ${completeness.get(m.year * 100 + m.month)!.filled}/${completeness.get(m.year * 100 + m.month)!.expected})` : ""}
                </option>
              ))}
            </select>
            {multiDevice && (
              <label className="flex cursor-pointer items-center gap-2 rounded-field px-2 py-1 text-xs text-base-content/70"
                title="หอที่มีเครื่องหลายเครื่อง เช่น 4ข(1), 4ข(2), 4ข(3)">
                <input type="checkbox" className="toggle toggle-xs toggle-primary" checked={grouped}
                  onChange={(e) => setGrouped(e.target.checked)} />
                รวมเครื่องในหอเดียวกัน
              </label>
            )}
          </div>
          {viewFy ? (
            <UsageSection key={`${test}-${viewFy}-${grouped}`} data={data} test={test} fy={viewFy} grouped={grouped} monthIdx={viewMonth} />
          ) : (
            <StatusBanner type="info" message={`ยังไม่มีข้อมูลการใช้งาน ${test}`} />
          )}
        </>
      ) : tab === "trend" ? (
        <TrendSection data={data} />
      ) : (
        <KpiSection data={data} />
      )}

      <footer className="mt-10 border-t border-base-content/6 pt-4 text-center text-[11px] text-base-content/40">
        ข้อมูลจาก Google Sheet · ปีงบประมาณนับ ต.ค.–ก.ย.
      </footer>
    </div>
  );
}
