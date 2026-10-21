"use client";

import { useMemo, useState } from "react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, ClipboardCheck, FlaskConical, GraduationCap, ScanLine, Smile, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BentoCard } from "./BentoCard";
import { StatusBanner } from "./StatusBanner";
import { fiscalYearMonths, fiscalYearOf, MONTH_ABBR_TH, MONTH_NAMES_TH } from "@/lib/constants";
import type { Dataset, KpiConfig } from "@/lib/data";
import { availableKpiYears, kpiResult, kpiStatus, kpiYearSeries, kpiYearSummary, type KpiResult } from "@/lib/aggregate";
import { useChartColors } from "@/lib/chart-colors";

// Tailwind only ships classes it can see in source; these are built
// dynamically in StatusBadge:
// border-success/40 text-success/80 border-error/40 text-error/80 bg-success/15 text-success bg-error/15 text-error

// Identity icon per indicator group — never a status color (PASS/FAIL owns
// green/red on the badge next to it).
const GROUP_ICON: Record<string, LucideIcon> = {
  satisfaction: Smile,
  iqc: FlaskConical,
  eqa: ClipboardCheck,
  training: GraduationCap,
  patient_id: ScanLine,
};
const GROUP_TONE = ["text-primary bg-primary/15", "text-accent bg-accent/15", "text-secondary bg-secondary/15", "text-info bg-info/15"];

function fmt(cfg: KpiConfig, r: KpiResult | null) {
  if (!r) return "—";
  if (cfg.kind === "count" && r.denominator == null) return `${r.value.toLocaleString()} คน`;
  return `${r.value.toFixed(cfg.decimals)}%`;
}

function StatusBadge({ status, carried }: { status: "pass" | "fail" | null; carried?: boolean }) {
  if (!status) return null;
  // A result carried over from an earlier round is shown outlined, not
  // filled, so a "ผ่าน" from months ago doesn't read as this month's pass.
  const pass = status === "pass";
  const Icon = pass ? CheckCircle2 : XCircle;
  const tone = pass ? "success" : "error";
  return (
    <span className={`badge badge-sm shrink-0 gap-1 ${carried
      ? `border-${tone}/40 bg-transparent text-${tone}/80`
      : `border-0 bg-${tone}/15 text-${tone}`}`}>
      <Icon size={12} />{pass ? "ผ่าน" : "ไม่ผ่าน"}{carried && " (รอบก่อน)"}
    </span>
  );
}

/** Indicators measured only a few times a year: a sparkline of 1-4 dots
 * reads as a broken chart, so list each assessment round instead. */
function RoundChips({ cfg, series }: {
  cfg: KpiConfig;
  series: { year: number; month: number; result: KpiResult | null }[];
}) {
  const rounds = series.filter((s) => s.result);
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {rounds.map((s) => {
        const st = kpiStatus(cfg, s.result);
        return (
          <span key={`${s.year}-${s.month}`}
            className={`inline-flex items-baseline gap-1.5 rounded-field border px-2 py-1 text-[11px] ${
              st === "fail" ? "border-error/30 bg-error/8" : "border-base-content/8 bg-base-200/60"}`}>
            <span className="text-base-content/50">{MONTH_ABBR_TH[s.month - 1]} {String(s.year).slice(-2)}</span>
            <span className={`stat-figure-num font-semibold ${st === "fail" ? "text-error" : "text-base-content/85"}`}>{fmt(cfg, s.result)}</span>
          </span>
        );
      })}
    </div>
  );
}

