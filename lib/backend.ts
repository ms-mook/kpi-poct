// Client for the Apps Script "หลังบ้าน" (apps-script/Code.gs).
//
// Requests are sent as text/plain so the browser treats them as "simple"
// CORS requests (no preflight) — Apps Script web apps can't answer OPTIONS.

export const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? "";

export type Session = { token: string; expiresAt: number; staffId: string; name: string };

const SESSION_KEY = "kpi-poct-session";

/** Session lives in sessionStorage: closing the tab signs you out, and the
 * token itself expires server-side after 8 hours regardless. */
export function getSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s.token || !(s.expiresAt > Date.now())) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function setSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // storage blocked (private mode): the session just won't survive a reload
  }
  window.dispatchEvent(new Event("kpi-poct-session"));
}

export class AuthError extends Error {}

type Reply = { ok: boolean; error?: string; auth?: boolean; [k: string]: unknown };

async function post<T extends Reply>(body: Record<string, unknown>): Promise<T> {
  if (!APPS_SCRIPT_URL) throw new Error("ยังไม่ได้ตั้งค่า APPS_SCRIPT_URL (ดู SETUP.md ข้อ 3–5)");
  let res: Response;
  try {
    res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
    });
  } catch {
    throw new Error("เชื่อมต่อหลังบ้าน (Apps Script) ไม่ได้ — ตรวจอินเทอร์เน็ต หรือการ Deploy web app");
  }
  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    throw new Error("หลังบ้านตอบกลับผิดรูปแบบ — ตรวจว่า Deploy เป็น Web app และตั้ง Who has access = Anyone");
  }
  if (!data.ok) {
    if (data.auth) {
      setSession(null);
      throw new AuthError(data.error ?? "กรุณาเข้าสู่ระบบใหม่");
    }
    throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
  }
  return data;
}

export async function login(staffId: string, pin: string): Promise<Session> {
  const r = await post<Reply & Session>({ action: "login", staffId, pin });
  const s = { token: r.token, expiresAt: r.expiresAt, staffId: r.staffId, name: r.name };
  setSession(s);
  return s;
}

export function logout() {
  setSession(null);
}

function token(): string {
  const s = getSession();
  if (!s) throw new AuthError("กรุณาเข้าสู่ระบบใหม่");
  return s.token;
}

export type SaveResult = { added: number; updated: number; removed: number };

export async function saveUsage(input: {
  year: number; month: number; test: string; entries: { ward: string; count: number | null }[];
}): Promise<SaveResult> {
  return post<Reply & SaveResult>({ action: "saveUsage", token: token(), ...input });
}

export async function saveKpi(input: {
  year: number; month: number; entries: { indicator: string; field: string; value: number | "ND" | null }[];
}): Promise<SaveResult> {
  return post<Reply & SaveResult>({ action: "saveKpi", token: token(), ...input });
}

/** Replace a config table with the full edited list (see saveConfig_ in Code.gs). */
export async function saveConfig(input: {
  table: "wards" | "kpiConfig"; rows: (string | number | boolean | null)[][];
  renames?: { test: string; from: string; to: string }[];
}): Promise<{ count: number; renamed: number }> {
  return post<Reply & { count: number; renamed: number }>({ action: "saveConfig", token: token(), ...input });
}

export async function changePin(oldPin: string, newPin: string): Promise<void> {
  await post({ action: "changePin", token: token(), oldPin, newPin });
}
