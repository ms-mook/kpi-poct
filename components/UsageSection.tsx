"use client";

import { useMemo, useRef, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, AlertTriangle, BarChart3, Building2, CalendarClock, ChevronDown, ChevronUp, Cpu,
  TrendingDown, TrendingUp, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BentoCard } from "./BentoCard";
import { StatusBanner } from "./StatusBanner";
import { CountUp } from "./CountUp";
import { fiscalYearMonths, MONTH_ABBR_TH, MONTH_NAMES_TH, type TestType } from "@/lib/constants";
import type { Dataset, UsageRow } from "@/lib/data";
import {
  daysInMonth, detectAnomalies, groupUsageByWard, latestCompleteMonth, latestMonth, monthCompleteness, monthlyTotals, monthTotal,
  wardGroupName, wardMonthly, wardTotalsForMonth, wardTotalsWithChange, yearlyTotals, type UsageAnomaly,
} from "@/lib/aggregate";
import { SERIES, useChartColors } from "@/lib/chart-colors";

type Tone = "primary" | "accent" | "secondary" | "info" | "warning";
const TONES: Record<Tone, string> = {
  primary: "bg-primary/15 text-primary",
  accent: "bg-accent/15 text-accent",
  secondary: "bg-secondary/15 text-secondary",
  info: "bg-info/15 text-info",
  warning: "bg-warning/15 text-warning",
};

