"use client";

import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, BarChart3, Building2, CalendarClock, ChevronDown, ChevronUp, Cpu, TrendingDown, TrendingUp, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BentoCard } from "./BentoCard";
import { CountUp } from "./CountUp";
import { fiscalYearMonths, MONTH_ABBR_TH, MONTH_NAMES_TH, type TestType } from "@/lib/constants";
import type { Dataset } from "@/lib/data";
import {
  latestMonth, monthlyTotals, monthTotal, wardMonthly, wardTotals, yearlyTotals,
} from "@/lib/aggregate";
import { SERIES, useChartColors } from "@/lib/chart-colors";

function SectionTitle({ icon: Icon, title, sub, tone = "primary" }: {
  icon: LucideIcon; title: string; sub?: string; tone?: "primary" | "accent" | "secondary";
}) {
  const tones = {
    primary: "bg-primary/15 text-primary",
    accent: "bg-accent/15 text-accent",
    secondary: "bg-secondary/15 text-secondary",
  };
  return (
    <div className="mb-4 flex items-start gap-2.5">
      <span className={`icon-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-field ${tones[tone]}`}>
        <Icon size={15} strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-base-content">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-base-content/50">{sub}</p>}
      </div>
    </div>
  );
}

function Delta({ pct, label }: { pct: number | null; label: string }) {
  if (pct == null || !Number.isFinite(pct)) return <span className="text-xs text-base-content/40">{label}: —</span>;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 text-xs font-medium ${up ? "text-success" : "text-error"}`}>
      <Icon size={13} strokeWidth={2.4} />
      {up ? "+" : ""}{pct.toFixed(1)}%
      <span className="font-normal text-base-content/45">{label}</span>
    </span>
  );
}

function StatTile({ i, icon: Icon, label, value, unit, foot, tone }: {
  i: number; icon: LucideIcon; label: string; value: number; unit?: string;
  foot?: React.ReactNode; tone: "primary" | "accent" | "secondary" | "info";
}) {
  const tones = {
    primary: "bg-primary/15 text-primary",
    accent: "bg-accent/15 text-accent",
    secondary: "bg-secondary/15 text-secondary",
    info: "bg-info/15 text-info",
  };
  return (
    <BentoCard i={i} className="flex min-w-0 flex-col gap-3 !p-4 sm:!p-5">
      <div className="flex items-start gap-2 text-xs leading-snug text-base-content/60">
        <span className={`icon-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-field ${tones[tone]}`}>
          <Icon size={15} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 pt-1.5">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <CountUp value={value} className="stat-figure-num text-2xl font-semibold text-base-content sm:text-3xl" />
        {unit && <span className="text-sm text-base-content/50">{unit}</span>}
      </div>
      {foot && <div className="min-h-4">{foot}</div>}
    </BentoCard>
  );
}

/** Sum of the months that have data in BOTH years, so a half-finished year
 * is compared like-for-like rather than against a full previous year. */
function comparableChange(cur: (number | null)[], prev: (number | null)[]): number | null {
  let a = 0, b = 0, n = 0;
  cur.forEach((v, i) => {
    const p = prev[i];
    if (v != null && p != null) { a += v; b += p; n++; }
  });
  return n > 0 && b > 0 ? ((a - b) / b) * 100 : null;
}

export function UsageSection({ data, test, fy }: { data: Dataset; test: TestType; fy: number }) {
  const colors = useChartColors();
  const [showAllWards, setShowAllWards] = useState(false);
  const [selectedWard, setSelectedWard] = useState<string | null>(null);

  const months = fiscalYearMonths(fy);
  const cur = useMemo(() => monthlyTotals(data.usage, test, fy), [data.usage, test, fy]);
  const prev = useMemo(() => monthlyTotals(data.usage, test, fy - 1), [data.usage, test, fy]);
  const hasPrev = prev.some((v) => v != null);
  const yearTotal = cur.reduce<number>((s, v) => s + (v ?? 0), 0);
  const monthsWithData = cur.filter((v) => v != null).length;
  const yoy = hasPrev ? comparableChange(cur, prev) : null;

  // Latest month *within the selected fiscal year*.
  const lastIdx = cur.reduce<number>((acc, v, i) => (v != null ? i : acc), -1);
  const lastPair = lastIdx >= 0 ? months[lastIdx] : null;
  const lastVal = lastIdx >= 0 ? cur[lastIdx] : null;
  const beforeLast = lastPair
    ? monthTotal(data.usage, test, lastPair.month === 1 ? lastPair.year - 1 : lastPair.year, lastPair.month === 1 ? 12 : lastPair.month - 1)
    : null;
  const mom = lastVal != null && beforeLast ? ((lastVal - beforeLast) / beforeLast) * 100 : null;

  const wards = useMemo(() => wardTotals(data.usage, test, fy), [data.usage, test, fy]);
  const activeWards = wards.filter((w) => w.total > 0).length;
  const shownWards = showAllWards ? wards : wards.slice(0, 10);
  const maxWard = Math.max(...wards.map((w) => w.total), 1);

  const yearly = useMemo(() => yearlyTotals(data.usage, test), [data.usage, test]);
  const overallLatest = latestMonth(data.usage, test);

  const monthlyChart = months.map((m, i) => ({
    label: MONTH_ABBR_TH[m.month - 1],
    full: `${MONTH_NAMES_TH[m.month - 1]} ${m.year}`,
    current: cur[i],
    previous: prev[i],
  }));

  const wardOrder = useMemo(
    () => data.wards.filter((w) => w.test === test).map((w) => w.ward),
    [data.wards, test],
  );
  // Heat table rows follow the configured ward order; wards that have data
  // but aren't listed in "หอผู้ป่วย" are appended so nothing disappears.
  const heatRows = useMemo(() => {
    const listed = new Set(wardOrder);
    const extra = wards.map((w) => w.ward).filter((w) => !listed.has(w));
    return [...wardOrder, ...extra]
      .map((ward) => ({ ward, values: wardMonthly(data.usage, test, ward, fy) }))
      .filter((r) => r.values.some((v) => v != null));
  }, [wardOrder, wards, data.usage, test, fy]);
  const heatMax = Math.max(1, ...heatRows.flatMap((r) => r.values.map((v) => v ?? 0)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          i={0} icon={Activity} tone="primary"
          label={`ยอดการใช้งานปีงบ ${fy}`} value={yearTotal} unit="ครั้ง"
          foot={<Delta pct={yoy} label={`เทียบปีงบ ${fy - 1} (เดือนเดียวกัน)`} />}
        />
        <StatTile
          i={1} icon={CalendarClock} tone="accent"
          label={lastPair ? `เดือนล่าสุด · ${MONTH_NAMES_TH[lastPair.month - 1]} ${lastPair.year}` : "เดือนล่าสุด"}
          value={lastVal ?? 0} unit="ครั้ง"
          foot={<Delta pct={mom} label="เทียบเดือนก่อน" />}
        />
        <StatTile
          i={2} icon={BarChart3} tone="secondary"
          label="เฉลี่ยต่อเดือน" value={monthsWithData ? Math.round(yearTotal / monthsWithData) : 0} unit="ครั้ง"
          foot={<span className="text-xs text-base-content/45">มีข้อมูล {monthsWithData}/12 เดือน</span>}
        />
        <StatTile
          i={3} icon={Building2} tone="info"
          label="หอผู้ป่วยที่มีการใช้งาน" value={activeWards} unit="หอ"
          foot={<span className="text-xs text-base-content/45">จากที่ลงทะเบียน {wardOrder.length} หอ</span>}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <BentoCard i={4} className="flex flex-col xl:col-span-2">
          <SectionTitle
            icon={BarChart3}
            title={`จำนวนการใช้งาน ${test} รายเดือน · ปีงบ ${fy}`}
            sub={hasPrev ? `เส้นประ = ปีงบ ${fy - 1}` : undefined}
          />
          <div className="h-64 xl:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyChart} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} width={48}
                  tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v))} />
                <Tooltip
                  contentStyle={colors.tooltip} cursor={{ fill: colors.cursor }}
                  labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
                  formatter={(v, name) => [v == null ? "ไม่มีข้อมูล" : Number(v).toLocaleString(), name === "current" ? `ปีงบ ${fy}` : `ปีงบ ${fy - 1}`]}
                />
                <Bar dataKey="current" fill={SERIES.current} radius={[6, 6, 0, 0]} maxBarSize={34} />
                {hasPrev && (
                  <Line dataKey="previous" stroke={colors.muted} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </BentoCard>

        <BentoCard i={5}>
          <SectionTitle icon={TrendingUp} tone="accent" title="แนวโน้มรายปีงบประมาณ"
            sub={overallLatest ? `ข้อมูลถึง ${MONTH_NAMES_TH[overallLatest.month - 1]} ${overallLatest.year}` : undefined} />
          {yearly.length < 2 ? (
            <p className="py-10 text-center text-sm text-base-content/50">
              มีข้อมูล {test} เพียง {yearly.length} ปีงบ — ยังเทียบแนวโน้มไม่ได้
            </p>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearly.map((y) => ({ ...y, label: `ปีงบ ${String(y.fy).slice(-2)}` }))} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} width={48}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                  <Tooltip contentStyle={colors.tooltip} cursor={{ fill: colors.cursor }}
                    formatter={(v) => [Number(v).toLocaleString(), "ยอดรวม"]} />
                  <Bar dataKey="total" fill={SERIES.accent} radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <table className="mt-3 w-full text-xs">
            <tbody>
              {yearly.map((y, idx) => {
                const p = idx > 0 ? yearly[idx - 1].total : null;
                const chg = p && y.monthsWithData === 12 ? ((y.total - p) / p) * 100 : null;
                return (
                  <tr key={y.fy} className="border-t border-base-content/6">
                    <td className="py-1.5 text-base-content/60">ปีงบ {y.fy}{y.monthsWithData < 12 && ` (${y.monthsWithData} เดือน)`}</td>
                    <td className="stat-figure-num py-1.5 text-right text-base-content/90">{y.total.toLocaleString()}</td>
                    <td className={`w-16 py-1.5 text-right ${chg == null ? "text-base-content/30" : chg >= 0 ? "text-success" : "text-error"}`}>
                      {chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </BentoCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <BentoCard i={6}>
          <SectionTitle icon={Building2} tone="secondary" title={`หอผู้ป่วยที่ใช้มากที่สุด · ปีงบ ${fy}`} sub="แตะชื่อหอเพื่อดูรายละเอียดรายเดือน" />
          <div className="space-y-2.5">
            {shownWards.map((w, idx) => {
              const share = yearTotal ? (w.total / yearTotal) * 100 : 0;
              const active = selectedWard === w.ward;
              return (
                <button
                  key={w.ward}
                  onClick={() => setSelectedWard(active ? null : w.ward)}
                  className={`grid w-full grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded-field px-1.5 py-1 text-left transition-colors ${
                    active ? "bg-primary/10" : "hover:bg-base-content/5"
                  }`}
                >
                  <span className="text-[11px] text-base-content/40">{idx + 1}</span>
                  <span className="truncate text-xs text-base-content/75" title={w.ward}>{w.ward}</span>
                  <span className="stat-figure-num w-14 text-right text-xs text-base-content/80">{w.total.toLocaleString()}</span>
                  <span className="w-10 text-right text-[11px] font-semibold text-secondary">{share.toFixed(1)}%</span>
                  <span className="col-span-3 col-start-2 h-1.5 overflow-hidden rounded-full bg-base-content/6">
                    <span className="block h-full rounded-full bg-secondary" style={{ width: `${(w.total / maxWard) * 100}%` }} />
                  </span>
                </button>
              );
            })}
          </div>
          {wards.length > 10 && (
            <button onClick={() => setShowAllWards((s) => !s)} className="btn btn-ghost btn-xs mt-3 w-full gap-1 text-base-content/60">
              {showAllWards ? <>ย่อ <ChevronUp size={14} /></> : <>ดูทั้งหมด {wards.length} หอ <ChevronDown size={14} /></>}
            </button>
          )}
        </BentoCard>

        <BentoCard i={7} className="xl:col-span-2">
          {selectedWard ? (
            <WardDetail data={data} test={test} fy={fy} ward={selectedWard} onClose={() => setSelectedWard(null)} />
          ) : (
            <HeatTable rows={heatRows} months={months} max={heatMax} fy={fy} onPick={setSelectedWard} />
          )}
        </BentoCard>
      </div>
    </div>
  );
}

function HeatTable({ rows, months, max, fy, onPick }: {
  rows: { ward: string; values: (number | null)[] }[];
  months: { year: number; month: number }[];
  max: number;
  fy: number;
  onPick: (ward: string) => void;
}) {
  return (
    <>
      <SectionTitle icon={CalendarClock} title={`ตารางการใช้งานรายหอ × รายเดือน · ปีงบ ${fy}`}
        sub="สีเข้ม = ใช้มาก · ช่อง 0 = มีการบันทึกว่าไม่มีการใช้งาน · — = ไม่มีข้อมูล" />
      <div className="max-h-[30rem] overflow-auto rounded-field border border-base-content/6">
        <table className="w-full min-w-[46rem] border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-base-200">
            <tr>
              <th className="sticky left-0 z-10 bg-base-200 px-2 py-2 text-left font-medium text-base-content/60">หอผู้ป่วย</th>
              {months.map((m) => (
                <th key={`${m.year}-${m.month}`} className="px-1 py-2 text-center font-medium text-base-content/60">
                  {MONTH_ABBR_TH[m.month - 1]}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium text-base-content/60">รวม</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = r.values.reduce<number>((s, v) => s + (v ?? 0), 0);
              return (
                <tr key={r.ward} className="border-t border-base-content/5">
                  <td className="sticky left-0 z-[1] max-w-40 truncate bg-base-200 px-2 py-1">
                    <button onClick={() => onPick(r.ward)} className="truncate text-left text-base-content/75 hover:text-primary" title={r.ward}>
                      {r.ward}
                    </button>
                  </td>
                  {r.values.map((v, i) => {
                    const t = v == null ? 0 : v / max;
                    return (
                      <td
                        key={i}
                        className={`stat-figure-num px-1 py-1 text-center ${v === 0 ? "text-error" : "text-base-content/85"}`}
                        style={{ background: v ? `color-mix(in oklab, var(--color-primary) ${Math.round(8 + t * 62)}%, transparent)` : undefined }}
                        title={v == null ? "ไม่มีข้อมูล" : v.toLocaleString()}
                      >
                        {v == null ? <span className="text-base-content/25">—</span> : v.toLocaleString()}
                      </td>
                    );
                  })}
                  <td className="stat-figure-num px-2 py-1 text-right font-semibold text-base-content/90">{total.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function WardDetail({ data, test, fy, ward, onClose }: {
  data: Dataset; test: TestType; fy: number; ward: string; onClose: () => void;
}) {
  const colors = useChartColors();
  const months = fiscalYearMonths(fy);
  const cur = wardMonthly(data.usage, test, ward, fy);
  const prev = wardMonthly(data.usage, test, ward, fy - 1);
  const hasPrev = prev.some((v) => v != null);
  const total = cur.reduce<number>((s, v) => s + (v ?? 0), 0);
  const devices = test === "Glucose" ? data.devices.filter((d) => d.ward === ward) : [];
  const chart = months.map((m, i) => ({
    label: MONTH_ABBR_TH[m.month - 1], full: `${MONTH_NAMES_TH[m.month - 1]} ${m.year}`, current: cur[i], previous: prev[i],
  }));

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="icon-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-field bg-primary/15 text-primary">
            <Building2 size={15} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-base-content">{ward}</h2>
            <p className="mt-0.5 text-xs text-base-content/50">
              {test} · ปีงบ {fy} · รวม <span className="stat-figure-num text-base-content/80">{total.toLocaleString()}</span> ครั้ง
            </p>
          </div>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-xs btn-circle" aria-label="ปิด">
          <X size={16} />
        </button>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip contentStyle={colors.tooltip} cursor={{ fill: colors.cursor }}
              labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
              formatter={(v, name) => [v == null ? "ไม่มีข้อมูล" : Number(v).toLocaleString(), name === "current" ? `ปีงบ ${fy}` : `ปีงบ ${fy - 1}`]} />
            <Legend formatter={(v) => (v === "current" ? `ปีงบ ${fy}` : `ปีงบ ${fy - 1}`)} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="current" fill={SERIES.current} radius={[5, 5, 0, 0]} maxBarSize={30} />
            {hasPrev && <Line dataKey="previous" stroke={colors.muted} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {devices.length > 0 && (
        <div className="mt-4 rounded-field border border-base-content/8 bg-base-content/3 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-base-content/60">
            <Cpu size={13} /> เครื่องที่ใช้ (SN)
          </div>
          <div className="flex flex-wrap gap-2">
            {devices.map((d) => (
              <span key={d.sn} className="badge badge-sm gap-1.5 border-base-content/10 bg-base-200/70 font-mono text-[11px]">
                {d.sn}
                <span className="font-sans text-base-content/50">
                  ปีงบ {d.fromFy ?? "?"}–{d.toFy ?? "ปัจจุบัน"}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
