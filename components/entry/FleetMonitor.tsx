"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Cpu, Home, PauseCircle, X } from "lucide-react";
import { MONTH_ABBR_TH, MONTH_NAMES_TH, TESTS, TEST_META, type TestType } from "@/lib/constants";
import type { Dataset } from "@/lib/data";
import { buildFleet, HEALTH_LABEL, monthLabelOf, type DeviceSummary, type Health } from "@/lib/fleet";
import { keyYM, shiftKey } from "@/lib/range";
import { useChartColors } from "@/lib/chart-colors";

const PALETTE = ["var(--color-primary)", "var(--color-secondary)", "var(--color-accent)", "var(--color-info)", "var(--color-warning)", "var(--color-success)"];
const BADGE: Record<Health, string> = {
  ok: "bg-success/15 text-success", low: "bg-warning/20 text-warning", none: "bg-error/15 text-error",
  idle: "bg-base-content/10 text-base-content/70", moved: "bg-info/15 text-info", unknown: "bg-base-content/8 text-base-content/55",
};
const NEEDS_CHECK: Health[] = ["low", "none", "moved"];
const ym = (k: number) => `${MONTH_ABBR_TH[keyYM(k).month - 1]} ${String(keyYM(k).year).slice(-2)}`;
const fmt = (v: number | null) => (v == null ? "–" : Math.round(v).toLocaleString());

