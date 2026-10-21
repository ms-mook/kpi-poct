"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Info, Loader2, Save, Undo2, XCircle } from "lucide-react";
import { StatusBanner } from "../StatusBanner";
import { PeriodPicker, nextMonthToFill } from "./PeriodPicker";
import { MONTH_NAMES_TH } from "@/lib/constants";
import type { Dataset, KpiConfig, KpiRow } from "@/lib/data";
import { autoDenominatorTest, kpiResult, kpiStatus, monthCompleteness, monthTotal } from "@/lib/aggregate";
import { AuthError, saveKpi, type SaveResult } from "@/lib/backend";

type FieldDef = { suffix: string; label: string; hint?: string; percent?: boolean };

/** Input fields per indicator kind — must match KIND_FIELDS in Code.gs. */
function fieldsFor(cfg: KpiConfig): FieldDef[] {
  switch (cfg.kind) {
    case "direct_percent":
      return [{ suffix: "pct", label: cfg.field1Label || "ร้อยละ", percent: true }];
    case "ratio_pair":
      return [
        { suffix: "num", label: cfg.field1Label || "ตัวตั้ง" },
        { suffix: "den", label: cfg.field2Label || "ตัวหาร" },
      ];
    case "ratio_auto":
      return [{ suffix: "num", label: cfg.field1Label || "ตัวตั้ง" }];
    case "count":
      return [
        { suffix: "count", label: cfg.field1Label || "จำนวน (คน)" },
        { suffix: "den", label: "จำนวนผู้ใช้งานทั้งหมดที่ต้องสอบ (ถ้ามี)", hint: "ใส่แล้วจะคิดเป็นร้อยละและประเมินผ่าน/ไม่ผ่านได้" },
      ];
  }
}

const fkey = (id: string, suffix: string) => `${id}_${suffix}`;

function parseNum(raw: string): number | null {
  const s = raw.replace(/[,%\s]/g, "");
  if (s === "") return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

export function KpiEntryForm({ data, onSaved, onAuthLost }: {
  data: Dataset; onSaved: () => Promise<void>; onAuthLost: () => void;
}) {
  const latest = useMemo(() => {
    let best: { year: number; month: number } | null = null;
    for (const r of data.kpi) if (!best || r.year * 100 + r.month > best.year * 100 + best.month) best = { year: r.year, month: r.month };
    return best;
  }, [data.kpi]);
  const [period, setPeriod] = useState(() => nextMonthToFill(latest));
  const [saved, setSaved] = useState<{ label: string; r: SaveResult } | null>(null);
  const minYear = useMemo(() => Math.min(...data.kpi.map((r) => r.year), ...data.usage.map((r) => r.year)), [data.kpi, data.usage]);
  const filled = useMemo(() => new Set(data.kpi.map((r) => r.year * 100 + r.month)), [data.kpi]);

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-box p-3">
        <PeriodPicker year={period.year} month={period.month} minYear={minYear} onChange={(p) => { setPeriod(p); setSaved(null); }}
          hasData={(y, m) => filled.has(y * 100 + m)} />
      </div>
      {saved && (
        <StatusBanner type="success" title={`บันทึกตัวชี้วัด ${saved.label} แล้ว`}
          message={`เพิ่ม ${saved.r.added} · แก้ไข ${saved.r.updated} · ลบ ${saved.r.removed} รายการ`} />
      )}
      <KpiGrid key={`${period.year}-${period.month}-${data.loadedAt.getTime()}`}
        data={data} year={period.year} month={period.month} onSaved={onSaved} onAuthLost={onAuthLost}
        onResult={(r) => setSaved(r ? { label: `${MONTH_NAMES_TH[period.month - 1]} ${period.year}`, r } : null)} />
    </div>
  );
}

