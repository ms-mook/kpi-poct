"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardPaste, Eraser, Loader2, Save, Undo2 } from "lucide-react";
import { StatusBanner } from "../StatusBanner";
import { PeriodPicker, nextMonthToFill } from "./PeriodPicker";
import { MONTH_ABBR_TH, MONTH_NAMES_TH, TESTS, TEST_META, type TestType } from "@/lib/constants";
import type { Dataset } from "@/lib/data";
import { latestMonth } from "@/lib/aggregate";
import { AuthError, saveUsage, type SaveResult } from "@/lib/backend";

const key = (y: number, m: number) => y * 100 + m;

/** "1,234" / " 56 " → number; "" → null; anything else → NaN (invalid). */
function parseCount(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, "");
  if (s === "") return null;
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

export function UsageEntryForm({ data, onSaved, onAuthLost }: {
  data: Dataset; onSaved: () => Promise<void>; onAuthLost: () => void;
}) {
  const [test, setTest] = useState<TestType>("Glucose");
  const [period, setPeriod] = useState(() => nextMonthToFill(latestMonth(data.usage, "Glucose")));
  // Kept here, not in the grid: the grid remounts after a save (fresh data),
  // which would otherwise wipe the confirmation the moment it appears.
  const [saved, setSaved] = useState<{ label: string; r: SaveResult } | null>(null);
  const minYear = useMemo(() => Math.min(...data.usage.map((r) => r.year)), [data.usage]);

  const filled = useMemo(() => {
    const set = new Set<number>();
    for (const r of data.usage) if (r.test === test) set.add(key(r.year, r.month));
    return set;
  }, [data.usage, test]);

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-box p-3">
        <div className="join">
          {TESTS.map((t) => (
            <button key={t} onClick={() => { setTest(t); setSaved(null); }} title={TEST_META[t].long}
              className={`btn join-item btn-sm ${test === t ? "btn-primary" : "border-base-content/10 bg-base-200/60 text-base-content/70"}`}>
              {TEST_META[t].label}
            </button>
          ))}
        </div>
        <PeriodPicker year={period.year} month={period.month} minYear={minYear} onChange={(p) => { setPeriod(p); setSaved(null); }}
          hasData={(y, m) => filled.has(key(y, m))} />
      </div>
      {saved && (
        <StatusBanner type="success" title={`บันทึก ${saved.label} แล้ว`}
          message={`เพิ่ม ${saved.r.added} · แก้ไข ${saved.r.updated} · ลบ ${saved.r.removed} รายการ — หน้า Dashboard เห็นข้อมูลใหม่แล้ว`} />
      )}
      {/* Remount per test/month/data version so inputs re-seed from the sheet. */}
      <UsageGrid key={`${test}-${period.year}-${period.month}-${data.loadedAt.getTime()}`}
        data={data} test={test} year={period.year} month={period.month} onSaved={onSaved} onAuthLost={onAuthLost}
        onResult={(r) => setSaved(r ? { label: `${test} ${MONTH_NAMES_TH[period.month - 1]} ${period.year}`, r } : null)} />
    </div>
  );
}

