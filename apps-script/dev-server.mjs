// Local stand-in for the Apps Script web app, for development and testing.
//
// Runs the real apps-script/Code.gs inside Node with small in-memory fakes of
// SpreadsheetApp / PropertiesService / CacheService / LockService / Utilities
// / ContentService, seeded from lib/snapshot.json. Nothing touches Google.
//
//   node apps-script/dev-server.mjs            # http://localhost:8787  (Staff ID: DEV, PIN: 246810)
//   NEXT_PUBLIC_APPS_SCRIPT_URL=http://localhost:8787 npm run dev
//
// Data lives in memory only — restart the server to reset it.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const snapshot = JSON.parse(fs.readFileSync(path.join(here, "..", "lib", "snapshot.json"), "utf8"));

const HEADERS = {
  "ข้อมูลการใช้งาน": ["ปี (พ.ศ.)", "เดือน", "ชื่อเดือน", "ประเภทการตรวจ", "หอผู้ป่วย", "จำนวน"],
  "หอผู้ป่วย": ["ประเภทการตรวจ", "หอผู้ป่วย", "ลำดับ", "ใช้งาน"],
  "เครื่อง Glucose": ["หอผู้ป่วย", "SN", "ใช้ตั้งแต่ปีงบ", "ถึงปีงบ"],
  "เครื่อง POCT (ประวัติ)": ["ประเภทการตรวจ", "SN", "หอผู้ป่วย", "เริ่ม ปี (พ.ศ.)", "เริ่ม เดือน", "ถึง ปี (พ.ศ.)", "ถึง เดือน", "หมายเหตุ"],
  "ตัวชี้วัด": ["ปี (พ.ศ.)", "เดือน", "ชื่อเดือน", "ตัวชี้วัด", "รายการย่อย", "ค่า"],
  "ตัวชี้วัดคุณภาพ (ตั้งค่า)": ["id", "กลุ่ม", "ชื่อตัวชี้วัด", "ชื่อย่อ", "เกณฑ์", "ชนิด", "ช่องที่ 1", "ช่องที่ 2",
    "ค่าเป้าหมาย", "ทิศทางเป้าหมาย", "ทศนิยม", "ลำดับ", "ใช้งาน"],
};
// Sheets hand numbers back as numbers; mimic that so Number()/=== logic in
// Code.gs is exercised the same way it is on Google.
const typed = (v) => (v !== "" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);

class FakeSheet {
  constructor(name, rows) { this.name = name; this.data = rows.map((r) => [...r]); }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) if (this.data[i].some((v) => v !== "" && v != null)) return i + 1;
    return 0;
  }
  getLastColumn() { return Math.max(0, ...this.data.map((r) => r.length)); }
  getRange(row, col, nRows = 1, nCols = 1) {
    const sh = this;
    return {
      getValues: () => Array.from({ length: nRows }, (_, i) =>
        Array.from({ length: nCols }, (_, j) => sh.data[row - 1 + i]?.[col - 1 + j] ?? "")),
      setValues: (vals) => vals.forEach((r, i) => r.forEach((v, j) => {
        while (sh.data.length < row + i) sh.data.push([]);
        sh.data[row - 1 + i][col - 1 + j] = v;
      })),
      clearContent: () => { for (let i = 0; i < nRows; i++) for (let j = 0; j < nCols; j++) if (sh.data[row - 1 + i]) sh.data[row - 1 + i][col - 1 + j] = ""; },
    };
  }
  appendRow(r) { this.data.length = this.getLastRow(); this.data.push(r); }
}

const sheets = new Map(Object.entries(HEADERS).map(([name, header]) =>
  [name, new FakeSheet(name, [header, ...(snapshot[name] ?? []).map((r) => r.map(typed))])]));
const props = new Map();
const cache = new Map();

const ctx = {
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets.get(n) ?? null,
      insertSheet: (n) => { const s = new FakeSheet(n, []); sheets.set(n, s); return s; },
    }),
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    computeHmacSha256Signature: (value, key) => [...crypto.createHmac("sha256", key).update(value).digest()],
    base64Encode: (bytes) => Buffer.from(bytes).toString("base64"),
    base64EncodeWebSafe: (v) => Buffer.from(typeof v === "string" ? Buffer.from(v, "utf8") : v).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
    base64DecodeWebSafe: (s) => [...Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")],
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString("utf8") }),
    sleep: () => {},
  },
  ContentService: {
    MimeType: { JSON: "application/json" },
    createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
  },
  Logger: { log: (...a) => console.log(...a) },
  Session: { getActiveUser: () => ({ getEmail: () => "dev@localhost" }) },
  console,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(here, "Code.gs"), "utf8"), ctx, { filename: "Code.gs" });

// Seed one staff user through the real hashing code (same as the sheet menu does).
export const DEV_USER = { id: process.env.DEV_STAFF_ID ?? "DEV", pin: process.env.DEV_PIN ?? "246810" };
ctx.usersSheet_().appendRow([DEV_USER.id, "ผู้ทดสอบ", "", "", true, "", ""]);
ctx.setPin_(ctx.readUsers_()[0], DEV_USER.pin);

export function call(method, { query = {}, body } = {}) {
  const out = method === "GET"
    ? ctx.doGet({ parameter: query })
    : ctx.doPost({ postData: { contents: typeof body === "string" ? body : JSON.stringify(body ?? {}) } });
  return JSON.parse(out.text);
}
export { sheets };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  http.createServer((req, res) => {
    // Apps Script answers any origin; mirror that.
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Headers": "*" }); return res.end(); }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const result = req.method === "GET"
        ? call("GET", { query: Object.fromEntries(url.searchParams) })
        : call("POST", { body: raw });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
    });
  }).listen(PORT, () => console.log(`Fake Apps Script on http://localhost:${PORT}  (Staff ID: ${DEV_USER.id}, PIN: ${DEV_USER.pin})`));
}
