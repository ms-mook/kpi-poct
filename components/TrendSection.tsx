"use client";

import { useMemo, useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Building2, Info, LineChart as LineIcon, TrendingDown, TrendingUp } from "lucide-react";
import { BentoCard } from "./BentoCard";
import { fiscalYearOf, MONTH_ABBR_TH, MONTH_NAMES_TH, TEST_META, TESTS, type TestType } from "@/lib/constants";
import type { Dataset } from "@/lib/data";
import { detectAnomalies, latestMonth, monthCompleteness } from "@/lib/aggregate";
import { forecastMonthly, trendPctPerMonth } from "@/lib/forecast";
import { useChartColors } from "@/lib/chart-colors";

const mkey = (y: number, m: number) => y * 100 + m;
const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v)));
const short = (y: number, m: number) => `${MONTH_ABBR_TH[m - 1]} ${String(y).slice(-2)}`;

function monthlySeries(data: Dataset, test: TestType) {
  const sums = new Map<number, number>();
  for (const r of data.usage) if (r.test === test) sums.set(mkey(r.year, r.month), (sums.get(mkey(r.year, r.month)) ?? 0) + r.count);
  return Array.from(sums, ([k, value]) => ({ year: Math.floor(k / 100), month: k % 100, value }))
    .sort((a, b) => mkey(a.year, a.month) - mkey(b.year, b.month));
}

export function TrendSection({ data }: { data: Dataset }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        {TESTS.map((t, i) => <ForecastCard key={t} data={data} test={t} i={i} />)}
      </div>
      <WardTrends data={data} test="Blood gas" />
    </div>
  );
}

