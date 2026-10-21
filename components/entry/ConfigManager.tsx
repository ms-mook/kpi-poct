"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowRightLeft, ArrowUp, ChevronDown, ChevronUp, Loader2, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { StatusBanner } from "../StatusBanner";
import { MONTH_ABBR_TH, TESTS, TEST_META, type TestType } from "@/lib/constants";
import type { Dataset, KpiConfig, KpiKind } from "@/lib/data";
import { saveConfig } from "@/lib/backend";

type Props = { data: Dataset; onSaved: () => Promise<void> | void; notice: string | null; setNotice: (m: string | null) => void };

/** Back-office settings: wards and quality indicators — add, edit, reorder,
 * deactivate, delete — without opening the Google Sheet. */
export function ConfigManager({ data, onSaved }: Pick<Props, "data" | "onSaved">) {
  const [section, setSection] = useState<"wards" | "devices" | "kpi">("wards");
  const [notice, setNotice] = useState<string | null>(null);
  // Editors remount with fresh state whenever the data is reloaded (after a save).
  const k = data.loadedAt.getTime();
  return (
    <div className="space-y-4">
      <div className="join">
        {([["wards", "หอผู้ป่วย"], ["devices", "เครื่อง / SN"], ["kpi", "ตัวชี้วัดคุณภาพ"]] as const).map(([sk, label]) => (
          <button key={sk} onClick={() => { setSection(sk); setNotice(null); }} aria-pressed={section === sk}
            className={`btn join-item btn-sm ${section === sk ? "btn-primary" : "border-base-content/10 bg-base-200/60 text-base-content/70"}`}>{label}</button>
        ))}
      </div>
      {section === "wards"
        ? <WardsEditor key={`w${k}`} data={data} onSaved={onSaved} notice={notice} setNotice={setNotice} />
        : section === "devices"
        ? <DevicesEditor key={`d${k}`} data={data} onSaved={onSaved} notice={notice} setNotice={setNotice} />
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
  const withDevices = useMemo(() => new Set(data.devices.map((d) => `${d.test}|${d.ward}`)), [data.devices]);
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
      const res = await saveConfig({ table: "wards", baseVersion: data.versions?.wards, rows: ordered.map((r, i) => [r.test, r.name.trim(), i + 1, r.active]), renames });
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
          const hasData = r.orig != null && (used.has(`${r.test}|${r.orig}`) || withDevices.has(`${r.test}|${r.orig}`));
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
                title={hasData ? "มีข้อมูลการใช้งานหรือเครื่อง (SN) ผูกอยู่ — ลบไม่ได้ ให้ปิดใช้งานแทน" : "ลบหอนี้"}
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
        table: "kpiConfig", baseVersion: data.versions?.kpiConfig,
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

// ---------------------------------------------------------------------------
// Devices (SN) — one row per stay of a meter in a ward
// ---------------------------------------------------------------------------

type DevDraft = { key: number; test: TestType; sn: string; ward: string; fy: string; fm: string; ty: string; tm: string; note: string };
const nowBE = new Date().getFullYear() + 543;
const YEARS = Array.from({ length: nowBE + 1 - 2560 + 1 }, (_, i) => 2560 + i);
const idx = (y: string, m: string) => Number(y) * 12 + Number(m);

function DevicesEditor({ data, onSaved, notice, setNotice }: Props) {
  const initial = useMemo<DevDraft[]>(() => data.devices
    .map((d) => ({ test: d.test, sn: d.sn, ward: d.ward, fy: String(d.fromYear), fm: String(d.fromMonth),
      ty: d.toYear == null ? "" : String(d.toYear), tm: d.toMonth == null ? "" : String(d.toMonth), note: d.note }))
    .sort((a, b) => a.test.localeCompare(b.test) || a.sn.localeCompare(b.sn) || idx(a.fy, a.fm) - idx(b.fy, b.fm))
    .map((d, i) => ({ ...d, key: i })), [data.devices]);
  const [rows, setRows] = useState<DevDraft[]>(initial);
  const [test, setTest] = useState<TestType>("Glucose");
  const [nextKey, setNextKey] = useState(10000);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wardNames = useMemo(() => data.wards.filter((w) => w.test === test).map((w) => w.ward), [data.wards, test]);
  const sig = (r: DevDraft[]) => JSON.stringify(r.map((x) => [x.test, x.sn, x.ward, x.fy, x.fm, x.ty, x.tm, x.note]));
  const dirty = sig(rows) !== sig(initial);

  const errorsOf = (r: DevDraft) => {
    const e: string[] = [];
    if (!r.sn.trim()) e.push("ต้องมี SN");
    if (!r.ward) e.push("เลือกหอ");
    else if (!data.wards.some((w) => w.test === r.test && w.ward === r.ward)) e.push("ไม่พบหอนี้ในรายการหอ");
    if ((r.ty === "") !== (r.tm === "")) e.push("ระบุปีและเดือนสิ้นสุดให้ครบ หรือเว้นว่าง");
    else if (r.ty !== "" && idx(r.ty, r.tm) < idx(r.fy, r.fm)) e.push("สิ้นสุดก่อนเริ่ม");
    const a = idx(r.fy, r.fm), b = r.ty === "" ? 1e9 : idx(r.ty, r.tm);
    if (rows.some((o) => o.key !== r.key && o.test === r.test && o.sn.trim() === r.sn.trim() && r.sn.trim() &&
      a <= (o.ty === "" ? 1e9 : idx(o.ty, o.tm)) && idx(o.fy, o.fm) <= b)) e.push("ช่วงเวลาซ้อนกับรายการอื่นของ SN เดียวกัน");
    return e;
  };
  const list = rows.filter((r) => r.test === test && (!q.trim() || (r.sn + r.ward).toLowerCase().includes(q.trim().toLowerCase())));
  const anyInvalid = rows.some((r) => errorsOf(r).length > 0);

  const patch = (key: number, p: Partial<DevDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  function add(base?: Partial<DevDraft>) {
    const key = nextKey; setNextKey(key + 1);
    const m = new Date().getMonth() + 1;
    setRows((rs) => [...rs, { key, test, sn: "", ward: "", fy: String(nowBE), fm: String(m), ty: "", tm: "", note: "", ...base }]);
  }
  /** Close the open stay at the month before the move and open a new one. */
  function moveDevice(r: DevDraft) {
    const m = new Date().getMonth() + 1, y = nowBE;
    const prevIdx = y * 12 + m - 1 - 1; // month before this one (0-based month math)
    const py = Math.floor(prevIdx / 12), pm = (prevIdx % 12) + 1;
    setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, ty: String(py), tm: String(pm) } : x)));
    add({ sn: r.sn, ward: "", fy: String(y), fm: String(m) });
  }
  async function save() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await saveConfig({
        table: "devices", baseVersion: data.versions?.devices,
        rows: rows.map((r) => [r.test, r.sn.trim(), r.ward, Number(r.fy), Number(r.fm), r.ty === "" ? "" : Number(r.ty), r.tm === "" ? "" : Number(r.tm), r.note.trim()]),
      });
      setNotice(`บันทึกแล้ว ${res.count} รายการ`);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const sel = "select select-sm select-bordered bg-base-200/60";
  const sns = new Set(rows.filter((r) => r.test === test && r.sn.trim()).map((r) => r.sn.trim())).size;
  return (
    <section className="glass-panel space-y-4 rounded-box p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-base-content">เครื่องตรวจ (SN) และประวัติการอยู่หอ</h2>
          <p className="mt-0.5 text-xs text-base-content/60">
            1 แถว = เครื่องนี้อยู่หอนี้ช่วงนี้ — ถ้าเครื่องถูกย้ายหรือส่งซ่อมแล้วย้ายกลับ ให้กด “ย้ายหอ” เพื่อปิดช่วงเดิมและเริ่มช่วงใหม่ (ถึง = ว่าง หมายถึงอยู่ปัจจุบัน)
          </p>
        </div>
        <div className="join">
          {TESTS.map((t) => (
            <button key={t} onClick={() => setTest(t)} className={`btn join-item btn-sm ${test === t ? "btn-primary" : "border-base-content/10 bg-base-200/60 text-base-content/70"}`}>
              {TEST_META[t].label} <span className="opacity-70">({new Set(rows.filter((r) => r.test === t && r.sn.trim()).map((r) => r.sn.trim())).size} เครื่อง)</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา SN หรือชื่อหอ" aria-label="ค้นหา SN หรือชื่อหอ" className="input input-sm input-bordered w-64 bg-base-200/60" />
        <span className="text-xs text-base-content/55">{list.length} รายการ · {sns} เครื่อง</span>
        <button className="btn btn-outline btn-sm ml-auto gap-1.5" onClick={() => add()}><Plus size={15} /> เพิ่มเครื่อง</button>
      </div>

      <div tabIndex={0} role="region" aria-label="รายการเครื่องตรวจ" className="max-h-[36rem] overflow-auto rounded-field border border-base-content/8 focus-visible:outline-2 focus-visible:outline-primary">
        <table className="w-full min-w-[60rem] border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="text-left text-base-content/70">
              {["SN", "หอผู้ป่วย", "อยู่ตั้งแต่", "ถึง (ว่าง = ปัจจุบัน)", "หมายเหตุ", ""].map((h) => (
                <th key={h || "act"} className="sticky top-0 z-10 bg-base-200 px-2 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const errs = errorsOf(r);
              const open = r.ty === "";
              return (
                <tr key={r.key} className={errs.length ? "bg-error/8" : ""}>
                  <td className="border-t border-base-content/6 px-2 py-1.5 align-top">
                    <input value={r.sn} onChange={(e) => patch(r.key, { sn: e.target.value })} aria-label="SN" className={`input input-sm input-bordered w-40 bg-base-200/60 font-mono ${!r.sn.trim() ? "input-error" : ""}`} />
                  </td>
                  <td className="border-t border-base-content/6 px-2 py-1.5 align-top">
                    <select value={r.ward} onChange={(e) => patch(r.key, { ward: e.target.value })} aria-label="หอผู้ป่วย" className={`${sel} w-52 ${!r.ward ? "select-error" : ""}`}>
                      <option value="">— เลือกหอ —</option>
                      {(r.test === test ? wardNames : data.wards.filter((w) => w.test === r.test).map((w) => w.ward)).map((w) => <option key={w} value={w}>{w}</option>)}
                      {r.ward && !wardNames.includes(r.ward) && <option value={r.ward}>{r.ward} (ไม่อยู่ในรายการ)</option>}
                    </select>
                  </td>
                  <td className="border-t border-base-content/6 px-2 py-1.5 align-top whitespace-nowrap">
                    <select value={r.fm} onChange={(e) => patch(r.key, { fm: e.target.value })} aria-label="เดือนเริ่ม" className={`${sel} w-20`}>
                      {MONTH_ABBR_TH.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>{" "}
                    <select value={r.fy} onChange={(e) => patch(r.key, { fy: e.target.value })} aria-label="ปีเริ่ม" className={`${sel} w-24`}>
                      {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </td>
                  <td className="border-t border-base-content/6 px-2 py-1.5 align-top whitespace-nowrap">
                    <select value={r.tm} onChange={(e) => patch(r.key, { tm: e.target.value, ty: r.ty || String(nowBE) })} aria-label="เดือนสิ้นสุด" className={`${sel} w-20`}>
                      <option value="">—</option>
                      {MONTH_ABBR_TH.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>{" "}
                    <select value={r.ty} onChange={(e) => patch(r.key, { ty: e.target.value, tm: r.tm || "9" })} aria-label="ปีสิ้นสุด" className={`${sel} w-24`}>
                      <option value="">ปัจจุบัน</option>
                      {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                    {errs.length > 0 && <p className="mt-1 text-error">{errs.join(" · ")}</p>}
                  </td>
                  <td className="border-t border-base-content/6 px-2 py-1.5 align-top">
                    <input value={r.note} onChange={(e) => patch(r.key, { note: e.target.value })} aria-label="หมายเหตุ" placeholder="เช่น ส่งซ่อม / ย้ายมาจาก…" className="input input-sm input-bordered w-56 bg-base-200/60" />
                  </td>
                  <td className="border-t border-base-content/6 px-2 py-1.5 align-top whitespace-nowrap">
                    {open && r.sn.trim() && r.ward && (
                      <button className="btn btn-ghost btn-xs gap-1" onClick={() => moveDevice(r)} title="ปิดช่วงนี้ที่สิ้นเดือนก่อน แล้วเริ่มช่วงใหม่ในหออื่น"><ArrowRightLeft size={13} /> ย้ายหอ</button>
                    )}
                    <button className="btn btn-ghost btn-xs btn-square text-error" aria-label={`ลบ ${r.sn || "แถวนี้"}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-base-content/55">ยังไม่มีเครื่องใน {test}{q ? " ที่ตรงกับคำค้น" : ""}</td></tr>}
          </tbody>
        </table>
      </div>
      <SaveBar dirty={dirty} busy={busy || anyInvalid} onSave={save} onReset={() => { setRows(initial); setError(null); }} error={error} done={notice} />
    </section>
  );
}
