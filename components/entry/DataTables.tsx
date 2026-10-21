"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, XCircle } from "lucide-react";
import { StatusBanner } from "../StatusBanner";
import { TESTS, TEST_META, type TestType } from "@/lib/constants";
import { hasMultiDeviceWards } from "@/lib/aggregate";
import type { Dataset } from "@/lib/data";
import {
  buildKpiTable, buildUsageTable, kpiCellText, reportYears, type KpiCell, type KpiRowData,
} from "@/lib/reportTables";

type Busy = "usage" | "kpi" | "both" | null;

/** Back-office tab: the two report tables on screen, each exportable to a
 * formatted Excel file (or both together in one workbook). */
export function DataTables({ data }: { data: Dataset }) {
  const years = useMemo(() => reportYears(data), [data]);
  const [fy, setFy] = useState(() => years[years.length - 1] ?? new Date().getFullYear() + 543);
  const [test, setTest] = useState<TestType>("Glucose");
  const [grouped, setGrouped] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const usage = useMemo(() => buildUsageTable(data, test, fy, grouped), [data, test, fy, grouped]);
  const kpi = useMemo(() => buildKpiTable(data, fy), [data, fy]);
  const multi = hasMultiDeviceWards(data.usage, test);

  async function run(kind: Exclude<Busy, null>) {
    setBusy(kind); setError(null);
    try {
      // Loaded on demand: the Excel library is large and only needed here.
      const x = await import("@/lib/exportExcel");
      if (kind === "usage") await x.exportUsageExcel(usage);
      else if (kind === "kpi") await x.exportKpiExcel(kpi);
      else await x.exportBothExcel(usage, kpi);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-box p-3">
        <select value={fy} onChange={(e) => setFy(Number(e.target.value))} aria-label="ปีงบประมาณ"
          className="select select-sm select-bordered w-36 bg-base-200/60">
          {years.map((y) => <option key={y} value={y}>ปีงบ {y}</option>)}
        </select>
        <div className="join">
          {TESTS.map((t) => (
            <button key={t} onClick={() => setTest(t)} title={TEST_META[t].long}
              className={`btn join-item btn-sm ${test === t ? "btn-primary" : "border-base-content/10 bg-base-200/60 text-base-content/70"}`}>
              {TEST_META[t].label}
            </button>
          ))}
        </div>
        {multi && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-base-content/70">
            <input type="checkbox" className="toggle toggle-primary toggle-sm" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
            รวมเครื่องในหอเดียวกัน
          </label>
        )}
        <button className="btn btn-primary btn-sm ml-auto gap-1.5" disabled={busy != null} onClick={() => run("both")}>
          {busy === "both" ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
          ส่งออกทั้งสองตาราง (ไฟล์เดียว)
        </button>
      </div>

      {error && <StatusBanner type="error" title="ส่งออก Excel ไม่สำเร็จ" message={error} />}

      {/* ---- Table 1: usage ---- */}
      <section className="glass-panel rounded-box p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-base-content">จำนวนการใช้งาน {test} รายหอ × เดือน · ปีงบ {fy}</h2>
            <p className="mt-0.5 text-xs text-base-content/60">
              {usage.rows.length} หอ · รวม {usage.grandTotal.toLocaleString()} ครั้ง
              {usage.partialMonths.length > 0 && ` · * ${usage.partialMonths.map((m) => m.label).join(", ")} กรอกยังไม่ครบ ไม่นับในยอดรวม`}
            </p>
          </div>
          <button className="btn btn-outline btn-sm gap-1.5" disabled={busy != null || usage.rows.length === 0} onClick={() => run("usage")}>
            {busy === "usage" ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
            ส่งออก Excel
          </button>
        </div>
        {usage.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-base-content/55">ยังไม่มีข้อมูล {test} ในปีงบ {fy}</p>
        ) : (
          <div tabIndex={0} role="region" aria-label={`ตารางจำนวนการใช้งาน ${test} ปีงบ ${fy}`} className="max-h-[32rem] overflow-auto rounded-field border border-base-content/8 focus-visible:outline-2 focus-visible:outline-primary">
            <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="text-base-content/70">
                  <th className="sticky left-0 top-0 z-30 min-w-40 bg-base-200 px-3 py-2 text-left font-medium">หอผู้ป่วย</th>
                  {usage.months.map((m) => (
                    <th key={m.label} className="sticky top-0 z-20 bg-base-200 px-2 py-2 text-right font-medium" title={m.partial ? "กรอกยังไม่ครบทุกหอ" : undefined}>
                      {m.label}{m.partial && "*"}
                    </th>
                  ))}
                  <th className="sticky top-0 z-20 bg-base-200 px-3 py-2 text-right font-semibold text-base-content">รวมปีงบ</th>
                  <th className="sticky top-0 z-20 bg-base-200 px-3 py-2 text-right font-medium">เฉลี่ย/เดือน</th>
                </tr>
              </thead>
              <tbody>
                {usage.rows.map((r, i) => (
                  <tr key={r.ward} className={i % 2 ? "bg-base-content/3" : ""}>
                    <td className="sticky left-0 z-10 whitespace-nowrap border-t border-base-content/6 bg-base-100 px-3 py-1.5 text-base-content/85">{r.ward}</td>
                    {r.values.map((v, k) => (
                      <td key={k} className={`stat-figure-num border-t border-base-content/6 px-2 py-1.5 text-right ${
                        v == null ? "text-base-content/30" : usage.months[k].partial ? "italic text-base-content/55" : "text-base-content/85"}`}>
                        {v == null ? "–" : v.toLocaleString()}
                      </td>
                    ))}
                    <td className="stat-figure-num border-t border-base-content/6 px-3 py-1.5 text-right font-semibold text-base-content">{r.total.toLocaleString()}</td>
                    <td className="stat-figure-num border-t border-base-content/6 px-3 py-1.5 text-right text-base-content/60">{r.average == null ? "–" : Math.round(r.average).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold text-base-content">
                  <td className="sticky bottom-0 left-0 z-30 border-t-2 border-primary/50 bg-base-200 px-3 py-2">รวมทุกหอ</td>
                  {usage.monthTotals.map((v, k) => (
                    <td key={k} className="stat-figure-num sticky bottom-0 z-20 border-t-2 border-primary/50 bg-base-200 px-2 py-2 text-right">
                      {v == null ? <span className="font-normal text-base-content/40">{usage.months[k].partial ? "ไม่ครบ" : "–"}</span> : v.toLocaleString()}
                    </td>
                  ))}
                  <td className="stat-figure-num sticky bottom-0 z-20 border-t-2 border-primary/50 bg-base-200 px-3 py-2 text-right">{usage.grandTotal.toLocaleString()}</td>
                  <td className="sticky bottom-0 z-20 border-t-2 border-primary/50 bg-base-200" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ---- Table 2: quality indicators ---- */}
      <section className="glass-panel rounded-box p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-base-content">ตัวชี้วัดคุณภาพ × เดือน · ปีงบ {fy}</h2>
            <p className="mt-0.5 text-xs text-base-content/60">ND = ไม่ได้ดำเนินการในเดือนนั้น (ไม่นำไปคิด %) · ค่าทั้งปีงบคิดจากเดือนที่ดำเนินการเท่านั้น</p>
          </div>
          <button className="btn btn-outline btn-sm gap-1.5" disabled={busy != null || kpi.rows.length === 0} onClick={() => run("kpi")}>
            {busy === "kpi" ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
            ส่งออก Excel
          </button>
        </div>
        {kpi.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-base-content/55">ยังไม่มีตัวชี้วัดที่ตั้งค่าไว้</p>
        ) : (
          <div tabIndex={0} role="region" aria-label={`ตารางตัวชี้วัดคุณภาพ ปีงบ ${fy}`} className="max-h-[36rem] overflow-auto rounded-field border border-base-content/8 focus-visible:outline-2 focus-visible:outline-primary">
            <table className="w-full min-w-[64rem] border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="text-base-content/70">
                  <th className="sticky left-0 top-0 z-30 min-w-64 bg-base-200 px-3 py-2 text-left font-medium">ตัวชี้วัด</th>
                  <th className="sticky top-0 z-20 bg-base-200 px-2 py-2 text-center font-medium">เกณฑ์</th>
                  {kpi.months.map((m) => <th key={m.label} className="sticky top-0 z-20 bg-base-200 px-2 py-2 text-center font-medium">{m.label}</th>)}
                  <th className="sticky top-0 z-20 bg-base-200 px-3 py-2 text-center font-semibold text-base-content">ทั้งปีงบ</th>
                </tr>
              </thead>
              <tbody>
                {kpi.rows.map((r, i) => (
                  <tr key={r.cfg.id} className={i % 2 ? "bg-base-content/3" : ""}>
                    <td className="sticky left-0 z-10 border-t border-base-content/6 bg-base-100 px-3 py-2 align-top">
                      <div className="font-medium leading-snug text-base-content/90">{r.title}</div>
                      <div className="mt-0.5 leading-snug text-base-content/60">{r.sub}</div>
                    </td>
                    <td className="whitespace-nowrap border-t border-base-content/6 px-2 py-2 text-center text-base-content/65">{r.targetText}</td>
                    {r.cells.map((c, k) => <KpiTd key={k} row={r} cell={c} />)}
                    <KpiTd row={r} cell={r.summary} strong note={r.summary.months ? `${r.summary.months} เดือน` : undefined} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function KpiTd({ row, cell, strong, note }: { row: KpiRowData; cell: KpiCell; strong?: boolean; note?: string }) {
  const tone = cell.nd ? "bg-base-content/8 italic text-base-content/65"
    : cell.status === "pass" ? "bg-success/15 text-success"
    : cell.status === "fail" ? "bg-error/15 text-error"
    : cell.value == null ? "text-base-content/30" : "text-base-content/85";
  return (
    <td className={`stat-figure-num whitespace-nowrap border-t border-base-content/6 px-2 py-2 text-center ${tone} ${strong ? "font-semibold" : ""}`}
      title={[cell.detail, note].filter(Boolean).join(" · ") || undefined}>
      <span className="inline-flex items-center gap-1">
        {strong && cell.status === "pass" && <CheckCircle2 size={12} />}
        {strong && cell.status === "fail" && <XCircle size={12} />}
        {kpiCellText(row, cell)}
      </span>
    </td>
  );
}