function KpiGrid({ data, year, month, onSaved, onAuthLost, onResult }: {
  data: Dataset; year: number; month: number; onSaved: () => Promise<void>; onAuthLost: () => void;
  onResult: (r: SaveResult | null) => void;
}) {
  const configs = useMemo(() => data.kpiConfig.filter((c) => c.active), [data.kpiConfig]);
  const allFields = useMemo(() => configs.flatMap((c) => fieldsFor(c).map((f) => ({ cfg: c, f, k: fkey(c.id, f.suffix) }))), [configs]);

  const initial = useMemo(() => {
    const out: Record<string, string> = {};
    for (const { cfg, k } of allFields) {
      const row = data.kpi.find((r) => r.year === year && r.month === month && r.indicator === cfg.id && r.field === k);
      out[k] = row ? String(row.value) : "";
    }
    return out;
  }, [allFields, data.kpi, year, month]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = allFields.some(({ k }) => (values[k] ?? "") !== (initial[k] ?? ""));
  const invalid = allFields.filter(({ f, k }) => {
    const v = parseNum(values[k] ?? "");
    return Number.isNaN(v) || (f.percent && v != null && v > 100);
  });

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Live preview: rows as they'd be after saving → the same kpiResult the
  // dashboard uses, so what you see here is what the dashboard will show.
  const previewRows: KpiRow[] = useMemo(() => allFields.flatMap(({ cfg, k }) => {
    const v = parseNum(values[k] ?? "");
    return v == null || Number.isNaN(v) ? [] : [{ year, month, indicator: cfg.id, field: k, value: v }];
  }), [allFields, values, year, month]);

  const groups = useMemo(() => {
    const map = new Map<string, KpiConfig[]>();
    for (const c of configs) map.set(c.group, [...(map.get(c.group) ?? []), c]);
    return Array.from(map.values());
  }, [configs]);

  async function save() {
    if (invalid.length) return;
    const clearing = allFields.filter(({ k }) => !(values[k] ?? "").trim() && initial[k]);
    if (clearing.length && !window.confirm(`จะลบค่าเดิม ${clearing.length} ช่องที่เว้นว่างไว้ (= ไม่ได้ประเมินเดือนนี้) — ยืนยัน?`)) return;
    setSaving(true); setError(null); onResult(null);
    try {
      const entries = allFields
        .filter(({ k }) => (values[k] ?? "") !== (initial[k] ?? ""))
        .map(({ cfg, k }) => ({ indicator: cfg.id, field: k, value: parseNum(values[k] ?? "") }));
      const r = await saveKpi({ year, month, entries });
      await onSaved();
      onResult(r);
    } catch (err) {
      if (err instanceof AuthError) onAuthLost();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const label = `${MONTH_NAMES_TH[month - 1]} ${year}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-base-content">ตัวชี้วัดคุณภาพ · {label}</h2>
          <p className="mt-0.5 text-xs text-base-content/50">กรอกเฉพาะตัวที่ประเมินในเดือนนี้ · ช่องว่าง = ไม่ได้ประเมิน (ND) · ไม่ต้องใส่ % หรือ “คน”</p>
        </div>
      </div>
      {error && <StatusBanner type="error" title="บันทึกไม่สำเร็จ" message={error} />}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {groups.map((items) => (
          <div key={items[0].group} className="glass-panel rounded-box p-4">
            <h3 className="text-sm font-semibold leading-snug text-base-content">{items[0].name.split(" — ")[0]}</h3>
            <p className="mb-3 mt-0.5 text-xs text-base-content/50">เกณฑ์: {items[0].criteria}</p>
            <div className="space-y-3">
              {items.map((cfg) => {
                const r = kpiResult(cfg, previewRows, data.usage, year, month, data.wards);
                const st = kpiStatus(cfg, r);
                const autoTest = cfg.kind === "ratio_auto" ? autoDenominatorTest(cfg) : null;
                const autoDen = autoTest ? monthTotal(data.usage, autoTest, year, month) : null;
                const autoDone = autoTest ? monthCompleteness(data.usage, data.wards, autoTest).get(year * 100 + month) : undefined;
                return (
                  <div key={cfg.id} className="rounded-field border border-base-content/6 bg-base-content/3 p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-base-content/75">{cfg.name.split(" — ")[1] ?? cfg.shortName}</span>
                      {r && (
                        <span className={`badge badge-sm shrink-0 gap-1 border-0 ${
                          st === "pass" ? "bg-success/15 text-success" : st === "fail" ? "bg-error/15 text-error" : "bg-base-content/8 text-base-content/60"}`}>
                          {st === "pass" ? <CheckCircle2 size={12} /> : st === "fail" ? <XCircle size={12} /> : null}
                          {cfg.kind === "count" && r.denominator == null ? `${r.value.toLocaleString()} คน` : `${r.value.toFixed(cfg.decimals)}%`}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {fieldsFor(cfg).map((f) => {
                        const k = fkey(cfg.id, f.suffix);
                        const raw = values[k] ?? "";
                        const v = parseNum(raw);
                        const bad = Number.isNaN(v) || (f.percent && v != null && v > 100);
                        const changed = raw !== (initial[k] ?? "");
                        return (
                          <label key={k} className={fieldsFor(cfg).length === 1 ? "sm:col-span-2" : ""}>
                            <span className="mb-1 block text-[11px] leading-snug text-base-content/55">{f.label}{f.percent && " (%)"}</span>
                            <input
                              inputMode="decimal"
                              value={raw}
                              onChange={(e) => { setValues((p) => ({ ...p, [k]: e.target.value })); onResult(null); }}
                              className={`input input-sm input-bordered w-full bg-base-100/60 text-right font-mono ${bad ? "input-error" : changed ? "input-primary" : ""}`}
                              placeholder="ND"
                            />
                            {f.hint && <span className="mt-1 block text-[10px] text-base-content/40">{f.hint}</span>}
                          </label>
                        );
                      })}
                      {autoTest && (
                        <div className="flex items-start gap-1.5 text-[11px] text-base-content/55">
                          <Info size={12} className="mt-0.5 shrink-0" />
                          {autoDen && autoDone && !autoDone.complete
                            ? <span className="text-warning">จำนวนการใช้งาน {autoTest} เดือนนี้กรอกแล้ว {autoDone.filled}/{autoDone.expected} หอ — ร้อยละจะคำนวณเมื่อกรอกครบ (บันทึกตัวตั้งไว้ก่อนได้)</span>
                            : autoDen
                            ? <>ตัวหาร = จำนวนการตรวจ {autoTest} เดือนนี้ <span className="stat-figure-num font-semibold text-base-content/80">{autoDen.toLocaleString()}</span> (ดึงจากแท็บจำนวนการใช้งาน)</>
                            : <span className="text-warning">ยังไม่มีจำนวนการใช้งาน {autoTest} เดือนนี้ — บันทึกได้ แต่ร้อยละจะคำนวณได้หลังกรอกจำนวนการใช้งาน</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-box border border-base-content/8 bg-base-200/90 p-3 backdrop-blur">
        <div className="text-xs text-base-content/60">
          {invalid.length > 0 ? <span className="text-error">มีช่องที่ไม่ถูกต้อง {invalid.length} ช่อง (ตัวเลขเท่านั้น, ร้อยละไม่เกิน 100)</span>
            : dirty ? "มีการแก้ไขที่ยังไม่บันทึก"
            : <span className="inline-flex items-center gap-1"><CheckCircle2 size={13} className="text-success" />ตรงกับข้อมูลในชีต</span>}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm gap-1" disabled={!dirty || saving} onClick={() => { setValues(initial); onResult(null); }}>
            <Undo2 size={14} /> คืนค่าเดิม
          </button>
          <button className="btn btn-primary btn-sm gap-1.5" disabled={!dirty || saving || invalid.length > 0} onClick={save}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}