/** Back-office view of every meter: where it is, where it has been, and whether it looks healthy. */
export function FleetMonitor({ data }: { data: Dataset }) {
  const [test, setTest] = useState<TestType>("Glucose");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "check" | "idle">("all");
  const [sel, setSel] = useState<string | null>(null);
  const { devices, asOf } = useMemo(() => buildFleet(data, test, null), [data, test]);

  const shown = devices.filter((d) => {
    if (filter === "check" && !NEEDS_CHECK.includes(d.health)) return false;
    if (filter === "idle" && d.health !== "idle") return false;
    const t = q.trim().toLowerCase();
    return !t || d.sn.toLowerCase().includes(t) || d.stays.some((s) => s.ward.toLowerCase().includes(t));
  });
  const nCheck = devices.filter((d) => NEEDS_CHECK.includes(d.health)).length;
  const nIdle = devices.filter((d) => d.health === "idle").length;
  const nInWard = devices.filter((d) => d.current).length;
  const selected = devices.find((d) => d.sn === sel) ?? null;

  const tile = "glass-panel rounded-box p-4";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="join">
          {TESTS.map((t) => (
            <button key={t} onClick={() => { setTest(t); setSel(null); }} className={`btn join-item btn-sm ${test === t ? "btn-primary" : "border-base-content/10 bg-base-200/60 text-base-content/70"}`}>{TEST_META[t].label}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา SN หรือชื่อหอ" aria-label="ค้นหา SN หรือชื่อหอ" className="input input-sm input-bordered w-64 bg-base-200/60" />
        <span className="text-xs text-base-content/55">{asOf ? `ประเมินจากข้อมูลถึง ${MONTH_NAMES_TH[keyYM(asOf).month - 1]} ${keyYM(asOf).year}` : "ยังไม่มีเดือนที่ข้อมูลครบ"}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className={tile}><div className="flex items-center gap-2 text-xs text-base-content/60"><Cpu size={14} /> เครื่องทั้งหมด</div><div className="stat-figure-num mt-2 text-2xl font-semibold">{devices.length}</div></div>
        <div className={tile}><div className="flex items-center gap-2 text-xs text-base-content/60"><Home size={14} /> อยู่ในหอ (ปัจจุบัน)</div><div className="stat-figure-num mt-2 text-2xl font-semibold">{nInWard}</div></div>
        <button onClick={() => setFilter(filter === "idle" ? "all" : "idle")} className={`${tile} text-left ${filter === "idle" ? "ring-2 ring-primary/50" : ""}`}>
          <div className="flex items-center gap-2 text-xs text-base-content/60"><PauseCircle size={14} /> ไม่ได้อยู่หอใด (สำรอง/ซ่อม)</div><div className="stat-figure-num mt-2 text-2xl font-semibold">{nIdle}</div>
        </button>
        <button onClick={() => setFilter(filter === "check" ? "all" : "check")} className={`${tile} text-left ${filter === "check" ? "ring-2 ring-primary/50" : ""}`}>
          <div className="flex items-center gap-2 text-xs text-base-content/60"><AlertTriangle size={14} className="text-warning" /> ควรตรวจสอบ</div><div className={`stat-figure-num mt-2 text-2xl font-semibold ${nCheck ? "text-warning" : ""}`}>{nCheck}</div>
        </button>
      </div>

      <section className="glass-panel rounded-box p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-base-content">สถานะเครื่อง {TEST_META[test].label} <span className="font-normal text-base-content/55">· {shown.length} เครื่อง{filter !== "all" ? " (กรองอยู่)" : ""}</span></h2>
          {filter !== "all" && <button className="btn btn-ghost btn-xs" onClick={() => setFilter("all")}>แสดงทั้งหมด</button>}
        </div>
        {devices.length === 0 ? (
          <p className="py-8 text-center text-sm text-base-content/55">ยังไม่มีข้อมูลเครื่องของ {test} — เพิ่มได้ที่ ตั้งค่า → เครื่อง / SN</p>
        ) : (
          <div tabIndex={0} role="region" aria-label="สถานะเครื่อง" className="max-h-[32rem] overflow-auto rounded-field border border-base-content/8 focus-visible:outline-2 focus-visible:outline-primary">
            <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="text-left text-base-content/70">
                  {["SN", "หอปัจจุบัน", "ตั้งแต่", "ยอดเดือนล่าสุด", "เฉลี่ย 6 เดือนก่อน", "เคยอยู่ (หอ)", "สถานะ"].map((h, i) => (
                    <th key={h} className={`sticky top-0 z-10 bg-base-200 px-3 py-2 font-medium ${i >= 3 && i <= 5 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => (
                  <tr key={d.sn} onClick={() => setSel(d.sn === sel ? null : d.sn)} className={`cursor-pointer hover:bg-base-content/5 ${d.sn === sel ? "bg-primary/10" : ""}`}>
                    <td className="border-t border-base-content/6 px-3 py-2 font-mono">
                      <button className="text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-primary" onClick={(e) => { e.stopPropagation(); setSel(d.sn === sel ? null : d.sn); }} aria-expanded={d.sn === sel}>{d.sn}</button>
                    </td>
                    <td className="border-t border-base-content/6 px-3 py-2">{d.current?.ward ?? <span className="text-base-content/40">—</span>}</td>
                    <td className="border-t border-base-content/6 px-3 py-2 whitespace-nowrap text-base-content/70">{d.current ? ym(d.current.fromKey) : "—"}</td>
                    <td className="stat-figure-num border-t border-base-content/6 px-3 py-2 text-right">{fmt(d.usageLast)}</td>
                    <td className="stat-figure-num border-t border-base-content/6 px-3 py-2 text-right text-base-content/70">{fmt(d.avgPrev)}</td>
                    <td className="stat-figure-num border-t border-base-content/6 px-3 py-2 text-right text-base-content/70">{d.wardsVisited}</td>
                    <td className="border-t border-base-content/6 px-3 py-2">
                      <span className={`badge badge-sm h-auto gap-1 border-0 py-0.5 ${BADGE[d.health]}`}>{d.health === "ok" && <CheckCircle2 size={11} />}{HEALTH_LABEL[d.health]}</span>
                      {d.note && <span className="ml-2 text-base-content/55">{d.note}</span>}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-base-content/55">ไม่พบเครื่องที่ตรงเงื่อนไข</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && <DeviceDetail d={selected} asOf={asOf} onClose={() => setSel(null)} />}
    </div>
  );
}

function DeviceDetail({ d, asOf, onClose }: { d: DeviceSummary; asOf: number | null; onClose: () => void }) {
  const colors = useChartColors();
  const wards = Array.from(new Set(d.stays.map((s) => s.ward)));
  const colorOf = (w: string) => PALETTE[wards.indexOf(w) % PALETTE.length];
  const first = d.stays[0].fromKey;
  const from = asOf ? Math.max(first, shiftKey(asOf, -35)) : first;
  const rows = useMemo(() => {
    const map = new Map<number, { ward: string; count: number | null }>();
    d.stays.forEach((s) => s.series.forEach((p) => { if (p.key >= from) map.set(p.key, { ward: s.ward, count: p.count }); }));
    return Array.from(map, ([key, v]) => ({ key, label: monthLabelOf(key, MONTH_ABBR_TH), ...v })).sort((a, b) => a.key - b.key);
  }, [d, from]);

  return (
    <section className="glass-panel space-y-4 rounded-box p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-sm font-semibold text-base-content">{d.sn}</h2>
          <p className="mt-0.5 text-xs text-base-content/60">
            {d.test} · เคยอยู่ {d.wardsVisited} หอ · {d.stays.length} ช่วง · ยอดรวมที่นับได้ {d.total.toLocaleString()} ครั้ง
            {d.movesLast12 > 0 && ` · ย้ายเข้าหอใหม่ ${d.movesLast12} ครั้งใน 12 เดือน`}
          </p>
        </div>
        <button className="btn btn-ghost btn-xs gap-1" onClick={onClose}><X size={14} /> ปิด</button>
      </div>

      <ol className="space-y-2">
        {[...d.stays].reverse().map((s, i) => (
          <li key={`${s.ward}-${s.fromKey}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-field border border-base-content/8 bg-base-content/3 px-3 py-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(s.ward) }} aria-hidden="true" />
            <span className="min-w-40 font-medium text-base-content/90">{s.ward}</span>
            <span className="text-base-content/70">{ym(s.fromKey)} – {s.toKey != null ? ym(s.toKey) : "ปัจจุบัน"}</span>
            <span className="stat-figure-num text-base-content/70">รวม {s.total.toLocaleString()} ครั้ง · เฉลี่ย {fmt(s.avg)}/เดือน ({s.monthsWithData} เดือน)</span>
            {s.series.some((p) => p.shared) && <span className="text-info">มีเครื่องอื่นในหอเดียวกัน ยอดนับรวม</span>}
            {s.note && <span className="text-base-content/55">· {s.note}</span>}
          </li>
        ))}
      </ol>

      <div>
        <p className="mb-2 text-xs text-base-content/55">ยอดใช้งานรายเดือน (สีตามหอที่เครื่องอยู่ · 36 เดือนล่าสุด)</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: colors.axisTick, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: colors.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip contentStyle={colors.tooltip} cursor={{ fill: colors.cursor }}
                formatter={(v, _n, item) => [v == null ? "ไม่มีข้อมูล" : Number(v).toLocaleString(), (item?.payload as { ward?: string })?.ward ?? ""]} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={22}>
                {rows.map((r) => <Cell key={r.key} fill={colorOf(r.ward)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 flex flex-wrap gap-3 text-xs text-base-content/70">
          {wards.map((w) => <li key={w} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(w) }} aria-hidden="true" />{w}</li>)}
        </ul>
      </div>
    </section>
  );
}
