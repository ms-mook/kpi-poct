"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { getSession, type Session } from "@/lib/backend";
import { ENTRY_HREF } from "@/lib/paths";

/** Top-right key: opens the data-entry back office (/entry). Shows the
 * signed-in Staff ID next to it while a session is active. */
export function KeyButton() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const sync = () => setSession(getSession());
    sync();
    window.addEventListener("kpi-poct-session", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("kpi-poct-session", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return (
    <a
      href={ENTRY_HREF}
      title={session ? `หลังบ้าน · ${session.name || session.staffId}` : "เข้าสู่ระบบหลังบ้าน (กรอกข้อมูล)"}
      aria-label="เข้าสู่ระบบหลังบ้าน"
      className={`icon-badge btn glass-panel border-0 hover:text-primary ${
        session ? "btn-sm h-10 gap-1.5 rounded-full px-3 text-primary" : "btn-circle btn-ghost text-base-content/60"
      }`}
    >
      <KeyRound size={18} strokeWidth={2.2} />
      {session && <span className="text-xs font-medium">{session.staffId}</span>}
    </a>
  );
}
