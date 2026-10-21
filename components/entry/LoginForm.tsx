"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, AlertCircle, ArrowLeft, Eye, EyeOff, IdCard, KeyRound, Loader2 } from "lucide-react";
import { login } from "@/lib/backend";

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
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-4 px-4">
      <form onSubmit={handleSubmit} className="glass-panel w-full max-w-sm rounded-box p-7">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-field bg-primary/15 text-primary">
            <Activity size={22} strokeWidth={2.4} />
          </span>
          <div>
            <h1 className="text-base font-semibold text-base-content">เข้าสู่ระบบหลังบ้าน</h1>
            <p className="mt-1 text-xs text-base-content/50">หน่วย POCT · รพ.ศรีนครินทร์</p>
          </div>
        </div>

        <label htmlFor="staff-id" className="mb-1.5 block text-xs font-medium text-base-content/50">Staff ID</label>
        <div className="relative mb-4">
          <IdCard size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
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

        <label htmlFor="pin" className="mb-1.5 block text-xs font-medium text-base-content/50">PIN</label>
        <div className="relative">
          <KeyRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
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
            className="absolute right-3 top-1/2 -translate-y-1/2 select-none text-base-content/40 hover:text-base-content/70"
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
          className="btn btn-primary mt-5 w-full gap-2 shadow-lg shadow-primary/20"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-base-content/40">
          ยังไม่มี Staff ID หรือลืม PIN — ให้ผู้ดูแล Google Sheet ตั้งให้จากเมนู “🔑 POCT หลังบ้าน”
        </p>
      </form>
      <Link href="/" className="btn btn-ghost btn-sm gap-1.5 text-base-content/60">
        <ArrowLeft size={15} /> กลับหน้า Dashboard
      </Link>
    </div>
  );
}