function SectionTitle({ icon: Icon, title, sub, tone = "primary", right }: {
  icon: LucideIcon; title: string; sub?: React.ReactNode; tone?: Tone; right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={`icon-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-field ${TONES[tone]}`}>
          <Icon size={15} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-base-content">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-base-content/50">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function Delta({ pct, label }: { pct: number | null; label?: string }) {
  if (pct == null || !Number.isFinite(pct)) {
    return <span className="text-xs text-base-content/40">{label ? `${label}: —` : "—"}</span>;
  }
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 text-xs font-medium ${up ? "text-success" : "text-error"}`}>
      <Icon size={13} strokeWidth={2.4} />
      {up ? "+" : ""}{pct.toFixed(1)}%
      {label && <span className="font-normal text-base-content/45">{label}</span>}
    </span>
  );
}

function StatTile({ i, icon: Icon, label, value, unit, foot, tone, onClick }: {
  i: number; icon: LucideIcon; label: string; value: number; unit?: string;
  foot?: React.ReactNode; tone: Tone; onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start gap-2 text-xs leading-snug text-base-content/60">
        <span className={`icon-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-field ${TONES[tone]}`}>
          <Icon size={15} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 pt-1.5 text-left">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <CountUp value={value} className="stat-figure-num text-2xl font-semibold text-base-content sm:text-3xl" />
        {unit && <span className="text-sm text-base-content/50">{unit}</span>}
      </div>
      {foot && <div className="min-h-4 text-left">{foot}</div>}
    </>
  );
  return (
    <BentoCard i={i} className={`flex min-w-0 flex-col !p-0 ${onClick ? "cursor-pointer" : ""}`}>
      {onClick ? (
        <button onClick={onClick} className="flex h-full flex-col gap-3 p-4 sm:p-5">{body}</button>
      ) : (
        <div className="flex h-full flex-col gap-3 p-4 sm:p-5">{body}</div>
      )}
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

const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v));
const anomalyKey = (ward: string, year: number, month: number) => `${ward}|${year}|${month}`;

type SortMode = "total" | "up" | "down";

export function UsageSection({ data, test, fy, grouped, monthIdx }: {
  data: Dataset; test: TestType; fy: number; grouped: boolean;
  /** null = whole fiscal year; 0..11 = one month (0 = ต.ค.). */
  monthIdx: number | null;
}) {
  const colors = useChartColors();
  const [showAllWards, setShowAllWards] = useState(false);
  const [selectedWard, setSelectedWard] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("total");
  const detailRef = useRef<HTMLDivElement>(null);
  const anomalyRef = useRef<HTMLDivElement>(null);

  // "รวมรายหอ" folds หอผู้ป่วย 4ข(1)/(2)/(3) into one ward everywhere below.
  const usage: UsageRow[] = useMemo(() => (grouped ? groupUsageByWard(data.usage) : data.usage), [data.usage, grouped]);

  const months = fiscalYearMonths(fy);
  // Completeness is judged on raw rows (per meter), whatever the grouping.
  const completeness = useMemo(() => monthCompleteness(data.usage, data.wards, test), [data.usage, data.wards, test]);
  const compOf = (m: { year: number; month: number }) => completeness.get(m.year * 100 + m.month);
  const rawCur = useMemo(() => monthlyTotals(usage, test, fy), [usage, test, fy]);
  // Half-entered months are shown (faded) but left out of every total,
  // average and comparison below.
  const partial = months.map((m, i) => rawCur[i] != null && compOf(m)?.complete === false);
  const cur = rawCur.map((v, i) => (partial[i] ? null : v));
  const partialMonths = months.map((m) => ({ ...m, c: compOf(m) })).filter((_, idx) => partial[idx]);
  const prev = useMemo(() => monthlyTotals(usage, test, fy - 1), [usage, test, fy]);
  const hasPrev = prev.some((v) => v != null);
  const yearTotal = cur.reduce<number>((s, v) => s + (v ?? 0), 0);
  const monthsWithData = cur.filter((v) => v != null).length;
  const yoy = hasPrev ? comparableChange(cur, prev) : null;
  const daysWithData = months.reduce((s, m, i) => s + (cur[i] != null ? daysInMonth(m.year, m.month) : 0), 0);

  // Latest month *within the selected fiscal year*.
  const lastIdx = cur.reduce<number>((acc, v, i) => (v != null ? i : acc), -1);
  const lastPair = lastIdx >= 0 ? months[lastIdx] : null;
  const lastVal = lastIdx >= 0 ? cur[lastIdx] : null;
  const beforeLast = lastPair
    ? monthTotal(usage, test, lastPair.month === 1 ? lastPair.year - 1 : lastPair.year, lastPair.month === 1 ? 12 : lastPair.month - 1)
    : null;
  const mom = lastVal != null && beforeLast ? ((lastVal - beforeLast) / beforeLast) * 100 : null;

  // ---- Month view (monthIdx set) ----
  const sel = monthIdx != null ? months[monthIdx] : null;
  const selLabel = sel ? `${MONTH_NAMES_TH[sel.month - 1]} ${sel.year}` : "";
  const selVal = monthIdx != null ? rawCur[monthIdx] : null;
  const selPartial = monthIdx != null && partial[monthIdx] ? compOf(months[monthIdx]) : undefined;
  const selSameMonthLastYear = monthIdx != null ? prev[monthIdx] : null;
  const selPrevMonth = sel
    ? monthTotal(usage, test, sel.month === 1 ? sel.year - 1 : sel.year, sel.month === 1 ? 12 : sel.month - 1)
    : null;
  const pct = (a: number | null, b: number | null) => (a != null && b ? ((a - b) / b) * 100 : null);

  const allAnomalies = useMemo(() => detectAnomalies(usage, test, fy), [usage, test, fy]);
  const anomalies = sel ? allAnomalies.filter((a) => a.year === sel.year && a.month === sel.month) : allAnomalies;
  const anomalySet = useMemo(() => new Set(allAnomalies.map((a) => anomalyKey(a.ward, a.year, a.month))), [allAnomalies]);
  const anomalyWards = new Set(anomalies.map((a) => a.ward)).size;

  // Year view: bars stay the fiscal-year totals, but the % beside each ward is
  // the latest complete month against the month before it (not last year).
  const wardStats = useMemo(() => {
    if (sel) return wardTotalsForMonth(usage, test, sel.year, sel.month);
    const mom = new Map(lastPair ? wardTotalsForMonth(usage, test, lastPair.year, lastPair.month).map((w) => [w.ward, w.change]) : []);
    return wardTotalsWithChange(usage, test, fy).map((w) => ({ ...w, change: mom.get(w.ward) ?? null }));
  }, [usage, test, fy, sel?.year, sel?.month, lastPair?.year, lastPair?.month]); // eslint-disable-line react-hooks/exhaustive-deps
  const momRef = lastPair
    ? {
        cur: `${MONTH_NAMES_TH[lastPair.month - 1]} ${lastPair.year}`,
        prev: lastPair.month === 1 ? `${MONTH_NAMES_TH[11]} ${lastPair.year - 1}` : `${MONTH_NAMES_TH[lastPair.month - 2]} ${lastPair.year}`,
      }
    : null;
  const yearWardNames = useMemo(() => wardTotalsWithChange(usage, test, fy).map((w) => w.ward), [usage, test, fy]);
  const sortedWards = useMemo(() => {
    if (sort === "total") return wardStats;
    const withChange = wardStats.filter((w) => w.change != null);
    return withChange.sort((a, b) => (sort === "up" ? b.change! - a.change! : a.change! - b.change!));
  }, [wardStats, sort]);
  const shownWards = showAllWards ? sortedWards : sortedWards.slice(0, 10);
  const maxWard = Math.max(...wardStats.map((w) => w.total), 1);

  const yearly = useMemo(() => yearlyTotals(usage, test), [usage, test]);
  const overallLatest = latestCompleteMonth(data.usage, data.wards, test) ?? latestMonth(usage, test);

  const monthlyChart = months.map((m, i) => ({
    label: MONTH_ABBR_TH[m.month - 1],
    full: `${MONTH_NAMES_TH[m.month - 1]} ${m.year}`,
    current: rawCur[i],
    previous: prev[i],
    partial: partial[i] ? `กรอกแล้ว ${compOf(m)?.filled}/${compOf(m)?.expected} หอ (ยังไม่ครบ)` : null,
  }));

  const wardOrder = useMemo(() => {
    const names = data.wards.filter((w) => w.test === test && w.active).map((w) => (grouped ? wardGroupName(w.ward) : w.ward));
    return Array.from(new Set(names));
  }, [data.wards, test, grouped]);
  // Heat table rows follow the configured ward order; wards that have data
  // but aren't listed in "หอผู้ป่วย" are appended so nothing disappears.
  const heatRows = useMemo(() => {
    const listed = new Set(wardOrder);
    const extra = yearWardNames.filter((w) => !listed.has(w));
    return [...wardOrder, ...extra]
      .map((ward) => ({ ward, values: wardMonthly(usage, test, ward, fy) }))
      .filter((r) => r.values.some((v) => v != null));
  }, [wardOrder, yearWardNames, usage, test, fy]);
  const heatMax = Math.max(1, ...heatRows.flatMap((r) => r.values.map((v) => v ?? 0)));

  function openWard(ward: string) {
    setSelectedWard(ward);
    // Give the detail card a frame to mount, then bring it into view (on a
    // phone it sits well below the list that was tapped).
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const showYearly = yearly.length >= 2;

  return (
    <div className="space-y-4">
      {partialMonths.length > 0 && (
        <StatusBanner
          type="info"
          title={`กำลังกรอกข้อมูล ${partialMonths.map((m) => `${MONTH_NAMES_TH[m.month - 1]} ${m.year} (${m.c?.filled}/${m.c?.expected} หอ)`).join(", ")}`}
          message="เดือนที่ยังกรอกไม่ครบจะแสดงเป็นแท่งจางในกราฟ และยังไม่นับในยอดรวม ค่าเฉลี่ย การเปรียบเทียบ และการพยากรณ์ จนกว่าจะกรอกครบ 90% ของหอ"
        />
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {sel ? (
          <>
            <StatTile
              i={0} icon={Activity} tone="primary"
              label={`ยอดการใช้งาน · ${selLabel}`} value={selVal ?? 0} unit="ครั้ง"
              foot={selVal == null
                ? <span className="text-xs text-base-content/45">ยังไม่มีข้อมูลเดือนนี้</span>
                : selPartial
                ? <span className="text-xs text-info">ยังกรอกไม่ครบ ({selPartial.filled}/{selPartial.expected} หอ)</span>
                : <Delta pct={pct(selVal, selSameMonthLastYear)} label={`เทียบ ${MONTH_ABBR_TH[sel.month - 1]} ${sel.year - 1}`} />}
            />
            <StatTile
              i={1} icon={CalendarClock} tone="accent"
              label="เทียบเดือนก่อนหน้า" value={selPrevMonth ?? 0} unit="ครั้ง"
              foot={<Delta pct={pct(selVal, selPrevMonth)} label={`${selLabel} เทียบเดือนก่อน`} />}
            />
            <StatTile
              i={2} icon={BarChart3} tone="secondary"
              label={`เฉลี่ยต่อวัน · ${selLabel}`}
              value={selVal != null ? Math.round(selVal / daysInMonth(sel.year, sel.month)) : 0} unit="ครั้ง/วัน"
              foot={<span className="text-xs text-base-content/45">{daysInMonth(sel.year, sel.month)} วัน</span>}
            />
          </>
        ) : (
          <>
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
              label="เฉลี่ยต่อวัน (ทั้งปีงบ)" value={daysWithData ? Math.round(yearTotal / daysWithData) : 0} unit="ครั้ง/วัน"
              foot={<span className="text-xs text-base-content/45">
                เฉลี่ย {monthsWithData ? Math.round(yearTotal / monthsWithData).toLocaleString() : 0} ครั้ง/เดือน · มีข้อมูล {monthsWithData}/12 เดือน
              </span>}
            />
          </>
        )}
        <StatTile
          i={3} icon={AlertTriangle} tone={anomalies.length ? "warning" : "info"}
          label={sel ? `หอที่ยอดใช้ต่ำผิดปกติ · ${selLabel}` : "เดือนที่ยอดใช้ต่ำผิดปกติ"} value={anomalies.length} unit={sel ? "หอ" : "รายการ"}
          onClick={anomalies.length ? () => anomalyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) : undefined}
          foot={<span className="text-xs text-base-content/45">
            {anomalies.length ? `${sel ? "" : `ใน ${anomalyWards} หอ · `}แตะเพื่อดูรายการ` : `ทุกหออยู่ในระดับปกติ (${wardOrder.length} ${grouped ? "หอ" : "จุด"})`}
          </span>}
        />
      </div>

      <div className={`grid grid-cols-1 gap-4 ${showYearly ? "xl:grid-cols-3" : ""}`}>
        <BentoCard i={4} className={showYearly ? "xl:col-span-2" : ""}>
          <SectionTitle
            icon={BarChart3}
            title={`จำนวนการใช้งาน ${test} รายเดือน · ปีงบ ${fy}`}
            sub={hasPrev ? `เส้นประ = ปีงบ ${fy - 1}` : `ยังไม่มีข้อมูลปีงบ ${fy - 1} ให้เทียบ`}
          />
          <div className="h-64 xl:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyChart} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={fmtK} />
                <Tooltip
                  contentStyle={colors.tooltip} cursor={{ fill: colors.cursor }}
                  labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
                  formatter={(v, name, item) => [
                    v == null ? "ไม่มีข้อมูล" : `${Number(v).toLocaleString()}${name === "current" && (item?.payload as { partial?: string })?.partial ? ` · ${(item.payload as { partial: string }).partial}` : ""}`,
                    name === "current" ? `ปีงบ ${fy}` : `ปีงบ ${fy - 1}`]}
                />
                <Bar dataKey="current" fill={SERIES.current} radius={[6, 6, 0, 0]} maxBarSize={34}>
                  {monthlyChart.map((_, i) => (
                    <Cell key={i} fill={SERIES.current} fillOpacity={partial[i] ? 0.3 : monthIdx == null || monthIdx === i ? 1 : 0.28}
                      stroke={partial[i] ? SERIES.current : undefined} strokeDasharray={partial[i] ? "3 3" : undefined} />
                  ))}
                </Bar>
                {hasPrev && (
                  <Line dataKey="previous" stroke={colors.muted} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </BentoCard>

        {showYearly && (
          <BentoCard i={5}>
            <SectionTitle icon={TrendingUp} tone="accent" title="แนวโน้มรายปีงบประมาณ"
              sub={overallLatest ? `ข้อมูลถึง ${MONTH_NAMES_TH[overallLatest.month - 1]} ${overallLatest.year}${yearly.some((y) => y.monthsWithData < 12) ? " · * = ปีงบที่ยังไม่ครบ 12 เดือน" : ""}` : undefined} />
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearly.map((y) => ({ ...y, label: `ปีงบ ${String(y.fy).slice(-2)}${y.monthsWithData < 12 ? "*" : ""}` }))} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} width={48}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                  <Tooltip contentStyle={colors.tooltip} cursor={{ fill: colors.cursor }}
                    formatter={(v) => [Number(v).toLocaleString(), "ยอดรวม"]} />
                  {/* A fiscal year still in progress is faded so its short bar isn't read as a drop. */}
                  <Bar dataKey="total" fill={SERIES.accent} radius={[6, 6, 0, 0]} maxBarSize={44}>
                    {yearly.map((y) => <Cell key={y.fy} fill={SERIES.accent} fillOpacity={y.monthsWithData < 12 ? 0.3 : 1} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
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
        )}
      </div>

      {anomalies.length > 0 && (
        <div ref={anomalyRef} className="scroll-mt-4">
          <BentoCard i={6}>
            <SectionTitle
              icon={AlertTriangle} tone="warning"
              title={sel ? `หอที่ยอดใช้ต่ำผิดปกติ · ${selLabel}` : `เดือนที่ยอดใช้ต่ำผิดปกติ · ปีงบ ${fy}`}
              sub="ต่ำกว่า 40% ของระดับปกติของหอนั้น (มัธยฐาน 12 เดือนก่อนหน้า) — ควรตรวจว่าเครื่องเสีย/ส่งซ่อม หอปิด หรือกรอกข้อมูลผิด · ไม่นับหอที่ใช้น้อยกว่า 100 ครั้ง/เดือน"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {anomalies.map((a) => <AnomalyChip key={anomalyKey(a.ward, a.year, a.month)} a={a} onPick={openWard} />)}
            </div>
          </BentoCard>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <BentoCard i={7}>
          <SectionTitle
            icon={Building2} tone="secondary"
            title={`${grouped ? "หอผู้ป่วย" : "หอผู้ป่วย/เครื่อง"} · ${sel ? selLabel : `ปีงบ ${fy}`}`}
            sub={sel
              ? `% = เทียบเดือนก่อนหน้า (${sel.month === 1 ? `${MONTH_NAMES_TH[11]} ${sel.year - 1}` : `${MONTH_NAMES_TH[sel.month - 2]} ${sel.year}`}) · แตะชื่อเพื่อดูรายละเอียด`
              : momRef ? `ยอดรวมทั้งปี · % = ${momRef.cur} เทียบเดือนก่อนหน้า (${momRef.prev}) · แตะชื่อเพื่อดูรายละเอียด` : "แตะชื่อเพื่อดูรายละเอียดรายเดือน"}
          />
          {wardStats.length === 0 && (
            <p className="py-8 text-center text-sm text-base-content/50">ยังไม่มีข้อมูล{sel ? `เดือน${selLabel}` : ""}</p>
          )}
          {wardStats.some((w) => w.change != null) && (
            <div className="join mb-3 w-full">
              {([["total", "ใช้มากสุด"], ["up", "เพิ่มขึ้น"], ["down", "ลดลง"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setSort(k)}
                  className={`btn join-item btn-xs flex-1 ${sort === k ? "btn-secondary" : "border-base-content/10 bg-base-200/60 text-base-content/70"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2.5">
            {shownWards.map((w, idx) => {
              const active = selectedWard === w.ward;
              return (
                <button
                  key={w.ward}
                  onClick={() => (active ? setSelectedWard(null) : openWard(w.ward))}
                  className={`grid w-full grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded-field px-1.5 py-1 text-left transition-colors ${
                    active ? "bg-primary/10" : "hover:bg-base-content/5"
                  }`}
                >
                  <span className="text-[11px] text-base-content/40">{idx + 1}</span>
                  <span className="truncate text-xs text-base-content/75" title={w.ward}>{w.ward}</span>
                  <span className="stat-figure-num w-14 text-right text-xs text-base-content/80">{w.total.toLocaleString()}</span>
                  <span className={`w-14 text-right text-[11px] font-semibold ${
                    w.change == null ? "text-base-content/30" : w.change >= 0 ? "text-success" : "text-error"
                  }`}>
                    {w.change == null ? "—" : `${w.change >= 0 ? "+" : ""}${w.change.toFixed(0)}%`}
                  </span>
                  <span className="col-span-3 col-start-2 h-1.5 overflow-hidden rounded-full bg-base-content/6">
                    <span className="block h-full rounded-full bg-secondary" style={{ width: `${(w.total / maxWard) * 100}%` }} />
                  </span>
                </button>
              );
            })}
          </div>
          {sortedWards.length > 10 && (
            <button onClick={() => setShowAllWards((s) => !s)} className="btn btn-ghost btn-xs mt-3 w-full gap-1 text-base-content/60">
              {showAllWards ? <>ย่อ <ChevronUp size={14} /></> : <>ดูทั้งหมด {sortedWards.length} รายการ <ChevronDown size={14} /></>}
            </button>
          )}
        </BentoCard>

        <div ref={detailRef} className="scroll-mt-4 xl:col-span-2">
          <BentoCard i={8} className="h-full">
            {selectedWard ? (
              <WardDetail data={data} usage={usage} test={test} fy={fy} ward={selectedWard} grouped={grouped}
                anomalySet={anomalySet} onClose={() => setSelectedWard(null)} />
            ) : (
              <HeatTable rows={heatRows} months={months} max={heatMax} fy={fy} anomalySet={anomalySet} onPick={openWard} highlight={monthIdx} />
            )}
          </BentoCard>
        </div>
      </div>
    </div>
  );
}

function AnomalyChip({ a, onPick }: { a: UsageAnomaly; onPick: (ward: string) => void }) {
  const drop = (1 - a.value / a.typical) * 100;
  return (
    <button onClick={() => onPick(a.ward)}
      className="flex items-center justify-between gap-3 rounded-field border border-warning/20 bg-warning/8 px-3 py-2 text-left transition-colors hover:bg-warning/15">
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-base-content/85" title={a.ward}>{a.ward}</span>
        <span className="text-[11px] text-base-content/50">{MONTH_NAMES_TH[a.month - 1]} {a.year}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="stat-figure-num block text-sm font-semibold text-warning">{a.value.toLocaleString()}</span>
        <span className="text-[11px] text-base-content/45">ปกติ ~{Math.round(a.typical).toLocaleString()} · −{drop.toFixed(0)}%</span>
      </span>
    </button>
  );
}

function HeatTable({ rows, months, max, fy, anomalySet, onPick, highlight }: {
  rows: { ward: string; values: (number | null)[] }[];
  months: { year: number; month: number }[];
  max: number;
  fy: number;
  anomalySet: Set<string>;
  onPick: (ward: string) => void;
  highlight: number | null;
}) {
  return (
    <>
      <SectionTitle icon={CalendarClock} title={`ตารางการใช้งานรายหอ × รายเดือน · ปีงบ ${fy}`}
        sub={<>สีเข้ม = ใช้มาก · <span className="rounded-sm px-1 outline outline-2 -outline-offset-2 outline-warning">กรอบเหลือง</span> = ต่ำผิดปกติ · — = ไม่มีข้อมูล</>} />
      <div className="max-h-[30rem] overflow-auto rounded-field border border-base-content/6">
        <table className="w-full min-w-[46rem] border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-base-200">
            <tr>
              <th className="sticky left-0 z-10 bg-base-200 px-2 py-2 text-left font-medium text-base-content/60">หอผู้ป่วย</th>
              <th className="px-2 py-2 text-right font-medium text-base-content/60">รวม</th>
              {months.map((m, i) => (
                <th key={`${m.year}-${m.month}`} className={`px-1 py-2 text-center font-medium ${
                  highlight === i ? "bg-primary/20 text-primary" : "text-base-content/60"}`}>
                  {MONTH_ABBR_TH[m.month - 1]}
                </th>
              ))}
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
                  <td className="stat-figure-num border-r border-base-content/6 px-2 py-1 text-right font-semibold text-base-content/90">{total.toLocaleString()}</td>
                  {r.values.map((v, i) => {
                    const t = v == null ? 0 : v / max;
                    const flagged = anomalySet.has(anomalyKey(r.ward, months[i].year, months[i].month));
                    return (
                      <td
                        key={i}
                        className={`stat-figure-num px-1 py-1 text-center ${flagged ? "font-semibold outline outline-2 -outline-offset-2 outline-warning" : ""}`}
                        style={{
                          // Flagged cells get their own warm tint; otherwise
                          // blue intensity = volume.
                          background: flagged
                            ? "color-mix(in oklab, var(--color-warning) 28%, transparent)"
                            // capped at 52% so normal text keeps ≥4.5:1 contrast in both themes
                            : v ? `color-mix(in oklab, var(--color-primary) ${Math.round(6 + t * 46)}%, transparent)` : undefined,
                          opacity: highlight == null || highlight === i ? 1 : 0.45,
                        }}
                        title={v == null ? "ไม่มีข้อมูล" : `${v.toLocaleString()}${flagged ? " · ต่ำผิดปกติ" : ""}`}
                      >
                        {v == null ? <span className="text-base-content/25">—</span> : v.toLocaleString()}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function WardDetail({ data, usage, test, fy, ward, grouped, anomalySet, onClose }: {
  data: Dataset; usage: UsageRow[]; test: TestType; fy: number; ward: string; grouped: boolean;
  anomalySet: Set<string>; onClose: () => void;
}) {
  const colors = useChartColors();
  const months = fiscalYearMonths(fy);
  const cur = wardMonthly(usage, test, ward, fy);
  const prev = wardMonthly(usage, test, ward, fy - 1);
  const hasPrev = prev.some((v) => v != null);
  const total = cur.reduce<number>((s, v) => s + (v ?? 0), 0);
  const days = months.reduce((s, m, i) => s + (cur[i] != null ? daysInMonth(m.year, m.month) : 0), 0);
  const devices = test === "Glucose"
    ? data.devices.filter((d) => (grouped ? wardGroupName(d.ward) === ward : d.ward === ward))
    : [];
  const chart = months.map((m, i) => ({
    label: MONTH_ABBR_TH[m.month - 1], full: `${MONTH_NAMES_TH[m.month - 1]} ${m.year}`, current: cur[i], previous: prev[i],
    flagged: anomalySet.has(anomalyKey(ward, m.year, m.month)),
  }));
  const flaggedCount = chart.filter((c) => c.flagged).length;

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
              {days > 0 && <> · เฉลี่ย <span className="stat-figure-num text-base-content/80">{(total / days).toFixed(1)}</span> ครั้ง/วัน</>}
              {flaggedCount > 0 && <span className="text-warning"> · ต่ำผิดปกติ {flaggedCount} เดือน</span>}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-xs gap-1" aria-label="ปิดและกลับไปที่ตาราง">
          <X size={14} /> ตาราง
        </button>
      </div>
      <div className="h-56 xl:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip contentStyle={colors.tooltip} cursor={{ fill: colors.cursor }}
              labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
              formatter={(v, name) => [v == null ? "ไม่มีข้อมูล" : Number(v).toLocaleString(), name === "current" ? `ปีงบ ${fy}` : `ปีงบ ${fy - 1}`]} />
            <Legend formatter={(v) => (v === "current" ? `ปีงบ ${fy}` : `ปีงบ ${fy - 1}`)} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="current" fill={SERIES.current} radius={[5, 5, 0, 0]} maxBarSize={30}
              shape={(props: unknown) => {
                const p = props as { x: number; y: number; width: number; height: number; payload: { flagged: boolean } };
                const h = Math.max(p.height, 0);
                return (
                  <rect x={p.x} y={p.y} width={p.width} height={h} rx={5}
                    fill={p.payload.flagged ? "var(--color-warning)" : SERIES.current} />
                );
              }} />
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
              <span key={`${d.ward}-${d.sn}`} className="badge badge-sm h-auto gap-1.5 border-base-content/10 bg-base-200/70 py-1 font-mono text-[11px]">
                {d.sn}
                <span className="font-sans text-base-content/50">
                  {grouped && d.ward !== ward && `${d.ward.replace(ward, "").trim()} · `}ปีงบ {d.fromFy ?? "?"}–{d.toFy ?? "ปัจจุบัน"}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
