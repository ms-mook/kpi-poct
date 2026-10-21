"use client";

import { useMemo, useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BarChart3, Building2, CalendarClock, ChevronDown, ChevronUp, TrendingDown, TrendingUp } from "lucide-react";
import { BentoCard } from "./BentoCard";
import { StatusBanner } from "./StatusBanner";
import { CountUp } from "./CountUp";
import { MONTH_ABBR_TH, MONTH_NAMES_TH, type TestType } from "@/lib/constants";
import type { Dataset } from "@/lib/data";
import { groupUsageByWard } from "@/lib/aggregate";
import { buildRange } from "@/lib/range";
import { SERIES, useChartColors } from "@/lib/chart-colors";

const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v));
const ymText = (m: { year: number; month: number }) => `${MONTH_ABBR_TH[m.month - 1]} ${m.year}`;

function Delta({ pct, label }: { pct: number | null; label: string }) {
  if (pct == null || !Number.isFinite(pct)) return <span className="text-xs text-base-content/40">{label}: —</span>;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 text-xs font-medium ${up ? "text-success" : "text-error"}`}>
      <Icon size={13} strokeWidth={2.4} /> {up ? "+" : ""}{pct.toFixed(1)}%
      <span className="font-normal text-base-content/45">{label}</span>
    </span>
  );
}

function Tile({ i, icon: Icon, label, value, unit, foot }: {
  i: number; icon: typeof Activity; label: string; value: number; unit: string; foot: React.ReactNode;
}) {
  return (
    <BentoCard i={i} className="flex min-w-0 flex-col gap-3 !p-4 sm:!p-5">
      <div className="flex items-start gap-2 text-xs leading-snug text-base-content/60">
        <span className="icon-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-field bg-primary/15 text-primary">
          <Icon size={15} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 pt-1.5">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <CountUp value={value} className="stat-figure-num text-2xl font-semibold text-base-content sm:text-3xl" />
        <span className="text-sm text-base-content/50">{unit}</span>
      </div>
      <div className="min-h-4">{foot}</div>
    </BentoCard>
  );
}

/** Dashboard for a custom run of months (from → to, may span fiscal years). */
export function RangeSection({ data, test, grouped, from, to }: {
  data: Dataset; test: TestType; grouped: boolean; from: number; to: number;
}) {
  const colors = useChartColors();
  const [all, setAll] = useState(false);
  const usage = useMemo(() => (grouped ? groupUsageByWard(data.usage) : data.usage), [data.usage, grouped]);
  const r = useMemo(() => buildRange(data.usage, usage, data.wards, test, from, to), [data.usage, usage, data.wards, test, from, to]);

  const n = r.months.length;
  const f = r.months[0], l = r.months[n - 1];
  const title = n === 1 ? `${MONTH_NAMES_TH[f.month - 1]} ${f.year}` : `${ymText(f)} – ${ymText(l)}`;
  const partialMonths = r.months.filter((m) => m.partial);
  const maxWard = Math.max(1, ...r.wards.map((w) => w.total));
  const shown = all ? r.wards : r.wards.slice(0, 10);
  const heatMax = Math.max(1, ...r.wards.flatMap((w) => w.values.map((v) => v ?? 0)));
  const prevText = `${ymText(r.prevLabel.from)}${n > 1 ? ` – ${ymText(r.prevLabel.to)}` : ""}`;
  const showYear = new Set(r.months.map((m) => m.year)).size > 1;

  const chart = r.months.map((m) => ({
    label: showYear ? `${MONTH_ABBR_TH[m.month - 1]} ${String(m.year).slice(-2)}` : MONTH_ABBR_TH[m.month - 1],
    full: `${MONTH_NAMES_TH[m.month - 1]} ${m.year}`,
    current: m.total, previous: m.prev,
    partial: m.partial ? `กรอกแล้ว ${m.filled}/${m.expected} หอ (ยังไม่ครบ)` : null,
  }));

  return (
    <div className="space-y-4">
      {partialMonths.length > 0 && (
        <StatusBanner type="info"
          title={`กำลังกรอกข้อมูล ${partialMonths.map((m) => `${MONTH_NAMES_TH[m.month - 1]} ${m.year} (${m.filled}/${m.expected} หอ)`).join(", ")}`}
          message="เดือนที่ยังกรอกไม่ครบจะแสดงเป็นแท่งจาง และไม่นับในยอดรวม ค่าเฉลี่ย และการเปรียบเทียบ จนกว่าจะกรอกครบ 90% ของหอ" />
      )}
      {r.counted === 0 && <StatusBanner type="info" message="ช่วงที่เลือกยังไม่มีเดือนที่ข้อมูลครบ — ลองเลือกช่วงอื่น" />}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Tile i={0} icon={Activity} label={`ยอดการใช้งานรวม · ${title}`} value={r.total} unit="ครั้ง"
          foot={<Delta pct={r.change} label={`เทียบช่วงก่อนหน้า (${prevText})`} />} />
        <Tile i={1} icon={CalendarClock} label="เฉลี่ยต่อเดือน" value={r.counted ? Math.round(r.total / r.counted) : 0} unit="ครั้ง/เดือน"
          foot={<span className="text-xs text-base-content/45">นับ {r.counted}/{n} เดือน</span>} />
        <Tile i={2} icon={BarChart3} label="เฉลี่ยต่อวัน" value={r.days ? Math.round(r.total / r.days) : 0} unit="ครั้ง/วัน"
          foot={<span className="text-xs text-base-content/45">{r.days} วัน</span>} />
        <Tile i={3} icon={TrendingUp} label="เดือนที่ใช้สูงสุด" value={r.peak?.total ?? 0} unit="ครั้ง"
          foot={<span className="text-xs text-base-content/45">{r.peak ? `${MONTH_NAMES_TH[r.peak.month - 1]} ${r.peak.year}` : "—"}</span>} />
      </div>

      <BentoCard i={4}>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-base-content">จำนวนการใช้งาน {test} รายเดือน · {title}</h2>
          <p className="mt-0.5 text-xs text-base-content/50">เส้นประ = ช่วงก่อนหน้า ({prevText}) เรียงตามลำดับเดือน</p>
        </div>
        <div className="h-64 xl:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} interval={n > 14 ? "preserveStartEnd" : 0} />
              <YAxis tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={fmtK} />
              <Tooltip contentStyle={colors.tooltip} cursor={{ fill: colors.cursor }}
                labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
                formatter={(v, name, item) => [
                  v == null ? "ไม่มีข้อมูล" : `${Number(v).toLocaleString()}${name === "current" && (item?.payload as { partial?: string })?.partial ? ` · ${(item.payload as { partial: string }).partial}` : ""}`,
                  name === "current" ? "ช่วงที่เลือก" : "ช่วงก่อนหน้า"]} />
              <Bar dataKey="current" fill={SERIES.current} radius={[6, 6, 0, 0]} maxBarSize={34}>
                {chart.map((c, i) => <Cell key={i} fill={SERIES.current} fillOpacity={r.months[i].partial ? 0.3 : 1} />)}
              </Bar>
              {chart.some((c) => c.previous != null) && (
                <Line dataKey="previous" stroke={colors.muted} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </BentoCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <BentoCard i={5}>
          <div className="mb-4 flex items-start gap-2.5">
            <span className="icon-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-field bg-secondary/15 text-secondary"><Building2 size={15} strokeWidth={2.2} /></span>
            <div>
              <h2 className="text-sm font-semibold text-base-content">{grouped ? "หอผู้ป่วย" : "หอผู้ป่วย/เครื่อง"} · {title}</h2>
              <p className="mt-0.5 text-xs text-base-content/50">ยอดรวมของช่วง · % = เทียบช่วงก่อนหน้า ({prevText})</p>
            </div>
          </div>
          {r.wards.length === 0 && <p className="py-8 text-center text-sm text-base-content/50">ยังไม่มีข้อมูลในช่วงนี้</p>}
          <div className="space-y-2.5">
            {shown.map((w, idx) => (
              <div key={w.ward} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-x-2 px-1.5 py-1">
                <span className="text-[11px] text-base-content/40">{idx + 1}</span>
                <span className="truncate text-xs text-base-content/75" title={w.ward}>{w.ward}</span>
                <span className="stat-figure-num w-14 text-right text-xs text-base-content/80">{w.total.toLocaleString()}</span>
                <span className={`w-14 text-right text-[11px] font-semibold ${w.change == null ? "text-base-content/30" : w.change >= 0 ? "text-success" : "text-error"}`}>
                  {w.change == null ? "—" : `${w.change >= 0 ? "+" : ""}${w.change.toFixed(0)}%`}
                </span>
                <span className="col-span-3 col-start-2 h-1.5 overflow-hidden rounded-full bg-base-content/6">
                  <span className="block h-full rounded-full bg-secondary" style={{ width: `${(w.total / maxWard) * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
          {r.wards.length > 10 && (
            <button onClick={() => setAll((s) => !s)} className="btn btn-ghost btn-xs mt-3 w-full gap-1 text-base-content/60">
              {all ? <>ย่อ <ChevronUp size={14} /></> : <>ดูทั้งหมด {r.wards.length} รายการ <ChevronDown size={14} /></>}
            </button>
          )}
        </BentoCard>

        <BentoCard i={6} className="xl:col-span-2">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-base-content">ตารางการใช้งานรายหอ × รายเดือน · {title}</h2>
            <p className="mt-0.5 text-xs text-base-content/50">สีเข้ม = ใช้มาก · — = ไม่มีข้อมูล · * = กรอกยังไม่ครบ ไม่นับในยอดรวม</p>
          </div>
          <div tabIndex={0} role="region" aria-label={`ตารางการใช้งานรายหอ ${title}`}
            className="max-h-[30rem] overflow-auto rounded-field border border-base-content/6 focus-visible:outline-2 focus-visible:outline-primary">
            <table className="w-full border-collapse text-[11px]" style={{ minWidth: `${Math.max(46, 10 + n * 3.2)}rem` }}>
              <thead className="sticky top-0 z-10 bg-base-200">
                <tr>
                  <th className="sticky left-0 z-10 bg-base-200 px-2 py-2 text-left font-medium text-base-content/60">หอผู้ป่วย</th>
                  <th className="px-2 py-2 text-right font-medium text-base-content/60">รวม</th>
                  {r.months.map((m) => (
                    <th key={`${m.year}-${m.month}`} className="px-1 py-2 text-center font-medium text-base-content/60 whitespace-nowrap">
                      {MONTH_ABBR_TH[m.month - 1]}{showYear && <span className="block text-[10px] font-normal text-base-content/40">{String(m.year).slice(-2)}</span>}{m.partial && "*"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.wards.map((w) => (
                  <tr key={w.ward} className="border-t border-base-content/5">
                    <td className="sticky left-0 z-[1] max-w-40 truncate bg-base-200 px-2 py-1 text-base-content/75" title={w.ward}>{w.ward}</td>
                    <td className="stat-figure-num border-r border-base-content/6 px-2 py-1 text-right font-semibold text-base-content/90">{w.total.toLocaleString()}</td>
                    {w.values.map((v, i) => (
                      <td key={i} className={`stat-figure-num px-1 py-1 text-center ${r.months[i].partial ? "italic" : ""}`}
                        style={{ background: v ? `color-mix(in oklab, var(--color-primary) ${Math.round(6 + (v / heatMax) * 46)}%, transparent)` : undefined, opacity: r.months[i].partial ? 0.6 : 1 }}
                        title={v == null ? "ไม่มีข้อมูล" : v.toLocaleString()}>
                        {v == null ? <span className="text-base-content/25">—</span> : v.toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BentoCard>
      </div>
    </div>
  );
}

