"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Database, RefreshCw, Sheet } from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { LiveClock } from "@/components/LiveClock";
import { StatusBanner } from "@/components/StatusBanner";
import { UsageSection } from "@/components/UsageSection";
import { KpiSection } from "@/components/KpiSection";
import { loadDataset, snapshotDataset, SHEET_ID, type Dataset } from "@/lib/data";
import { availableFiscalYears } from "@/lib/aggregate";
import { TESTS, TEST_META, type TestType } from "@/lib/constants";

type Tab = "usage" | "kpi";

export default function DashboardPage() {
  // Start from the bundled snapshot so the first paint already has numbers;
  // the live sheet (if configured) replaces it a moment later.
  const [data, setData] = useState<Dataset>(() => snapshotDataset());
  const [loading, setLoading] = useState(Boolean(SHEET_ID));
  const [tab, setTab] = useState<Tab>("usage");
  const [test, setTest] = useState<TestType>("Glucose");
  const [fy, setFy] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const ds = await loadDataset();
    setData(ds);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!SHEET_ID) return;
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
  const viewFy = fy != null && years.includes(fy) ? fy : years[years.length - 1];

  return (
    <div className="w-full px-4 py-5 sm:px-6 lg:px-10 2xl:px-14">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="icon-badge flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-primary/15 text-primary">
            <Activity size={22} strokeWidth={2.4} />
          </span>
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
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="tabs tabs-box glass-panel w-full sm:w-auto">
          <button role="tab" className={`tab flex-1 sm:flex-none ${tab === "usage" ? "tab-active" : ""}`} onClick={() => setTab("usage")}>
            จำนวนการใช้งาน
          </button>
          <button role="tab" className={`tab flex-1 sm:flex-none ${tab === "kpi" ? "tab-active" : ""}`} onClick={() => setTab("kpi")}>
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
          <span suppressHydrationWarning>อัปเดต {data.loadedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</span>
          {SHEET_ID && (
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
          </div>
          {viewFy ? (
            <UsageSection key={`${test}-${viewFy}`} data={data} test={test} fy={viewFy} />
          ) : (
            <StatusBanner type="info" message={`ยังไม่มีข้อมูลการใช้งาน ${test}`} />
          )}
        </>
      ) : (
        <KpiSection data={data} />
      )}

      <footer className="mt-10 border-t border-base-content/6 pt-4 text-center text-[11px] text-base-content/40">
        ข้อมูลจาก Google Sheet · ปีงบประมาณนับ ต.ค.–ก.ย.
      </footer>
    </div>
  );
}
