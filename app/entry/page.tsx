"use client";

import { useCallback, useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { ArrowLeft, KeyRound, LayoutDashboard, Loader2, LogOut, ShieldCheck, Syringe } from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { StatusBanner } from "@/components/StatusBanner";
import { LoginForm } from "@/components/entry/LoginForm";
import { UsageEntryForm } from "@/components/entry/UsageEntryForm";
import { KpiEntryForm } from "@/components/entry/KpiEntryForm";
import { ChangePinDialog } from "@/components/entry/ChangePinDialog";
import { APPS_SCRIPT_URL, getSession, login, logout, type Session } from "@/lib/backend";
import { loadDataset, type Dataset } from "@/lib/data";
import { HOME_HREF } from "@/lib/paths";

const TABS = [
  { id: "usage", label: "จำนวนการใช้งาน", icon: Syringe },
  { id: "kpi", label: "ตัวชี้วัดคุณภาพ", icon: ShieldCheck },
] as const;

export default function EntryPage() {
  const [session, setSession] = useState<Session | null>(null);
  // Last signed-in user. Once someone is in, an expired/rejected token must
  // NOT swap the form for the login page — that would throw away whatever
  // they had typed. The shell stays up and asks for the PIN in a dialog.
  const [active, setActive] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const sync = () => {
      const s = getSession();
      setSession(s);
      if (s) setActive(s);
      setChecked(true);
    };
    sync();
    window.addEventListener("kpi-poct-session", sync);
    return () => window.removeEventListener("kpi-poct-session", sync);
  }, []);

  const signOut = useCallback(() => { logout(); setActive(null); }, []);

  if (!APPS_SCRIPT_URL) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16">
        <StatusBanner
          type="info"
          title="ยังไม่ได้เชื่อมหลังบ้าน"
          message={<>ต้องติดตั้ง Apps Script ใน Google Sheet และใส่ตัวแปร <code>APPS_SCRIPT_URL</code> ใน GitHub ก่อน — ดูขั้นตอนใน SETUP.md ข้อ 3–5</>}
        />
        <a href={HOME_HREF} className="btn btn-ghost btn-sm mt-6 gap-1.5"><ArrowLeft size={15} /> กลับหน้า Dashboard</a>
      </main>
    );
  }
  if (!checked) return null;
  if (!active) return <LoginForm />;
  return <EntryShell session={active} expired={!session} onSignOut={signOut} />;
}

function EntryShell({ session, expired, onSignOut }: { session: Session; expired: boolean; onSignOut: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("usage");
  const [data, setData] = useState<Dataset | null>(null);
  const [pinOpen, setPinOpen] = useState(false);

  // Entry always works on live data — never the bundled snapshot, or a save
  // could be built on stale numbers.
  const reload = useCallback(async () => {
    const ds = await loadDataset();
    setData(ds);
  }, []);
  useEffect(() => {
    let cancelled = false;
    loadDataset().then((ds) => { if (!cancelled) setData(ds); });
    return () => { cancelled = true; };
  }, []);

  // backend.ts clears the session on an auth error; `expired` follows it.
  const onAuthLost = useCallback(() => {}, []);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-5 pb-24 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-base-content/8 pb-4">
        <div className="flex items-center gap-3">
          <LogoMark size={48} />
          <div className="leading-tight">
            <h1 className="text-lg font-semibold text-base-content sm:text-xl">กรอกข้อมูลรายเดือน — หน่วย POCT</h1>
            <p className="text-xs text-base-content/55">
              เข้าสู่ระบบ: <span className="font-medium text-base-content/80">{session.staffId}</span>
              {session.name && ` · ${session.name}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={HOME_HREF} aria-label="กลับหน้า Dashboard" title="กลับหน้า Dashboard" className="btn btn-ghost btn-sm gap-1.5 text-base-content/70"><LayoutDashboard size={15} /> <span className="hidden sm:inline">Dashboard</span></a>
          <button onClick={() => setPinOpen(true)} aria-label="เปลี่ยน PIN" title="เปลี่ยน PIN" className="btn btn-ghost btn-sm gap-1.5 text-base-content/70"><KeyRound size={15} /> <span className="hidden sm:inline">เปลี่ยน PIN</span></button>
          <button onClick={onSignOut} aria-label="ออกจากระบบ" title="ออกจากระบบ" className="btn btn-ghost btn-sm gap-1.5 text-base-content/70 hover:text-error"><LogOut size={15} /> <span className="hidden sm:inline">ออกจากระบบ</span></button>
          <ThemeSwitcher />
        </div>
      </header>


      <div role="tablist" className="tabs tabs-box glass-panel mb-5 w-full sm:w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" onClick={() => setTab(id)} className={`tab flex-1 gap-2 sm:flex-none ${tab === id ? "tab-active" : ""}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="flex items-center gap-2 py-20 text-sm text-base-content/55"><Loader2 size={16} className="animate-spin" /> กำลังโหลดข้อมูลล่าสุดจาก Google Sheet…</div>
      ) : data.source !== "live" ? (
        <StatusBanner type="error" title="อ่านข้อมูลจาก Google Sheet ไม่ได้ — ยังบันทึกไม่ได้" message={data.liveError ?? "ไม่ทราบสาเหตุ"} />
      ) : tab === "usage" ? (
        <UsageEntryForm data={data} onSaved={reload} onAuthLost={onAuthLost} />
      ) : (
        <KpiEntryForm data={data} onSaved={reload} onAuthLost={onAuthLost} />
      )}

      {pinOpen && !expired && <ChangePinDialog onClose={() => setPinOpen(false)} onAuthLost={onAuthLost} />}
      {expired && <ReLoginDialog staffId={session.staffId} onSignOut={onSignOut} />}
    </main>
  );
}

/** Shown over the form when the session ran out mid-work. Signing in again
 * keeps every typed value on screen; the user just presses บันทึก again. */
function ReLoginDialog({ staffId, onSignOut }: { staffId: string; onSignOut: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await login(staffId, pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPin("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="เข้าสู่ระบบอีกครั้ง">
      <div className="absolute inset-0 bg-black/50" />
      <form onSubmit={submit} className="glass-panel relative w-full max-w-sm rounded-box p-6 shadow-2xl">
        <h2 className="flex items-center gap-2 text-base font-semibold text-base-content"><KeyRound size={18} className="text-primary" /> หมดเวลาการใช้งาน</h2>
        <p className="mt-1 text-xs text-base-content/60">
          ข้อมูลที่กรอกไว้ยังอยู่ครบ — ใส่ PIN ของ <span className="font-semibold">{staffId}</span> แล้วกด “บันทึก” อีกครั้ง
        </p>
        <input autoFocus type="password" inputMode="numeric" autoComplete="current-password" aria-label="PIN" value={pin}
          onChange={(e) => setPin(e.target.value)} className="input input-bordered mt-4 w-full bg-base-200/60 tracking-widest" placeholder="PIN" />
        {error && <p role="alert" className="mt-2 text-xs text-error">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onSignOut} className="btn btn-ghost btn-sm flex-1">ออกจากระบบ</button>
          <button type="submit" disabled={busy || !pin} className="btn btn-primary btn-sm flex-1 gap-1.5">
            {busy && <Loader2 size={14} className="animate-spin" />} เข้าสู่ระบบ
          </button>
        </div>
      </form>
    </div>
  );
}