function UsageGrid({ data, test, year, month, onSaved, onAuthLost, onResult }: {
  data: Dataset; test: TestType; year: number; month: number;
  onSaved: () => Promise<void>; onAuthLost: () => void; onResult: (r: SaveResult | null) => void;
}) {
  const wards = useMemo(() => data.wards.filter((w) => w.test === test && w.active).map((w) => w.ward), [data.wards, test]);
  const prevKey = month === 1 ? key(year - 1, 12) : key(year, month - 1);

  const { existing, prevMonth, lastYear } = useMemo(() => {
    const existing = new Map<string, number>(), prevMonth = new Map<string, number>(), lastYear = new Map<string, number>();
    for (const r of data.usage) {
      if (r.test !== test) continue;
      const k = key(r.year, r.month);
      if (k === key(year, month)) existing.set(r.ward, r.count);
      else if (k === prevKey) prevMonth.set(r.ward, r.count);
      else if (k === key(year - 1, month)) lastYear.set(r.ward, r.count);
    }
    return { existing, prevMonth, lastYear };
  }, [data.usage, test, year, month, prevKey]);

  const initial = useMemo(() => Object.fromEntries(wards.map((w) => [w, existing.has(w) ? String(existing.get(w)) : ""])), [wards, existing]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const parsed = wards.map((w) => ({ ward: w, value: parseCount(values[w] ?? "") }));
  const invalid = parsed.filter((p) => Number.isNaN(p.value));
  const dirty = wards.some((w) => (values[w] ?? "") !== (initial[w] ?? ""));
  const clearing = parsed.filter((p) => p.value === null && existing.has(p.ward));
  const filledCount = parsed.filter((p) => p.value != null && !Number.isNaN(p.value)).length;
  const total = parsed.reduce((s, p) => s + (p.value != null && !Number.isNaN(p.value) ? p.value : 0), 0);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function flag(ward: string, v: number | null): string | null {
    if (v == null || Number.isNaN(v)) return null;
    const ref = prevMonth.get(ward) ?? lastYear.get(ward);
    if (ref == null || ref < 30) return null;
    if (v === 0) return "เป็น 0 — เครื่องเสีย/หอปิด? (ถ้าไม่ทราบให้เว้นว่าง)";
    if (v < ref * 0.4) return `ต่ำกว่าปกติมาก (เดิม ~${ref.toLocaleString()})`;
    if (v > ref * 2.5) return `สูงกว่าปกติมาก (เดิม ~${ref.toLocaleString()}) — พิมพ์เกิน?`;
    return null;
  }
  const flagged = parsed.filter((p) => flag(p.ward, p.value));

  // Paste a column copied from Excel/Sheets: fill this row and the ones below.
  function handlePaste(idx: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!/[\r\n\t]/.test(text)) return; // single value: let the browser paste normally
    e.preventDefault();
    const cells = text.replace(/\r/g, "").split("\n").filter((l, i, a) => !(i === a.length - 1 && l === ""))
      .map((l) => l.split("\t").pop()!.trim());
    setValues((prev) => {
      const next = { ...prev };
      cells.forEach((c, i) => { const w = wards[idx + i]; if (w) next[w] = c; });
      return next;
    });
    onResult(null);
  }

  function handleKey(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); inputs.current[idx + 1]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); inputs.current[idx - 1]?.focus(); }
  }

  async function save() {
    if (invalid.length) return;
    if (clearing.length && !window.confirm(
      `จะลบข้อมูลเดิมของ ${clearing.length} หอที่เว้นว่างไว้ (${clearing.slice(0, 3).map((c) => c.ward).join(", ")}${clearing.length > 3 ? " ..." : ""})\nช่องว่าง = ไม่มีข้อมูล (ไม่ใช่ 0) — ยืนยัน?`,
    )) return;
    setSaving(true); setError(null); onResult(null);
    try {
      const r = await saveUsage({ year, month, test, entries: parsed.map((p) => ({ ward: p.ward, count: p.value })) });
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
  const prevLabel = month === 1 ? `${MONTH_ABBR_TH[11]} ${String(year - 1).slice(-2)}` : `${MONTH_ABBR_TH[month - 2]} ${String(year).slice(-2)}`;

  return (
    <div className="glass-panel rounded-box p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-base-content">จำนวนการใช้งาน {test} · {label}</h2>
          <p className="mt-0.5 text-xs text-base-content/50">
            {existing.size > 0 ? `มีข้อมูลแล้ว ${existing.size}/${wards.length} หอ — แก้ไขแล้วกดบันทึก` : "ยังไม่มีข้อมูลเดือนนี้"} ·
            ช่องว่าง = ไม่มีข้อมูล · ใส่ 0 เฉพาะเมื่อไม่มีการใช้งานจริง
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-base-content/45">
          <ClipboardPaste size={14} /> วางทั้งคอลัมน์จาก Excel ได้ (คลิกช่องแรกแล้ว Ctrl+V)
        </div>
      </div>

      {error && <div className="mb-3"><StatusBanner type="error" title="บันทึกไม่สำเร็จ" message={error} /></div>}

      <div className="overflow-x-auto rounded-field border border-base-content/6">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-base-200/70 text-xs text-base-content/55">
            <tr>
              <th className="w-10 px-2 py-2 text-left font-medium">#</th>
              <th className="px-2 py-2 text-left font-medium">หอผู้ป่วย</th>
              <th className="px-2 py-2 text-right font-medium" title="เดือนก่อนหน้า">{prevLabel}</th>
              <th className="px-2 py-2 text-right font-medium" title="เดือนเดียวกันปีก่อน">{MONTH_ABBR_TH[month - 1]} {String(year - 1).slice(-2)}</th>
              <th className="w-36 px-2 py-2 text-right font-medium">{MONTH_ABBR_TH[month - 1]} {String(year).slice(-2)}</th>
            </tr>
          </thead>
          <tbody>
            {wards.map((w, i) => {
              const raw = values[w] ?? "";
              const v = parseCount(raw);
              const bad = Number.isNaN(v);
              const warn = flag(w, v);
              const changed = raw !== (initial[w] ?? "");
              return (
                <tr key={w} className={`border-t border-base-content/5 ${changed ? "bg-primary/5" : ""}`}>
                  <td className="px-2 py-1 text-xs text-base-content/40">{i + 1}</td>
                  <td className="px-2 py-1">
                    <div className="text-xs text-base-content/80">{w}</div>
                    {(warn || bad) && (
                      <div className={`flex items-center gap-1 text-[11px] ${bad ? "text-error" : "text-warning"}`}>
                        <AlertTriangle size={11} /> {bad ? "ใส่ได้เฉพาะตัวเลขจำนวนเต็ม" : warn}
                      </div>
                    )}
                  </td>
                  <td className="stat-figure-num px-2 py-1 text-right text-xs text-base-content/45">{prevMonth.get(w)?.toLocaleString() ?? "—"}</td>
                  <td className="stat-figure-num px-2 py-1 text-right text-xs text-base-content/45">{lastYear.get(w)?.toLocaleString() ?? "—"}</td>
                  <td className="px-2 py-1">
                    <input
                      ref={(el) => { inputs.current[i] = el; }}
                      inputMode="numeric"
                      value={raw}
                      onChange={(e) => { setValues((p) => ({ ...p, [w]: e.target.value })); onResult(null); }}
                      onPaste={(e) => handlePaste(i, e)}
                      onKeyDown={(e) => handleKey(i, e)}
                      aria-label={`จำนวน ${w}`}
                      className={`input input-sm input-bordered w-full bg-base-100/60 text-right font-mono ${
                        bad ? "input-error" : warn ? "input-warning" : ""}`}
                      placeholder="—"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-base-200/70 text-xs">
            <tr>
              <td colSpan={4} className="px-2 py-2 text-right text-base-content/55">รวม ({filledCount}/{wards.length} หอ)</td>
              <td className="stat-figure-num px-3 py-2 text-right font-semibold text-base-content">{total.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-box border border-base-content/8 bg-base-200/90 p-3 backdrop-blur">
        <div className="text-xs text-base-content/60">
          {invalid.length > 0 ? <span className="text-error">มีช่องที่ไม่ใช่ตัวเลข {invalid.length} ช่อง</span>
            : flagged.length > 0 ? <span className="text-warning">ตรวจอีกครั้ง: ค่าผิดปกติ {flagged.length} หอ (บันทึกได้)</span>
            : dirty ? <span>มีการแก้ไขที่ยังไม่บันทึก</span>
            : <span className="inline-flex items-center gap-1"><CheckCircle2 size={13} className="text-success" />ตรงกับข้อมูลในชีต</span>}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm gap-1" disabled={!dirty || saving} onClick={() => { setValues(initial); onResult(null); }}>
            <Undo2 size={14} /> คืนค่าเดิม
          </button>
          <button className="btn btn-ghost btn-sm gap-1" disabled={saving || wards.every((w) => !values[w])}
            onClick={() => { setValues(Object.fromEntries(wards.map((w) => [w, ""]))); onResult(null); }}>
            <Eraser size={14} /> ล้างทั้งหมด
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
