"use client";

import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { Printer } from "lucide-react";
import { LogoMark } from "../Logo";
import { MONTH_ABBR_TH, MONTH_NAMES_TH } from "@/lib/constants";
import type { Dataset } from "@/lib/data";
import { buildReport, cyPeriod, fyPeriod, monthPeriod, type PeriodKind, type Report, type ReportKpiRow, type TestReport } from "@/lib/reportBuild";
import { HEALTH_LABEL } from "@/lib/fleet";
import { keyYM, monthsWithData } from "@/lib/range";

type Signer = { name: string; role: string };
const SIGN_KEY = "kpi-poct-report-signers";
const KIND_LABEL: Record<PeriodKind, string> = { month: "รายเดือน", fy: "รายปีงบประมาณ", cy: "รายปีปฏิทิน" };
const th = (k: number) => `${MONTH_NAMES_TH[keyYM(k).month - 1]} ${keyYM(k).year}`;
const ab = (k: number) => `${MONTH_ABBR_TH[keyYM(k).month - 1]} ${String(keyYM(k).year).slice(-2)}`;
const n0 = (v: number | null) => (v == null ? "–" : Math.round(v).toLocaleString());
const pct = (v: number | null, d = 1) => (v == null ? "–" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`);
const thaiDate = (d: Date) => `${d.getDate()} ${MONTH_NAMES_TH[d.getMonth()]} ${d.getFullYear() + 543}`;

/** Rendered only after sign-in (client side), so reading storage in the initialiser is safe. */
function loadSigners(): { maker: Signer; approver: Signer } {
  const blank = { name: "", role: "" };
  try {
    const raw = localStorage.getItem(SIGN_KEY);
    if (raw) { const s = JSON.parse(raw); return { maker: s.maker ?? blank, approver: s.approver ?? blank }; }
  } catch { /* storage blocked */ }
  return { maker: blank, approver: blank };
}

export function ReportBuilder({ data }: { data: Dataset }) {
  const [kind, setKind] = useState<PeriodKind>("month");
  const [sel, setSel] = useState<Record<PeriodKind, number | null>>({ month: null, fy: null, cy: null });
  const [signers, setSigners] = useState<{ maker: Signer; approver: Signer }>(loadSigners);
  const maker = signers.maker, approver = signers.approver;
  const setMaker = (v: Signer) => setSigners((s) => ({ ...s, maker: v }));
  const setApprover = (v: Signer) => setSigners((s) => ({ ...s, approver: v }));
  const saveSigners = (m: Signer, a: Signer) => { try { localStorage.setItem(SIGN_KEY, JSON.stringify({ maker: m, approver: a })); } catch { /* ignore */ } };

  const opts = useMemo(() => {
    const months = Array.from(new Set([...monthsWithData(data.usage, "Glucose"), ...monthsWithData(data.usage, "Blood gas")])).sort((a, b) => b - a);
    const fys = Array.from(new Set(months.map((k) => (keyYM(k).month >= 10 ? keyYM(k).year + 1 : keyYM(k).year)))).sort((a, b) => b - a);
    const cys = Array.from(new Set(months.map((k) => keyYM(k).year))).sort((a, b) => b - a);
    return { months, fys, cys };
  }, [data.usage]);
  const list = kind === "month" ? opts.months : kind === "fy" ? opts.fys : opts.cys;
  const value = sel[kind] != null && list.includes(sel[kind]!) ? sel[kind]! : list[0] ?? null;

  const report = useMemo(() => {
    if (value == null) return null;
    return buildReport(data, kind === "month" ? monthPeriod(value) : kind === "fy" ? fyPeriod(value) : cyPeriod(value));
  }, [data, kind, value]);

  return (
    <div className="space-y-4">
      <section className="glass-panel space-y-4 rounded-box p-4 sm:p-5 print:hidden">
        <div>
          <h2 className="text-sm font-semibold text-base-content">สร้างรายงานสรุป (PDF)</h2>
          <p className="mt-0.5 text-xs text-base-content/60">เลือกช่วงเวลา ตรวจตัวอย่างด้านล่าง แล้วกด “พิมพ์ / บันทึกเป็น PDF” — ในหน้าต่างพิมพ์เลือกปลายทางเป็น “บันทึกเป็น PDF” (ขนาด A4)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="join" role="group" aria-label="ประเภทรายงาน">
            {(Object.keys(KIND_LABEL) as PeriodKind[]).map((k) => (
              <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)} className={`btn join-item btn-sm ${kind === k ? "btn-primary" : "border-base-content/10 bg-base-200/60 text-base-content/70"}`}>{KIND_LABEL[k]}</button>
            ))}
          </div>
          <select aria-label="ช่วงเวลา" value={value ?? ""} onChange={(e) => setSel((s) => ({ ...s, [kind]: Number(e.target.value) }))} className="select select-sm select-bordered w-52 bg-base-200/60">
            {list.map((v) => <option key={v} value={v}>{kind === "month" ? th(v) : kind === "fy" ? `ปีงบประมาณ ${v}` : `ปีปฏิทิน ${v}`}</option>)}
          </select>
          <button className="btn btn-primary btn-sm ml-auto gap-1.5" disabled={!report} onClick={() => window.print()}><Printer size={15} /> พิมพ์ / บันทึกเป็น PDF</button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {([["ผู้จัดทำ", maker, setMaker, (s: Signer) => saveSigners(s, approver)], ["ผู้อนุมัติ", approver, setApprover, (s: Signer) => saveSigners(maker, s)]] as const).map(([label, s, set, persist]) => (
            <fieldset key={label} className="rounded-field border border-base-content/8 p-3">
              <legend className="px-1 text-xs text-base-content/60">{label} (ไม่บังคับ — เว้นว่างไว้เซ็นมือได้)</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input aria-label={`${label} ชื่อ-สกุล`} placeholder="ชื่อ - สกุล" value={s.name} onChange={(e) => { const v = { ...s, name: e.target.value }; set(v); persist(v); }} className="input input-sm input-bordered bg-base-200/60" />
                <input aria-label={`${label} ตำแหน่ง`} placeholder="ตำแหน่ง" value={s.role} onChange={(e) => { const v = { ...s, role: e.target.value }; set(v); persist(v); }} className="input input-sm input-bordered bg-base-200/60" />
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      {!report ? (
        <p className="py-10 text-center text-sm text-base-content/55 print:hidden">ยังไม่มีข้อมูลสำหรับสร้างรายงาน</p>
      ) : (
        <div className="report-scroll overflow-x-auto rounded-box print:overflow-visible" tabIndex={0} role="region" aria-label="ตัวอย่างรายงาน">
          <ReportSheet report={report} maker={maker} approver={approver} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sheet (always light: it is paper)
// ---------------------------------------------------------------------------

const H2 = "mb-2 mt-5 border-b border-slate-300 pb-1 text-[13px] font-semibold text-slate-900";
const TH = "bg-slate-100 px-1.5 py-1 text-[10px] font-semibold text-slate-700";
const TD = "border-t border-slate-200 px-1.5 py-1 text-[10px] text-slate-800";

function ReportSheet({ report, maker, approver }: { report: Report; maker: Signer; approver: Signer }) {
  const { period } = report;
  const year = period.kind !== "month";
  const now = new Date();
  return (
    <article className="report-sheet mx-auto w-[794px] bg-white px-10 py-9 text-slate-900 shadow-lg print:w-auto print:p-0 print:pr-[2px] print:shadow-none">
      <header className="flex items-center gap-3 border-b-2 border-slate-800 pb-3">
        <LogoMark size={52} />
        <div className="leading-tight">
          <h1 className="text-lg font-bold">รายงานสรุปการใช้งานเครื่อง POCT และตัวชี้วัดคุณภาพ</h1>
          <p className="text-[11px] text-slate-600">KPI Dashboard — POCT Center · หน่วยเจาะเลือดเก็บสิ่งส่งตรวจและ POCT · รพ.ศรีนครินทร์</p>
        </div>
      </header>
      <div className="mt-2 flex flex-wrap justify-between gap-x-6 text-[11px] text-slate-700">
        <span><b>ช่วงเวลา:</b> {period.label}</span>
        <span><b>ข้อมูลถึง:</b> {report.dataUntil ? th(report.dataUntil) : "—"} · <b>จัดทำเมื่อ:</b> {thaiDate(now)}</span>
      </div>

      <h2 className={H2}>1. สรุปภาพรวม</h2>
      <ul className="list-disc space-y-1 pl-5 text-[11px] leading-relaxed">
        {report.summaryLines.map((l) => <li key={l}>{l}</li>)}
      </ul>
      {report.partial.length > 0 && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
          หมายเหตุ: เดือนที่ยังกรอกข้อมูลไม่ครบ (ต่ำกว่า 90% ของหอ) ไม่ถูกนับในยอดรวม ค่าเฉลี่ย และการเปรียบเทียบ — {report.partial.map((p) => `${p.test} ${th(p.key)} (${p.filled}/${p.expected} หอ)`).join(", ")}
        </p>
      )}

      {report.tests.map((t, i) => <TestBlock key={t.test} t={t} no={`2.${i + 1}`} period={report.period} />)}

      <h2 className={H2}>3. ตัวชี้วัดคุณภาพ</h2>
      <KpiTable report={report} />

      <h2 className={H2}>4. สถานะเครื่องตรวจ (SN)</h2>
      <FleetBlock report={report} />

      {year && (
        <>
          <h2 className={`${H2} break-before-page`}>ภาคผนวก — ตารางการใช้งานรายหอ × เดือน</h2>
          {report.tests.filter((t) => t.hasData).map((t) => <Appendix key={t.test} t={t} />)}
        </>
      )}

      <h2 className={H2}>หมายเหตุวิธีคำนวณ</h2>
      <ul className="list-disc space-y-0.5 pl-5 text-[10px] leading-relaxed text-slate-700">
        <li>ปีงบประมาณนับ ต.ค.–ก.ย. · % เปลี่ยนแปลงเทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน และ/หรือช่วงเดียวกันของปีก่อน เฉพาะเดือนที่มีข้อมูลครบทั้งสองฝั่ง</li>
        <li>ตัวชี้วัดที่ ND (ไม่ได้ดำเนินการ) ไม่นำมาคิดร้อยละ · ค่าทั้งช่วงของตัวชี้วัดแบบอัตราส่วนคิดจากผลรวมตัวตั้ง ÷ ผลรวมตัวหารของเดือนที่ดำเนินการ, แบบร้อยละโดยตรงใช้ค่าเฉลี่ยของเดือนที่มีค่า</li>
        <li>ยอดใช้งานต่ำผิดปกติ = ต่ำกว่า 40% ของมัธยฐาน 12 เดือนก่อนหน้าของหอนั้น (ไม่นับหอที่ใช้น้อยกว่า 100 ครั้ง/เดือน) · สถานะเครื่องประเมินจากยอดของหอที่เครื่องอยู่ เทียบเดือนล่าสุดที่ข้อมูลครบกับ 6 เดือนก่อนหน้า</li>
        {year && <li>การพยากรณ์ใช้ค่าเฉลี่ย 12 เดือนล่าสุด × ดัชนีฤดูกาล (ช่วงความเชื่อมั่น ~80%) คาดการณ์ได้เฉพาะรูปแบบเดิม ไม่รวมหอใหม่/ปิดหอ/เปลี่ยนเครื่อง</li>}
      </ul>

      <div className="mt-8 grid grid-cols-2 gap-10 break-inside-avoid text-[11px]">
        {([["ผู้จัดทำ", maker], ["ผู้อนุมัติ", approver]] as const).map(([label, s]) => (
          <div key={label} className="text-center">
            <p className="mb-9 text-left font-semibold">{label}</p>
            <div className="border-b border-slate-700" />
            <p className="mt-1">( {s.name || " ".repeat(30)} )</p>
            <p className="text-slate-600">ตำแหน่ง {s.role || " ".repeat(24)}</p>
            <p className="text-slate-600">วันที่ ........ / ........ / ............</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function Tile({ label, value, foot }: { label: string; value: string; foot?: string }) {
  return (
    <div className="rounded border border-slate-300 px-2 py-1.5">
      <div className="text-[9px] text-slate-600">{label}</div>
      <div className="text-[15px] font-bold leading-tight">{value}</div>
      {foot && <div className="text-[9px] text-slate-600">{foot}</div>}
    </div>
  );
}

function TestBlock({ t, no, period }: { t: TestReport; no: string; period: Report["period"] }) {
  const r = t.range;
  const month = period.kind === "month";
  const topN = month ? 10 : 15;
  const chartRows = t.chart.months.map((m) => ({ label: ab(m.year * 100 + m.month), current: m.total, previous: m.prev, partial: m.partial }));
  const prevText = month ? "เทียบเดือนก่อน" : "เทียบช่วงก่อนหน้า";
  return (
    <section className="break-inside-avoid-page">
      <h2 className={H2}>{no} การใช้งาน {t.test}</h2>
      {!t.hasData ? <p className="text-[11px] text-slate-600">ยังไม่มีข้อมูลในช่วงนี้</p> : (
        <>
          <div className="grid grid-cols-4 gap-2">
            <Tile label="ยอดรวม (ครั้ง)" value={n0(r.total)} foot={`${prevText} ${pct(r.change)}`} />
            <Tile label="เทียบช่วงเดียวกันปีก่อน" value={pct(t.yoy)} foot="เฉพาะเดือนที่ข้อมูลครบทั้งสองปี" />
            <Tile label={month ? "เฉลี่ยต่อวัน" : "เฉลี่ยต่อเดือน"} value={n0(month ? (r.days ? r.total / r.days : null) : (r.counted ? r.total / r.counted : null))} foot={month ? `${r.days} วัน` : `นับ ${r.counted}/${r.months.length} เดือน`} />
            <Tile label="เดือนที่ใช้สูงสุด" value={n0(r.peak?.total ?? null)} foot={r.peak ? th(r.peak.year * 100 + r.peak.month) : "—"} />
          </div>
          <p className="mb-1 mt-3 text-[10px] text-slate-600">{month ? "ยอดรายเดือนย้อนหลัง 12 เดือน" : "ยอดรายเดือน"} (แท่ง) · เส้นประ = {month ? "ช่วง 12 เดือนก่อนหน้า" : "ช่วงก่อนหน้า"}</p>
          <ComposedChart width={690} height={170} data={chartRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={{ fill: "#475569", fontSize: 9 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} />
            <Bar dataKey="current" fill="#2563eb" isAnimationActive={false} radius={[3, 3, 0, 0]} maxBarSize={26} />
            <Line dataKey="previous" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
          </ComposedChart>

          <div className="mt-2 grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-[10px] font-semibold">หอที่ใช้มากสุด {topN} อันดับ ({period.short})</p>
              <table className="w-full border-collapse"><thead><tr><th className={`${TH} text-left`}>#</th><th className={`${TH} text-left`}>หอผู้ป่วย</th><th className={`${TH} text-right`}>ยอด</th><th className={`${TH} text-right`}>{month ? "% เดือนก่อน" : "% ช่วงก่อน"}</th></tr></thead>
                <tbody>{r.wards.slice(0, topN).map((w, i) => (
                  <tr key={w.ward} className="break-inside-avoid"><td className={TD}>{i + 1}</td><td className={TD}>{w.ward}</td><td className={`${TD} text-right`}>{w.total.toLocaleString()}</td><td className={`${TD} text-right ${w.change != null && w.change < 0 ? "text-red-700" : "text-emerald-700"}`}>{pct(w.change, 0)}</td></tr>
                ))}</tbody></table>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold">ยอดใช้ต่ำผิดปกติ ({t.anomalies.length} รายการ)</p>
              {t.anomalies.length === 0 ? <p className="text-[10px] text-slate-600">ไม่พบหอที่ยอดต่ำผิดปกติในช่วงนี้</p> : (
                <table className="w-full border-collapse"><thead><tr><th className={`${TH} text-left`}>หอ</th><th className={`${TH} text-left`}>เดือน</th><th className={`${TH} text-right`}>ยอด</th><th className={`${TH} text-right`}>ปกติ</th></tr></thead>
                  <tbody>{t.anomalies.slice(0, 12).map((a) => (
                    <tr key={`${a.ward}${a.year}${a.month}`} className="break-inside-avoid"><td className={TD}>{a.ward}</td><td className={TD}>{ab(a.year * 100 + a.month)}</td><td className={`${TD} text-right`}>{a.value.toLocaleString()}</td><td className={`${TD} text-right`}>~{Math.round(a.typical).toLocaleString()}</td></tr>
                  ))}</tbody></table>
              )}
              {t.anomalies.length > 12 && <p className="mt-1 text-[9px] text-slate-500">แสดง 12 จาก {t.anomalies.length} รายการ</p>}
              {t.forecast && (
                <p className="mt-3 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-[10px]">
                  <b>พยากรณ์ 12 เดือนข้างหน้า:</b> ~{n0(t.forecast.total)} ครั้ง (ช่วง {n0(t.forecast.low)}–{n0(t.forecast.high)}){t.forecast.mape != null && ` · ทดสอบย้อนหลังคลาดเคลื่อน ~${t.forecast.mape.toFixed(1)}%/เดือน`}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function statusCls(s: "pass" | "fail" | null, nd: boolean) {
  return nd ? "bg-slate-200 italic text-slate-600" : s === "pass" ? "bg-emerald-100 text-emerald-800" : s === "fail" ? "bg-red-100 text-red-800" : "";
}
const cellText = (row: ReportKpiRow, v: number | null, nd: boolean) => (nd ? "ND" : v == null ? "–" : row.asCount ? `${v.toLocaleString()} คน` : `${v.toFixed(row.cfg.decimals)}%`);

function KpiTable({ report }: { report: Report }) {
  const single = report.kpiMonths.length === 1;
  return (
    <table className="w-full border-collapse">
      <thead><tr>
        <th className={`${TH} text-left`}>ตัวชี้วัด</th><th className={`${TH} text-center`}>เกณฑ์</th>
        {!single && report.kpiMonths.map((m) => <th key={m.year * 100 + m.month} className={`${TH} text-center`}>{ab(m.year * 100 + m.month)}</th>)}
        <th className={`${TH} text-center`}>{single ? "ผล" : "ทั้งช่วง"}</th><th className={`${TH} text-center`}>สถานะ</th>
      </tr></thead>
      <tbody>
        {report.kpi.map((r) => {
          const nd = r.cells.every((c) => c.value == null) && r.cells.some((c) => c.nd);
          return (
            <tr key={r.cfg.id} className="break-inside-avoid">
              <td className={`${TD} w-56`}><div className="font-medium leading-tight">{r.title}</div><div className="leading-tight text-slate-600">{r.sub}</div></td>
              <td className={`${TD} whitespace-nowrap text-center`}>{r.targetText}</td>
              {!single && r.cells.map((c, i) => <td key={i} className={`${TD} whitespace-nowrap text-center ${statusCls(c.status, c.nd)}`}>{cellText(r, c.value, c.nd)}</td>)}
              <td className={`${TD} whitespace-nowrap text-center font-semibold ${statusCls(r.summary.status, single && nd)}`}>
                {cellText(r, r.summary.value, nd)}{!single && r.summary.months ? <span className="block text-[8px] font-normal text-slate-600">{r.summary.months} เดือน</span> : null}
              </td>
              <td className={`${TD} bg-white text-center`}>{r.summary.status === "pass" ? "ผ่าน" : r.summary.status === "fail" ? "ไม่ผ่าน" : nd ? "ND" : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FleetBlock({ report }: { report: Report }) {
  return (
    <div className="space-y-3">
      {report.tests.map((t) => (
        <div key={t.test} className="break-inside-avoid">
          <p className="text-[11px]"><b>{t.test}</b> — ทั้งหมด {t.fleet.devices.length} เครื่อง · อยู่ในหอ {t.fleet.inWard} · ไม่ได้อยู่หอใด {t.fleet.idle} · ควรตรวจสอบ {t.fleet.check.length}{t.fleet.asOf ? ` (ประเมินจากข้อมูลถึง ${th(t.fleet.asOf)})` : ""}</p>
          {t.fleet.devices.length === 0 && <p className="text-[10px] text-slate-600">ยังไม่มีข้อมูลเครื่อง</p>}
          {t.fleet.check.length > 0 && (
            <table className="mt-1 w-full border-collapse"><thead><tr><th className={`${TH} text-left`}>SN</th><th className={`${TH} text-left`}>หอปัจจุบัน</th><th className={`${TH} text-right`}>ยอดเดือนล่าสุด</th><th className={`${TH} text-right`}>เฉลี่ย 6 เดือนก่อน</th><th className={`${TH} text-left`}>สถานะ</th></tr></thead>
              <tbody>{t.fleet.check.map((d) => (
                <tr key={d.sn} className="break-inside-avoid"><td className={`${TD} font-mono`}>{d.sn}</td><td className={TD}>{d.current?.ward ?? "—"}</td><td className={`${TD} text-right`}>{n0(d.usageLast)}</td><td className={`${TD} text-right`}>{n0(d.avgPrev)}</td><td className={TD}>{HEALTH_LABEL[d.health]}{d.note ? ` · ${d.note}` : ""}</td></tr>
              ))}</tbody></table>
          )}
        </div>
      ))}
    </div>
  );
}

function Appendix({ t }: { t: TestReport }) {
  const r = t.range;
  return (
    <section className="mb-4">
      <p className="mb-1 text-[11px] font-semibold">{t.test} (* = กรอกยังไม่ครบ ไม่นับในยอดรวม)</p>
      <table className="w-full border-collapse">
        <thead className="table-header-group"><tr>
          <th className={`${TH} text-left`}>หอผู้ป่วย</th><th className={`${TH} text-right`}>รวม</th>
          {r.months.map((m) => <th key={m.year * 100 + m.month} className={`${TH} text-right`}>{MONTH_ABBR_TH[m.month - 1]}{m.partial && "*"}</th>)}
        </tr></thead>
        <tbody>{r.wards.map((w) => (
          <tr key={w.ward} className="break-inside-avoid"><td className={`${TD} whitespace-nowrap`}>{w.ward}</td><td className={`${TD} text-right font-semibold`}>{w.total.toLocaleString()}</td>
            {w.values.map((v, i) => <td key={i} className={`${TD} text-right ${r.months[i].partial ? "italic text-slate-500" : ""}`}>{v == null ? "–" : v.toLocaleString()}</td>)}</tr>
        ))}</tbody>
        <tfoot><tr className="font-semibold"><td className={`${TD} border-t-2 border-slate-500`}>รวมทุกหอ</td><td className={`${TD} border-t-2 border-slate-500 text-right`}>{r.total.toLocaleString()}</td>
          {r.months.map((m, i) => <td key={i} className={`${TD} border-t-2 border-slate-500 text-right`}>{m.total == null || m.partial ? "–" : m.total.toLocaleString()}</td>)}</tr></tfoot>
      </table>
    </section>
  );
}