export function KpiSection({ data }: { data: Dataset }) {
  const colors = useChartColors();
  const configs = useMemo(() => data.kpiConfig.filter((c) => c.active), [data.kpiConfig]);
  const years = useMemo(() => availableKpiYears(data.kpi), [data.kpi]);

  // Default view: the latest month that has any indicator row.
  const latest = useMemo(() => {
    let best: { year: number; month: number } | null = null;
    for (const r of data.kpi) {
      if (!best || r.year * 100 + r.month > best.year * 100 + best.month) best = { year: r.year, month: r.month };
    }
    return best;
  }, [data.kpi]);

  const [fy, setFy] = useState<number | null>(null);
  const [monthIdx, setMonthIdx] = useState<number | null>(null);
  const viewFy = fy ?? (latest ? fiscalYearOf(latest.year, latest.month) : years[years.length - 1]);
  const months = viewFy ? fiscalYearMonths(viewFy) : [];
  const defaultIdx = latest && viewFy === fiscalYearOf(latest.year, latest.month)
    ? months.findIndex((m) => m.year === latest.year && m.month === latest.month)
    : months.length - 1;
  const idx = monthIdx ?? defaultIdx;
  const view = months[idx];

  const groups = useMemo(() => {
    const map = new Map<string, KpiConfig[]>();
    for (const c of configs) map.set(c.group, [...(map.get(c.group) ?? []), c]);
    return Array.from(map.entries());
  }, [configs]);

  if (configs.length === 0 || years.length === 0 || !view || !viewFy) {
    return <StatusBanner type="info" message="ยังไม่มีข้อมูลตัวชี้วัดคุณภาพ" />;
  }

  const failed = configs.filter((c) => kpiStatus(c, kpiResult(c, data.kpi, data.usage, view.year, view.month)) === "fail");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-base-content">ตัวชี้วัดคุณภาพศูนย์การทดสอบ ณ จุดดูแลผู้ป่วย</h2>
          <p className="text-xs text-base-content/50">ผลประจำเดือน {MONTH_NAMES_TH[view.month - 1]} {view.year} · ตัวชี้วัดแบบอัตราส่วนคิด “ทั้งปี” จากผลรวมตัวตั้ง/ตัวหารของปีงบ {viewFy}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <select className="select select-sm select-bordered bg-base-200/60" value={viewFy}
            onChange={(e) => { setFy(Number(e.target.value)); setMonthIdx(null); }} aria-label="ปีงบประมาณของตัวชี้วัด">
            {years.map((y) => <option key={y} value={y}>ปีงบ {y}</option>)}
          </select>
          <select className="select select-sm select-bordered w-28 bg-base-200/60" value={idx}
            onChange={(e) => setMonthIdx(Number(e.target.value))} aria-label="เดือน">
            {months.map((m, i) => <option key={i} value={i}>{MONTH_ABBR_TH[m.month - 1]} {String(m.year).slice(-2)}</option>)}
          </select>
        </div>
      </div>

      {failed.length > 0 && (
        <StatusBanner
          type="warning"
          title={`ไม่ผ่านเกณฑ์ ${failed.length} รายการ · ${MONTH_NAMES_TH[view.month - 1]} ${view.year}`}
          message={failed.map((c) => c.shortName).join(" · ")}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {groups.map(([group, items], gi) => {
          const Icon = GROUP_ICON[group] ?? ClipboardCheck;
          const title = items[0].name.split(" — ")[0];
          return (
            <BentoCard key={group} i={gi} className="flex flex-col gap-4">
              <div className="flex items-start gap-2.5">
                <span className={`icon-badge flex h-8 w-8 shrink-0 items-center justify-center rounded-field ${GROUP_TONE[gi % GROUP_TONE.length]}`}>
                  <Icon size={16} strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-snug text-base-content">{title}</h3>
                  <p className="mt-0.5 text-xs text-base-content/50">เกณฑ์: {items[0].criteria}</p>
                </div>
              </div>

              {items.map((cfg) => {
                const yearSeries = kpiYearSeries(cfg, data.kpi, data.usage, viewFy);
                const here = kpiResult(cfg, data.kpi, data.usage, view.year, view.month);
                // Indicators assessed once a year / per round (satisfaction,
                // training, Glucose EQA) usually have no row for the viewed
                // month — show the most recent result up to that month
                // instead of an empty dash, and say which month it's from.
                const fallback = here ? null : [...yearSeries.slice(0, idx + 1)].reverse().find((s) => s.result);
                const r = here ?? fallback?.result ?? null;
                const status = kpiStatus(cfg, r);
                const summary = kpiYearSummary(cfg, data.kpi, data.usage, viewFy);
                const series = yearSeries.map((s) => ({
                  label: MONTH_ABBR_TH[s.month - 1],
                  full: `${MONTH_NAMES_TH[s.month - 1]} ${s.year}`,
                  value: s.result?.value ?? null,
                }));
                const points = series.filter((s) => s.value != null).length;
                // Monthly indicators get a trend line; ones assessed in a few
                // rounds a year get one chip per round.
                const sparse = points > 0 && points <= 4;
                const sub = cfg.name.split(" — ")[1] ?? cfg.shortName;
                const ratio = r?.numerator != null && r.denominator != null
                  ? `${r.numerator.toLocaleString()} / ${r.denominator.toLocaleString()}`
                  : cfg.kind === "count" && r ? "ยังไม่มีจำนวนผู้ต้องสอบทั้งหมด จึงยังคิดร้อยละไม่ได้" : "";
                return (
                  <div key={cfg.id} className="rounded-field border border-base-content/6 bg-base-content/3 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-base-content/65">{sub}</span>
                      <StatusBadge status={status} carried={Boolean(fallback)} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                      <span className={`stat-figure-num text-2xl font-semibold ${!r ? "text-base-content/30" : fallback ? "text-base-content/70" : "text-base-content"}`}>
                        {fmt(cfg, r)}
                      </span>
                      {summary && <span className="text-xs text-base-content/45">(ทั้งปี {fmt(cfg, summary)})</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-base-content/45">
                      {fallback
                        ? `ผลล่าสุด ${MONTH_ABBR_TH[fallback.month - 1]} ${String(fallback.year).slice(-2)} · ไม่ได้ประเมินในเดือนนี้${ratio ? ` · ${ratio}` : ""}`
                        : !r ? "ยังไม่มีผลประเมินในปีงบนี้" : ratio || " "}
                    </div>
                    {sparse && <RoundChips cfg={cfg} series={yearSeries} />}
                    {!sparse && points >= 2 && (
                      <div className="mt-2 h-16">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                            <XAxis dataKey="label" hide />
                            <YAxis hide domain={["auto", "auto"]} />
                            {(cfg.kind !== "count" || r?.denominator != null) && cfg.targetValue != null && (
                              <ReferenceLine y={cfg.targetValue} stroke={colors.muted} strokeDasharray="4 4" ifOverflow="hidden" />
                            )}
                            <Tooltip contentStyle={colors.tooltip}
                              labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""}
                              formatter={(v) => [cfg.kind === "count" && r?.denominator == null ? `${Number(v).toLocaleString()} คน` : `${Number(v).toFixed(cfg.decimals)}%`, cfg.shortName]} />
                            <Line dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                );
              })}
            </BentoCard>
          );
        })}
      </div>
    </div>
  );
}
