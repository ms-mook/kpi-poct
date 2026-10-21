"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Loader2, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { StatusBanner } from "../StatusBanner";
import { TESTS, TEST_META, type TestType } from "@/lib/constants";
import type { Dataset, KpiConfig, KpiKind } from "@/lib/data";
import { saveConfig } from "@/lib/backend";

type Props = { data: Dataset; onSaved: () => Promise<void> | void; notice: string | null; setNotice: (m: string | null) => void };

/** Back-office settings: wards and quality indicators — add, edit, reorder,
 * deactivate, delete — without opening the Google Sheet. */
export function ConfigManager({ data, onSaved }: Pick<Props, "data" | "onSaved">) {
  const [section, setSection] = useState<"wards" | "kpi">("wards");
  const [notice, setNotice] = useState<string | null>(null);
  // Editors remount with fresh state whenever the data is reloaded (after a save).
  const k = data.loadedAt.getTime();
  return (
    <div className="space-y-4">
      <div className="join">
        {([["wards", "หอผู้ป่วย"], ["kpi", "ตัวชี้วัดคุณภาพ"]] as const).map(([sk, label]) => (
          <button key={sk} onClick={() => { setSection(sk); setNotice(null); }} aria-pressed={section === sk}
            className={`btn join-item btn-sm ${section === sk ? "btn-primary" : "border-base-content/10 bg-base-200/60 text-base-content/70"}`}>{label}</button>
        ))}
      </div>
      {section === "wards"
        ? <WardsEditor key={`w${k}`} data={data} onSaved={onSaved} notice={notice} setNotice={setNotice} />
        : <KpiEditor key={`k${k}`} data={data} onSaved={onSaved} notice={notice} setNotice={setNotice} />}
    </div>
  );
}

function SaveBar({ dirty, busy, onSave, onReset, error, done }: {
  dirty: boolean; busy: boolean; onSave: () => void; onReset: () => void; error: string | null; done: string | null;
}) {
  return (
    <div className="space-y-3">
      {error && <StatusBanner type="error" title="บันทึกไม่สำเร็จ" message={error} />}
      {done && <StatusBanner type="success" message={done} />}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && <span className="mr-auto text-xs text-warning">มีการแก้ไขที่ยังไม่บันทึก</span>}
        <button className="btn btn-ghost btn-sm gap-1.5" disabled={!dirty || busy} onClick={onReset}><Undo2 size={15} /> คืนค่าเดิม</button>
        <button className="btn btn-primary btn-sm gap-1.5" disabled={!dirty || busy} onClick={onSave}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} บันทึก
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wards
// ---------------------------------------------------------------------------

type WardDraft = { key: number; test: TestType; name: string; orig: string | null; active: boolean };

