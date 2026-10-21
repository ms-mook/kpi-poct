"use client";

import { useState } from "react";
import { KeyRound, Loader2, X } from "lucide-react";
import { AuthError, changePin } from "@/lib/backend";

export function ChangePinDialog({ onClose, onAuthLost }: { onClose: () => void; onAuthLost: () => void }) {
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirmPin !== "" && newPin !== confirmPin;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPin !== confirmPin) return;
    setSaving(true); setError(null);
    try {
      await changePin(oldPin, newPin);
      setDone(true);
    } catch (err) {
      if (err instanceof AuthError) onAuthLost();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="เปลี่ยน PIN">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <form onSubmit={submit} className="glass-panel relative w-full max-w-sm rounded-box p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="btn btn-ghost btn-xs btn-circle absolute right-3 top-3" aria-label="ปิด">
          <X size={16} />
        </button>
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-base-content">
          <KeyRound size={18} className="text-primary" /> เปลี่ยน PIN
        </h2>
        {done ? (
          <>
            <p className="text-sm text-success">เปลี่ยน PIN เรียบร้อย ใช้ PIN ใหม่ในการเข้าสู่ระบบครั้งถัดไป</p>
            <button type="button" onClick={onClose} className="btn btn-primary btn-sm mt-5 w-full">ปิด</button>
          </>
        ) : (
          <>
            {([["PIN เดิม", oldPin, setOldPin, "current-password"], ["PIN ใหม่ (อย่างน้อย 4 ตัว)", newPin, setNewPin, "new-password"],
              ["ยืนยัน PIN ใหม่", confirmPin, setConfirmPin, "new-password"]] as const).map(([label, v, set, ac]) => (
              <label key={label} className="mb-3 block">
                <span className="mb-1 block text-xs text-base-content/55">{label}</span>
                <input type="password" inputMode="numeric" autoComplete={ac} value={v} onChange={(e) => set(e.target.value)}
                  className="input input-bordered input-sm w-full bg-base-200/60 tracking-widest" />
              </label>
            ))}
            {mismatch && <p className="text-xs text-error">PIN ใหม่ทั้งสองช่องไม่ตรงกัน</p>}
            {error && <p className="text-xs text-error">{error}</p>}
            <button type="submit" disabled={saving || !oldPin || newPin.length < 4 || newPin !== confirmPin}
              className="btn btn-primary btn-sm mt-3 w-full gap-1.5">
              {saving && <Loader2 size={14} className="animate-spin" />} บันทึก PIN ใหม่
            </button>
          </>
        )}
      </form>
    </div>
  );
}