function ForecastCard({ data, test, i }: { data: Dataset; test: TestType; i: number }) {
  const colors = useChartColors();
  // Trailing half-entered months are left out of the line and the model —
  // a 5-of-67-wards month would otherwise read as a collapse.
  const { history, pending } = useMemo(() => {
    const all = monthlySeries(data, test);
    const comp = monthCompleteness(data.usage, data.wards, test);
    const pending: { year: number; month: number; filled: number; expected: number }[] = [];
    while (all.length) {
      const c = comp.get(all[all.length - 1].year * 100 + all[all.length - 1].month);
      if (!c || c.complete) break;
      const p = all.pop()!;
      pending.unshift({ year: p.year, month: p.month, filled: c.filled, expected: c.expected });
    }
    return { history: all, pending };
  }, [data, test]);
  const fc = useMemo(() => forecastMonthly(history, 12), [history]);
  if (history.length === 0) return null;

  const last = history[history.length - 1];
  const chart = [
    ...history.map((p) => ({ label: short(p.year, p.month), full: `${MONTH_NAMES_TH[p.month - 1]} ${p.year}`, actual: p.value,
      fy: fiscalYearOf(p.year, p.month) })),
    ...(fc?.points ?? []).map((p) => ({ label: short(p.year, p.month), full: `${MONTH_NAMES_TH[p.month - 1]} ${p.year} (คาดการณ์)`,
      forecast: p.value, band: [p.low, p.high] as [number, number], fy: fiscalYearOf(p.year, p.month) })),
  ];
  // Join the forecast line to the last actual point so there's no gap.
  const joinIdx = history.length - 1;
  (chart[joinIdx] as Record<string, unknown>).forecast = last.value;
  (chart[joinIdx] as Record<string, unknown>).band = [last.value, last.value];

  // Fiscal-year totals: the last complete-or-partial actual FY vs the FY the
  // forecast lands in (its actual months + forecast months).
  const fcFy = fc ? fiscalYearOf(fc.points[0].year, fc.points[0].month) : null;
  const fyTotal = (fy: number) => history.filter((p) => fiscalYearOf(p.year, p.month) === fy).reduce((s, p) => s + p.value, 0);
  const fcFyTotal = fc && fcFy
    ? fyTotal(fcFy) + fc.points.filter((p) => fiscalYearOf(p.year, p.month) === fcFy).reduce((s, p) => s + p.value, 0)
    : null;
  const prevFyTotal = fcFy ? fyTotal(fcFy - 1) : null;
  const change = fcFyTotal && prevFyTotal ? ((fcFyTotal - prevFyTotal) / prevFyTotal) * 100 : null;
  const fyStarts = chart.map((d, idx) => (d.label.startsWith("ต.ค.") && idx > 0 ? d.label : null)).filter(Boolean) as string[];

  return (
    <BentoCard i={i}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="icon-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-field bg-primary/15 text-primary">
            <LineIcon size={15} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-base-content">แนวโน้มการใช้งานรายเดือน · {TEST_META[test].label}</h2>
            <p className="mt-0.5 text-xs text-base-content/50">
              {short(history[0].year, history[0].month)} – {short(last.year, last.month)} ({history.length} เดือน) · เส้นประ = พยากรณ์ 12 เดือน · แถบ = ช่วงที่น่าจะเป็น (~80%)
            </p>
            {pending.length > 0 && (
              <p className="mt-0.5 text-xs text-info">
                ยังไม่รวม {pending.map((p) => `${short(p.year, p.month)} (กรอกแล้ว ${p.filled}/${p.expected} หอ)`).join(", ")} — จะเข้ากราฟและพยากรณ์เมื่อกรอกครบ
              </p>
            )}
          </div>
        </div>
        {fcFyTotal != null && fcFy && (
          <div className="rounded-field border border-base-content/8 bg-base-content/3 px-3 py-2 text-right">
            <div className="text-[11px] text-base-content/50">คาดการณ์ทั้งปีงบ {fcFy}</div>
            <div className="stat-figure-num text-lg font-semibold text-base-content">{fcFyTotal.toLocaleString()}</div>
            {change != null && (
              <div className={`inline-flex items-center gap-1 text-[11px] font-medium ${change >= 0 ? "text-success" : "text-error"}`}>
                {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {change >= 0 ? "+" : ""}{change.toFixed(1)}% <span className="font-normal text-base-content/45">จากปีงบ {fcFy - 1}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="h-64 xl:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={colors.grid} vertical={false} />
            {/* Let Recharts drop labels that would collide (phones) instead of a fixed step. */}
            <XAxis dataKey="label" tick={{ fill: colors.axisTick, fontSize: 10 }} axisLine={false} tickLine={false}
              interval="preserveStartEnd" minTickGap={18} />
            <YAxis tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} width={46} tickFormatter={fmtK}
              domain={[(min: number) => Math.max(0, Math.floor(min * 0.85)), "auto"]} />
            {fyStarts.map((l) => <ReferenceLine key={l} x={l} stroke={colors.grid} strokeDasharray="2 3" />)}
            <Tooltip
              contentStyle={colors.tooltip}
              labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
              formatter={(v, name) => {
                if (name === "band") {
                  const [lo, hi] = v as unknown as [number, number];
                  return [`${lo.toLocaleString()} – ${hi.toLocaleString()}`, "ช่วงที่น่าจะเป็น"];
                }
                return [Number(v).toLocaleString(), name === "actual" ? "ใช้จริง" : "พยากรณ์"];
              }}
            />
            <Area dataKey="band" stroke="none" fill="var(--color-accent)" fillOpacity={0.15} isAnimationActive={false} />
            <Line dataKey="actual" stroke="var(--color-primary)" strokeWidth={2} dot={false} connectNulls={false} />
            <Line dataKey="forecast" stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="6 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {fc && (
        <div className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-base-content/50">
          <Info size={12} className="mt-0.5 shrink-0" />
          {fc.method === "seasonal" ? (
            <span>
              วิธีพยากรณ์: ระดับการใช้งานเฉลี่ย 12 เดือนล่าสุด × รูปแบบตามฤดูกาลของแต่ละเดือน (จากข้อมูลย้อนหลัง {Math.floor(history.length / 12)} ปี)
              {fc.backtestMape != null && <> · ทดสอบย้อนหลังกับ 12 เดือนล่าสุด คลาดเคลื่อนเฉลี่ย ±{fc.backtestMape.toFixed(1)}% ต่อเดือน</>}
            </span>
          ) : (
            <span>
              มีข้อมูลเพียง {history.length} เดือน ยังแยกผลตามฤดูกาลออกจากการเติบโตไม่ได้ — ใช้ระดับเฉลี่ย 6 เดือนล่าสุดเป็นค่าพยากรณ์ (ใช้เป็นแนวทางคร่าวๆ) ·
              จะเปลี่ยนเป็นแบบตามฤดูกาลอัตโนมัติเมื่อมีข้อมูลครบ 24 เดือน
            </span>
          )}
        </div>
      )}
    </BentoCard>
  );
}

type SortMode = "total" | "trend";

/** Small multiples: one mini monthly chart per ward. A single 12-line chart
 * becomes unreadable spaghetti; separate panels let each ward's own shape
 * show, and a shared y-scale (toggle) keeps sizes comparable when needed. */
function WardTrends({ data, test }: { data: Dataset; test: TestType }) {
  const colors = useChartColors();
  const [shared, setShared] = useState(false);
  const [sort, setSort] = useState<SortMode>("total");
  const [range, setRange] = useState<12 | 24 | "all">(12);

  const latest = latestMonth(data.usage, test);
  const months = useMemo(() => {
    const all = Array.from(new Set(data.usage.filter((r) => r.test === test).map((r) => mkey(r.year, r.month)))).sort((a, b) => a - b);
    return range === "all" ? all : all.slice(-range);
  }, [data.usage, test, range]);
  const availableMonths = useMemo(() => new Set(data.usage.filter((r) => r.test === test).map((r) => mkey(r.year, r.month))).size, [data.usage, test]);

  const anomalies = useMemo(() => {
    const fys = new Set(months.map((k) => fiscalYearOf(Math.floor(k / 100), k % 100)));
    return new Set(Array.from(fys).flatMap((fy) => detectAnomalies(data.usage, test, fy)).map((a) => `${a.ward}|${mkey(a.year, a.month)}`));
  }, [data.usage, test, months]);

  const wards = useMemo(() => {
    const order = data.wards.filter((w) => w.test === test && w.active).map((w) => w.ward);
    const byWard = new Map<string, Map<number, number>>();
    for (const r of data.usage) {
      if (r.test !== test) continue;
      const m = byWard.get(r.ward) ?? new Map<number, number>();
      m.set(mkey(r.year, r.month), (m.get(mkey(r.year, r.month)) ?? 0) + r.count);
      byWard.set(r.ward, m);
    }
    const names = [...order, ...Array.from(byWard.keys()).filter((w) => !order.includes(w))];
    const rows = names.map((ward) => {
      const m = byWard.get(ward) ?? new Map();
      const values = months.map((k) => m.get(k) ?? null);
      const known = values.filter((v): v is number => v != null);
      return {
        ward,
        values,
        total: known.reduce((s, v) => s + v, 0),
        avg: known.length ? known.reduce((s, v) => s + v, 0) / known.length : 0,
        lastVal: values[values.length - 1],
        trend: trendPctPerMonth(values),
      };
    }).filter((r) => r.total > 0);
    return rows.sort((a, b) => (sort === "total" ? b.total - a.total : (b.trend ?? -Infinity) - (a.trend ?? -Infinity)));
  }, [data.usage, data.wards, test, months, sort]);

  const globalMax = Math.max(1, ...wards.flatMap((w) => w.values.map((v) => v ?? 0)));
  if (wards.length === 0) return null;
  const from = months[0], to = months[months.length - 1];

  return (
    <BentoCard i={3}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="icon-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-field bg-secondary/15 text-secondary">
            <Building2 size={15} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-base-content">แนวโน้มการใช้งานรายเดือนแยกตามหอผู้ป่วย · {TEST_META[test].label}</h2>
            <p className="mt-0.5 text-xs text-base-content/50">
              {short(Math.floor(from / 100), from % 100)} – {short(Math.floor(to / 100), to % 100)} · เส้นประ = ค่าเฉลี่ยของหอ ·
              แนวโน้ม = เปลี่ยนแปลงเฉลี่ยต่อเดือน · <span className="text-warning">จุดเหลือง</span> = ต่ำผิดปกติ
              {latest && ` · ข้อมูลถึง ${MONTH_NAMES_TH[latest.month - 1]} ${latest.year}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {availableMonths > 12 && (
            <div className="join">
              {([12, 24, "all"] as const).filter((r) => r === "all" || r <= availableMonths).map((r) => (
                <button key={r} onClick={() => setRange(r)}
                  className={`btn join-item btn-xs ${range === r ? "btn-secondary" : "border-base-content/10 bg-base-200/60 text-base-content/70"}`}>
                  {r === "all" ? "ทั้งหมด" : `${r} เดือน`}
                </button>
              ))}
            </div>
          )}
          <div className="join">
            {([["total", "ใช้มากสุด"], ["trend", "แนวโน้มเพิ่ม"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)}
                className={`btn join-item btn-xs ${sort === k ? "btn-secondary" : "border-base-content/10 bg-base-200/60 text-base-content/70"}`}>{l}</button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-base-content/65" title="ใช้สเกลแกนตั้งเดียวกันทุกหอ เพื่อเทียบขนาด">
            <input type="checkbox" className="toggle toggle-xs toggle-secondary" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            สเกลเดียวกัน
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {wards.map((w) => {
          const series = w.values.map((v, idx) => {
            const k = months[idx];
            const y = Math.floor(k / 100), m = k % 100;
            return { label: short(y, m), full: `${MONTH_NAMES_TH[m - 1]} ${y}`, value: v, flagged: anomalies.has(`${w.ward}|${k}`) };
          });
          const t = w.trend;
          return (
            <div key={w.ward} className="rounded-field border border-base-content/6 bg-base-content/3 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-xs font-medium text-base-content/85" title={w.ward}>{w.ward}</span>
                {t != null && (
                  <span className={`inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold ${
                    Math.abs(t) < 1 ? "text-base-content/45" : t > 0 ? "text-success" : "text-error"}`}
                    title="ความชันเฉลี่ยต่อเดือน เทียบกับค่าเฉลี่ยของหอ">
                    {Math.abs(t) < 1 ? "คงที่" : <>{t > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{t > 0 ? "+" : ""}{t.toFixed(1)}%/ด.</>}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="stat-figure-num text-lg font-semibold text-base-content">{w.lastVal?.toLocaleString() ?? "—"}</span>
                <span className="text-[11px] text-base-content/45">เดือนล่าสุด · เฉลี่ย {Math.round(w.avg).toLocaleString()} · รวม {w.total.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <XAxis dataKey="label" hide />
                    <YAxis hide domain={shared ? [0, globalMax] : ["auto", "auto"]} />
                    <ReferenceLine y={w.avg} stroke={colors.muted} strokeDasharray="3 3" />
                    <Tooltip contentStyle={colors.tooltip}
                      labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
                      formatter={(v) => [v == null ? "ไม่มีข้อมูล" : Number(v).toLocaleString(), w.ward]} />
                    <Line dataKey="value" stroke="var(--color-secondary)" strokeWidth={2} connectNulls={false} isAnimationActive={false}
                      dot={(props: unknown) => {
                        const p = props as { cx?: number; cy?: number; index: number; payload: { flagged: boolean; value: number | null } };
                        if (p.cx == null || p.cy == null || p.payload.value == null) return <g key={p.index} />;
                        return p.payload.flagged
                          ? <circle key={p.index} cx={p.cx} cy={p.cy} r={3.5} fill="var(--color-warning)" />
                          : <circle key={p.index} cx={p.cx} cy={p.cy} r={1.8} fill="var(--color-secondary)" />;
                      }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </BentoCard>
  );
}