function WardsEditor({ data, onSaved, notice, setNotice }: Props) {
  const initial = useMemo<WardDraft[]>(() => data.wards.map((w, i) => ({ key: i, test: w.test, name: w.ward, orig: w.ward, active: w.active })), [data.wards]);
  const [rows, setRows] = useState<WardDraft[]>(initial);
  const [test, setTest] = useState<TestType>("Glucose");
  const [nextKey, setNextKey] = useState(10000);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const used = useMemo(() => {
    const s = new Set<string>();
    for (const r of data.usage) s.add(`${r.test}|${r.ward}`);
    return s;
  }, [data.usage]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const list = rows.filter((r) => r.test === test);
  const dupes = new Set(list.filter((r, i) => list.findIndex((x) => x.name.trim() === r.name.trim()) !== i).map((r) => r.name.trim()));
  const invalid = rows.some((r) => !r.name.trim()) || dupes.size > 0;

  const patch = (key: number, p: Partial<WardDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  function move(key: number, dir: -1 | 1) {
    setRows((rs) => {
      const sub = rs.filter((r) => r.test === test);
      const i = sub.findIndex((r) => r.key === key), j = i + dir;
      if (j < 0 || j >= sub.length) return rs;
      [sub[i], sub[j]] = [sub[j], sub[i]];
      let n = 0;
      return rs.map((r) => (r.test === test ? sub[n++] : r));
    });
  }
  function add() {
    const name = newName.trim();
    if (!name) return;
    if (list.some((r) => r.name.trim() === name)) { setError(`มีหอ "${name}" อยู่แล้วใน ${test}`); return; }
    setError(null);
    setRows((rs) => [...rs, { key: nextKey, test, name, orig: null, active: true }]);
    setNextKey((k) => k + 1); setNewName("");
  }
  async function save() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const ordered = [...TESTS.flatMap((t) => rows.filter((r) => r.test === t))];
      const renames = ordered.filter((r) => r.orig && r.orig !== r.name.trim()).map((r) => ({ test: r.test, from: r.orig!, to: r.name.trim() }));
      const res = await saveConfig({ table: "wards", rows: ordered.map((r, i) => [r.test, r.name.trim(), i + 1, r.active]), renames });
      setNotice(`บันทึกแล้ว ${res.count} รายการ${res.renamed ? ` · แก้ชื่อในข้อมูลเก่า ${res.renamed} แถว` : ""}`);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <section className="glass-panel space-y-4 rounded-box p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-base-content">รายการหอผู้ป่วย</h2>
          <p className="mt-0.5 text-xs text-base-content/60">
            เพิ่มหอใหม่ แก้ชื่อ (ข้อมูลเก่าเปลี่ยนชื่อตามให้) เรียงลำดับ หรือปิดใช้งานหอที่ปิดบริการ — หอที่ปิดใช้งานยังคงข้อมูลย้อนหลังไว้ แต่ไม่ต้องกรอกอีก
          </p>
        </div>
        <div className="join">
          {TESTS.map((t) => (
            <button key={t} onClick={() => setTest(t)} className={`btn join-item btn-sm ${test === t ? "btn-primary" : "border-base-content/10 bg-base-200/60 text-base-content/70"}`}>
              {TEST_META[t].label} <span className="opacity-70">({rows.filter((r) => r.test === t && r.active).length})</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-base-content/8 rounded-field border border-base-content/8">
        {list.map((r, i) => {
          const hasData = r.orig != null && used.has(`${r.test}|${r.orig}`);
          return (
            <li key={r.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-6 text-xs text-base-content/40">{i + 1}</span>
              <input value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} aria-label={`ชื่อหอ ลำดับ ${i + 1}`}
                className={`input input-sm input-bordered min-w-48 flex-1 bg-base-200/60 ${r.active ? "" : "opacity-60"} ${!r.name.trim() || dupes.has(r.name.trim()) ? "input-error" : ""}`} />
              {r.orig == null && <span className="badge badge-sm badge-info">ใหม่</span>}
              {r.orig != null && r.orig !== r.name.trim() && <span className="badge badge-sm badge-warning" title={`เดิม: ${r.orig}`}>เปลี่ยนชื่อ</span>}
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-base-content/70">
                <input type="checkbox" className="toggle toggle-sm toggle-primary" checked={r.active} onChange={(e) => patch(r.key, { active: e.target.checked })} />
                ใช้งาน
              </label>
              <button className="btn btn-ghost btn-xs btn-square" disabled={i === 0} onClick={() => move(r.key, -1)} aria-label="เลื่อนขึ้น"><ArrowUp size={14} /></button>
              <button className="btn btn-ghost btn-xs btn-square" disabled={i === list.length - 1} onClick={() => move(r.key, 1)} aria-label="เลื่อนลง"><ArrowDown size={14} /></button>
              <button className="btn btn-ghost btn-xs btn-square text-error" disabled={hasData} aria-label={`ลบ ${r.name}`}
                title={hasData ? "มีข้อมูลการใช้งานแล้ว — ลบไม่ได้ ให้ปิดใช้งานแทน" : "ลบหอนี้"}
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 size={14} /></button>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-base-content/55">ยังไม่มีหอใน {test}</li>}
      </ul>

      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`ชื่อหอใหม่ใน ${TEST_META[test].label} เช่น หอผู้ป่วย 9ก`} aria-label="ชื่อหอใหม่"
          className="input input-sm input-bordered min-w-64 flex-1 bg-base-200/60" />
        <button type="submit" className="btn btn-outline btn-sm gap-1.5" disabled={!newName.trim()}><Plus size={15} /> เพิ่มหอ</button>
      </form>
      {invalid && <p className="text-xs text-error">ชื่อหอต้องไม่ว่างและไม่ซ้ำกันในประเภทเดียวกัน</p>}

      <SaveBar dirty={dirty} busy={busy || invalid} onSave={save} onReset={() => { setRows(initial); setError(null); }} error={error} done={notice} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Quality indicators
// ---------------------------------------------------------------------------

type KpiDraft = {
  key: number; isNew: boolean; id: string; group: string; name: string; shortName: string; criteria: string; kind: KpiKind;
  field1Label: string; field2Label: string; target: string; direction: "max" | "min"; decimals: string; active: boolean;
};
const KIND_LABEL: Record<KpiKind, string> = {
  direct_percent: "กรอกร้อยละโดยตรง",
  ratio_pair: "กรอก 2 ค่า (ตัวตั้ง ÷ ตัวหาร)",
  ratio_auto: "กรอกตัวตั้ง (ตัวหารคิดจากจำนวนการตรวจ)",
  count: "จำนวนนับ (ไม่เทียบเกณฑ์%)",
};
const toDraft = (c: KpiConfig, i: number): KpiDraft => ({
  key: i, isNew: false, id: c.id, group: c.group, name: c.name, shortName: c.shortName, criteria: c.criteria, kind: c.kind,
  field1Label: c.field1Label, field2Label: c.field2Label, target: c.targetValue == null ? "" : String(c.targetValue),
  direction: c.targetDirection, decimals: String(c.decimals), active: c.active,
});

function KpiEditor({ data, onSaved, notice, setNotice }: Props) {
  const initial = useMemo(() => data.kpiConfig.map(toDraft), [data.kpiConfig]);
  const [rows, setRows] = useState<KpiDraft[]>(initial);
  const [open, setOpen] = useState<number | null>(null);
  const [nextKey, setNextKey] = useState(10000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasData = useMemo(() => new Set(data.kpi.map((k) => k.indicator.replace(/_(pct|num|den|count)$/, ""))), [data.kpi]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const idOk = (r: KpiDraft) => /^[A-Za-z0-9_]{2,40}$/.test(r.id);
  const errorsOf = (r: KpiDraft, i: number) => {
    const e: string[] = [];
    if (!idOk(r)) e.push("รหัสต้องเป็นอังกฤษ/ตัวเลข/_ ยาว 2–40 ตัว");
    if (rows.findIndex((x) => x.id === r.id) !== i) e.push("รหัสซ้ำ");
    if (!r.name.trim()) e.push("ต้องมีชื่อ");
    if (r.target.trim() !== "" && !Number.isFinite(Number(r.target))) e.push("ค่าเป้าหมายต้องเป็นตัวเลข");
    return e;
  };
  const anyInvalid = rows.some((r, i) => errorsOf(r, i).length > 0);

  const patch = (key: number, p: Partial<KpiDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  function move(i: number, dir: -1 | 1) {
    setRows((rs) => { const j = i + dir; if (j < 0 || j >= rs.length) return rs; const c = [...rs]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  }
  function add() {
    const key = nextKey; setNextKey(key + 1);
    setRows((rs) => [...rs, { key, isNew: true, id: "", group: "", name: "", shortName: "", criteria: "", kind: "direct_percent",
      field1Label: "ร้อยละ", field2Label: "", target: "", direction: "max", decimals: "1", active: true }]);
    setOpen(key);
  }
  async function save() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await saveConfig({
        table: "kpiConfig",
        rows: rows.map((r, i) => [r.id, r.group.trim() || r.id, r.name.trim(), r.shortName.trim() || r.name.trim(), r.criteria.trim(), r.kind,
          r.field1Label.trim(), r.kind === "ratio_pair" || r.kind === "count" ? r.field2Label.trim() : "",
          r.target.trim() === "" ? "" : Number(r.target), r.direction, Number(r.decimals) || 0, i + 1, r.active]),
      });
      setNotice(`บันทึกแล้ว ${res.count} ตัวชี้วัด`);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const inp = "input input-sm input-bordered w-full bg-base-200/60";
  const lbl = "mb-1 block text-xs text-base-content/60";
  return (
    <section className="glass-panel space-y-4 rounded-box p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold text-base-content">ตัวชี้วัดคุณภาพ</h2>
        <p className="mt-0.5 text-xs text-base-content/60">
          เพิ่ม/แก้ไข/เรียงลำดับตัวชี้วัด ตัวที่มีข้อมูลแล้วลบไม่ได้ (ให้ปิดใช้งานแทน) และเปลี่ยนรหัสไม่ได้ เพื่อไม่ให้ข้อมูลย้อนหลังหลุด
        </p>
      </div>

      <ul className="space-y-2">
        {rows.map((r, i) => {
          const errs = errorsOf(r, i);
          const isOpen = open === r.key;
          const locked = !r.isNew && hasData.has(r.id);
          return (
            <li key={r.key} className={`rounded-field border ${errs.length ? "border-error/50" : "border-base-content/8"} bg-base-content/3`}>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="w-6 text-xs text-base-content/40">{i + 1}</span>
                <button className="min-w-48 flex-1 text-left" onClick={() => setOpen(isOpen ? null : r.key)} aria-expanded={isOpen}>
                  <span className={`block text-sm font-medium ${r.active ? "text-base-content/90" : "text-base-content/50"}`}>{r.shortName || r.name || "(ตัวชี้วัดใหม่)"}</span>
                  <span className="block text-xs text-base-content/55">
                    {r.id || "ยังไม่ระบุรหัส"} · {KIND_LABEL[r.kind]}{r.target.trim() !== "" && ` · เกณฑ์ ${r.direction === "min" ? "≤" : "≥"} ${r.target}%`}
                  </span>
                </button>
                {r.isNew && <span className="badge badge-sm badge-info">ใหม่</span>}
                {!r.active && <span className="badge badge-sm">ปิดใช้งาน</span>}
                <button className="btn btn-ghost btn-xs btn-square" disabled={i === 0} onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น"><ArrowUp size={14} /></button>
                <button className="btn btn-ghost btn-xs btn-square" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="เลื่อนลง"><ArrowDown size={14} /></button>
                <button className="btn btn-ghost btn-xs btn-square" onClick={() => setOpen(isOpen ? null : r.key)} aria-label={isOpen ? "ย่อ" : "แก้ไข"}>{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
              </div>
              {errs.length > 0 && <p className="px-3 pb-2 text-xs text-error">{errs.join(" · ")}</p>}
              {isOpen && (
                <div className="grid grid-cols-1 gap-3 border-t border-base-content/8 p-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div><label className={lbl} htmlFor={`k-id-${r.key}`}>รหัส (ภาษาอังกฤษ ใช้ภายใน)</label>
                    <input id={`k-id-${r.key}`} className={inp} value={r.id} disabled={!r.isNew} onChange={(e) => patch(r.key, { id: e.target.value.trim() })} placeholder="เช่น poct_new_kpi" /></div>
                  <div><label className={lbl} htmlFor={`k-group-${r.key}`}>กลุ่ม (ตัวชี้วัดกลุ่มเดียวกันแสดงรวมกัน)</label>
                    <input id={`k-group-${r.key}`} className={inp} value={r.group} onChange={(e) => patch(r.key, { group: e.target.value.trim() })} placeholder="เว้นว่าง = ใช้รหัส" /></div>
                  <div><label className={lbl} htmlFor={`k-short-${r.key}`}>ชื่อย่อ</label>
                    <input id={`k-short-${r.key}`} className={inp} value={r.shortName} onChange={(e) => patch(r.key, { shortName: e.target.value })} /></div>
                  <div className="sm:col-span-2 xl:col-span-3"><label className={lbl} htmlFor={`k-name-${r.key}`}>ชื่อตัวชี้วัดเต็ม</label>
                    <input id={`k-name-${r.key}`} className={inp} value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} /></div>
                  <div className="sm:col-span-2 xl:col-span-3"><label className={lbl} htmlFor={`k-crit-${r.key}`}>คำอธิบายเกณฑ์</label>
                    <input id={`k-crit-${r.key}`} className={inp} value={r.criteria} onChange={(e) => patch(r.key, { criteria: e.target.value })} placeholder="เช่น มากกว่าร้อยละ 90" /></div>
                  <div><label className={lbl} htmlFor={`k-kind-${r.key}`}>วิธีกรอก/คำนวณ</label>
                    <select id={`k-kind-${r.key}`} className="select select-sm select-bordered w-full bg-base-200/60" value={r.kind} disabled={locked}
                      onChange={(e) => patch(r.key, { kind: e.target.value as KpiKind })}>
                      {(Object.keys(KIND_LABEL) as KpiKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                    {locked && <span className="mt-1 block text-[11px] text-base-content/50">มีข้อมูลแล้ว เปลี่ยนวิธีกรอกไม่ได้</span>}</div>
                  <div><label className={lbl} htmlFor={`k-f1-${r.key}`}>ชื่อช่องที่ 1</label>
                    <input id={`k-f1-${r.key}`} className={inp} value={r.field1Label} onChange={(e) => patch(r.key, { field1Label: e.target.value })} /></div>
                  <div><label className={lbl} htmlFor={`k-f2-${r.key}`}>ชื่อช่องที่ 2 (เฉพาะแบบ 2 ค่า/จำนวนนับ)</label>
                    <input id={`k-f2-${r.key}`} className={inp} value={r.field2Label} disabled={r.kind !== "ratio_pair" && r.kind !== "count"} onChange={(e) => patch(r.key, { field2Label: e.target.value })} /></div>
                  <div><label className={lbl} htmlFor={`k-t-${r.key}`}>ค่าเป้าหมาย (%)</label>
                    <input id={`k-t-${r.key}`} className={inp} inputMode="decimal" value={r.target} onChange={(e) => patch(r.key, { target: e.target.value })} placeholder="ว่าง = ไม่มีเกณฑ์" /></div>
                  <div><label className={lbl} htmlFor={`k-d-${r.key}`}>ผ่านเมื่อ</label>
                    <select id={`k-d-${r.key}`} className="select select-sm select-bordered w-full bg-base-200/60" value={r.direction} onChange={(e) => patch(r.key, { direction: e.target.value as "max" | "min" })}>
                      <option value="max">ค่า ≥ เป้าหมาย (ยิ่งมากยิ่งดี)</option>
                      <option value="min">ค่า ≤ เป้าหมาย (ยิ่งน้อยยิ่งดี)</option>
                    </select></div>
                  <div><label className={lbl} htmlFor={`k-dec-${r.key}`}>ทศนิยม</label>
                    <select id={`k-dec-${r.key}`} className="select select-sm select-bordered w-full bg-base-200/60" value={r.decimals} onChange={(e) => patch(r.key, { decimals: e.target.value })}>
                      {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n} ตำแหน่ง</option>)}
                    </select></div>
                  <div className="flex items-end justify-between gap-3 sm:col-span-2 xl:col-span-3">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-base-content/70">
                      <input type="checkbox" className="toggle toggle-sm toggle-primary" checked={r.active} onChange={(e) => patch(r.key, { active: e.target.checked })} />
                      ใช้งาน (ปิด = ซ่อนจากแบบกรอกและ Dashboard แต่เก็บข้อมูลไว้)
                    </label>
                    <button className="btn btn-ghost btn-xs gap-1 text-error" disabled={locked}
                      title={locked ? "มีข้อมูลแล้ว — ลบไม่ได้ ให้ปิดใช้งานแทน" : "ลบตัวชี้วัดนี้"}
                      onClick={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); setOpen(null); }}><Trash2 size={14} /> ลบ</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button className="btn btn-outline btn-sm gap-1.5" onClick={add}><Plus size={15} /> เพิ่มตัวชี้วัด</button>
      <SaveBar dirty={dirty} busy={busy || anyInvalid} onSave={save} onReset={() => { setRows(initial); setError(null); setOpen(null); }} error={error} done={notice} />
    </section>
  );
}
