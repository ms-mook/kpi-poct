"use client";

import { useEffect, useState } from "react";
import { LogoFull, LogoMark } from "@/components/Logo";
import { AlertCircle, ArrowLeft, ClipboardCheck, Eye, EyeOff, IdCard, KeyRound, LineChart, Loader2, ShieldCheck } from "lucide-react";
import { login } from "@/lib/backend";
import { HOME_HREF } from "@/lib/paths";

export function LoginForm() {
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  // Press-and-hold reveal (same as kpi-dashboard): releasing anywhere hides it.
  useEffect(() => {
    if (!showPin) return;
    const hide = () => setShowPin(false);
    window.addEventListener("mouseup", hide);
    window.addEventListener("touchend", hide);
    return () => {
      window.removeEventListener("mouseup", hide);
      window.removeEventListener("touchend", hide);
    };
  }, [showPin]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(staffId.trim(), pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-8">
      <div className="glass-panel grid w-full overflow-hidden rounded-box md:grid-cols-[1fr_1.05fr]">
        {/* Brand panel — hidden on phones so the form is the first thing seen */}
        <aside className="hidden flex-col justify-between gap-8 bg-primary/10 p-8 md:flex">
          <div>
            <LogoFull width={150} />
            <h2 className="mt-5 text-xl font-semibold text-base-content">KPI Dashboard — POCT Center</h2>
            <p className="mt-1 text-sm text-base-content/65">หน่วยเจาะเลือดเก็บสิ่งส่งตรวจและ POCT · รพ.ศรีนครินทร์</p>
          </div>
          <ul className="space-y-3 text-sm text-base-content/75">
            <li className="flex items-start gap-2.5"><ClipboardCheck size={17} className="mt-0.5 shrink-0 text-primary" /> กรอกจำนวนการใช้งานรายหอ และตัวชี้วัดคุณภาพรายเดือน</li>
            <li className="flex items-start gap-2.5"><LineChart size={17} className="mt-0.5 shrink-0 text-primary" /> บันทึกแล้ว Dashboard เห็นข้อมูลใหม่ทันที</li>
            <li className="flex items-start gap-2.5"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary" /> เฉพาะเจ้าหน้าที่ที่มี Staff ID และ PIN</li>
          </ul>
        </aside>

        <form onSubmit={handleSubmit} className="p-6 sm:p-9">
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <LogoMark size={48} />
            <p className="text-xs leading-snug text-base-content/65">KPI Dashboard — POCT Center<br />รพ.ศรีนครินทร์</p>
          </div>
          <h1 className="text-xl font-semibold text-base-content">เข้าสู่ระบบหลังบ้าน</h1>
          <p className="mb-6 mt-1 text-sm text-base-content/65">ใส่ Staff ID และ PIN เพื่อกรอกข้อมูลรายเดือน</p>

          <label htmlFor="staff-id" className="mb-1.5 block text-xs font-medium text-base-content/70">Staff ID</label>
          <div className="relative mb-4">
            <IdCard size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50" />
            <input
              id="staff-id"
              autoFocus
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="input input-bordered w-full bg-base-200/60 pl-9 uppercase"
              placeholder="เช่น MT001"
            />
          </div>

          <label htmlFor="pin" className="mb-1.5 block text-xs font-medium text-base-content/70">PIN</label>
          <div className="relative">
            <KeyRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50" />
            <input
              id="pin"
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="input input-bordered w-full bg-base-200/60 pl-9 pr-9 tracking-widest"
              placeholder="••••••"
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPin ? "ซ่อน PIN" : "กดค้างเพื่อดู PIN"}
              onMouseDown={(e) => { e.preventDefault(); setShowPin(true); }}
              onTouchStart={(e) => { e.preventDefault(); setShowPin(true); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 select-none text-base-content/50 hover:text-base-content/80"
            >
              {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <div role="alert" className="alert mt-4 border-0 bg-error/15 text-sm text-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !staffId.trim() || !pin}
            className="btn btn-primary mt-6 w-full gap-2 shadow-lg shadow-primary/20"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>

          <div className="mt-5 flex flex-col gap-3 border-t border-base-content/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-relaxed text-base-content/55">
              ยังไม่มี Staff ID หรือลืม PIN — ให้ผู้ดูแล Google Sheet ตั้งให้จากเมนู “🔑 POCT หลังบ้าน”
            </p>
            <a href={HOME_HREF} className="btn btn-ghost btn-sm shrink-0 gap-1.5 text-base-content/70">
              <ArrowLeft size={15} /> กลับ Dashboard
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}
