"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Eye, EyeOff, IdCard, KeyRound, Loader2 } from "lucide-react";
import { LogoFull, LogoMark } from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { RingsArt } from "./RingsArt";
import { login } from "@/lib/backend";
import { HOME_HREF } from "@/lib/paths";

export function LoginForm() {
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    idRef.current?.focus();
    // An earlier version could remember the Staff ID in this browser; clear it.
    try { localStorage.removeItem("kpi-poct-last-staff"); } catch { /* storage blocked */ }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = staffId.trim();
    setLoading(true);
    setError(null);
    try {
      await login(id, pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPin("");
      pinRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  const inputBase =
    "h-12 w-full rounded-field border border-base-content/15 bg-base-100/70 pl-11 text-[15px] text-base-content " +
    "placeholder:text-base-content/40 transition-colors hover:border-base-content/30 " +
    "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35";

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.08fr_1fr]">
      {/* Brand side — large screens */}
      <aside className="relative hidden overflow-hidden bg-base-200 lg:flex lg:flex-col lg:justify-between lg:p-14">
        <RingsArt className="pointer-events-none absolute left-1/2 top-[40%] w-[min(56rem,135%)] -translate-x-1/2 -translate-y-1/2" />
        <div className="relative flex flex-1 items-center justify-center">
          <LogoFull width={188} className="!p-5" />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-2xl font-semibold leading-snug text-base-content">KPI Dashboard — POCT Center</h2>
          <p className="mt-1 text-sm text-base-content/70">หน่วยเจาะเลือดเก็บสิ่งส่งตรวจและ POCT · รพ.ศรีนครินทร์</p>
        </div>
      </aside>

      {/* Mobile / tablet header */}
      <header className="relative flex items-center gap-3 overflow-hidden bg-base-200 px-6 py-6 lg:hidden">
        <RingsArt className="pointer-events-none absolute -right-24 top-1/2 w-72 -translate-y-1/2" />
        <LogoMark size={52} className="relative" />
        <div className="relative leading-tight">
          <p className="text-base font-semibold text-base-content">KPI Dashboard — POCT Center</p>
          <p className="mt-0.5 text-xs text-base-content/70">รพ.ศรีนครินทร์</p>
        </div>
      </header>

      {/* Form side */}
      <section className="relative flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <ThemeSwitcher className="absolute right-4 top-4 lg:right-6 lg:top-6" />
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm" noValidate>
          <h1 className="mb-8 text-2xl font-semibold text-base-content">เข้าสู่ระบบผู้ดูแล</h1>

          <label htmlFor="staff-id" className="mb-1.5 block text-sm font-medium text-base-content/85">Staff ID</label>
          <div className="relative mb-5">
            <IdCard size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base-content/50" />
            <input
              id="staff-id"
              ref={idRef}
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className={`${inputBase} pr-4 uppercase placeholder:normal-case`}
              placeholder="Staff ID ของคุณ"
            />
          </div>

          <label htmlFor="pin" className="mb-1.5 block text-sm font-medium text-base-content/85">PIN</label>
          <div className="relative">
            <KeyRound size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base-content/50" />
            <input
              id="pin"
              ref={pinRef}
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className={`${inputBase} pr-12 tracking-[0.25em] placeholder:tracking-normal`}
              placeholder="PIN ของคุณ"
            />
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              aria-pressed={showPin}
              aria-label={showPin ? "ซ่อน PIN" : "แสดง PIN"}
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-field text-base-content/60 hover:bg-base-content/8 hover:text-base-content focus-visible:outline-2 focus-visible:outline-primary"
            >
              {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-field bg-error/12 px-3.5 py-3 text-sm text-error">
              <AlertCircle size={18} className="mt-px shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !staffId.trim() || !pin}
            className="btn btn-primary mt-6 h-12 w-full gap-2 text-[15px]"
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>

          <a href={HOME_HREF} className="mt-6 inline-flex items-center gap-1.5 rounded-field text-sm font-medium text-base-content/80 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <ArrowLeft size={16} /> กลับไปดู Dashboard
          </a>
        </form>
      </section>
    </main>
  );
}
