/**
 * KPI Dashboard — POCT Center : หลังบ้าน (Google Apps Script)
 * ---------------------------------------------------------------------------
 * วางไฟล์นี้ใน Google Sheet ฐานข้อมูล: ส่วนขยาย → Apps Script (ดู SETUP.md ข้อ 3)
 *
 * ทำไมต้องมีไฟล์นี้: เว็บเป็นเว็บ static บน Vercel ไม่มี server ฝั่งเรา ถ้าเก็บรหัสผ่านหรือ
 * key ไว้ในหน้าเว็บ ใครก็เปิดดูได้ Apps Script ตัวนี้จึงทำหน้าที่เป็น "หลังบ้าน" แทน:
 *   - ผู้ใช้แต่ละคนมี Staff ID + PIN ของตัวเอง เก็บในแท็บ "ผู้ใช้งาน" เป็น hash
 *     (salt รายคน + pepper ลับใน Script Properties) ไม่มี PIN ตัวจริงอยู่ที่ไหนเลย
 *   - เพิ่มผู้ใช้ / ตั้ง PIN ใหม่ ทำจากเมนู "🔑 POCT หลังบ้าน" ในตัว Google Sheet
 *     (เฉพาะคนที่แก้ไขชีตได้) — ผู้ใช้ทุกคนมีสิทธิ์เท่ากัน
 *   - login ถูก → ได้ token ที่มีลายเซ็นและหมดอายุใน 8 ชั่วโมง
 *   - บันทึกข้อมูลทุกครั้งต้องแนบ token และถูกตรวจความถูกต้องก่อนเขียนชีต
 *   - PIN ผิด 5 ครั้งติด (ต่อ Staff ID) ล็อก 15 นาที
 *   - ทุกการบันทึกเขียนประวัติลงแท็บ "บันทึกการแก้ไข" พร้อม Staff ID ผู้บันทึก
 *
 * Web app รับคำขอ
 *   GET  ?action=read                     → ข้อมูลทุกแท็บ ยกเว้น "ผู้ใช้งาน" (ให้หน้า dashboard อ่าน)
 *   POST {action:"login", staffId, pin}   → {token, expiresAt, staffId, name}
 *   POST {action:"changePin", token, oldPin, newPin}
 *   POST {action:"saveUsage", token, ...} → บันทึกจำนวนการใช้งาน 1 เดือน × 1 ประเภทการตรวจ
 *   POST {action:"saveKpi",   token, ...} → บันทึกตัวชี้วัด 1 เดือน
 *   POST {action:"saveConfig", token, table:"wards"|"kpiConfig"|"devices", rows, renames?}
 *                                         → แก้รายการหอผู้ป่วย / ตัวชี้วัดคุณภาพ (เพิ่ม ลบ แก้ไข เรียงลำดับ)
 */

var TAB = {
  usage: "ข้อมูลการใช้งาน",
  wards: "หอผู้ป่วย",
  devices: "เครื่อง Glucose", // เดิม (อ่านอย่างเดียว) — ใช้เมื่อแท็บประวัติด้านล่างยังว่าง
  fleet: "เครื่อง POCT (ประวัติ)",
  kpi: "ตัวชี้วัด",
  kpiConfig: "ตัวชี้วัดคุณภาพ (ตั้งค่า)",
  users: "ผู้ใช้งาน",
  log: "บันทึกการแก้ไข",
};
// แท็บ "ผู้ใช้งาน": staff_id | ชื่อ-สกุล | pin_hash | salt | ใช้งาน | ตั้ง PIN เมื่อ | เข้าใช้ล่าสุด
var USER_HEADER = ["staff_id", "ชื่อ-สกุล", "pin_hash", "salt", "ใช้งาน", "ตั้ง PIN เมื่อ", "เข้าใช้ล่าสุด"];
var MIN_PIN_LENGTH = 4;
var HASH_ROUNDS = 500; // each round is a call into Utilities; keep login well under a few seconds. Changing it invalidates existing PINs.
var MONTH_NAMES_TH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
var TESTS = ["Glucose", "Blood gas"];
// Which "รายการย่อย" suffixes each indicator kind accepts.
var KIND_FIELDS = {
  direct_percent: ["pct"],
  ratio_pair: ["num", "den"],
  ratio_auto: ["num"],
  count: ["count", "den"],
};
var TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
var MAX_FAILED_LOGINS = 5;
var LOCKOUT_SECONDS = 15 * 60;

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "read";
    if (action !== "read") return json_({ ok: false, error: "ไม่รู้จักคำสั่ง " + action });
    return json_({ ok: true, tabs: readAllTabs_() });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    switch (body.action) {
      case "login":
        return json_(login_(body.staffId, body.pin));
      case "changePin":
        return json_(changePin_(requireToken_(body.token), body.oldPin, body.newPin));
      case "saveUsage":
        return json_(saveUsage_(body, requireToken_(body.token)));
      case "saveKpi":
        return json_(saveKpi_(body, requireToken_(body.token)));
      case "saveConfig":
        return json_(saveConfig_(body, requireToken_(body.token)));
      case "ping":
        return json_({ ok: true, staffId: requireToken_(body.token) });
      default:
        return json_({ ok: false, error: "ไม่รู้จักคำสั่ง" });
    }
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    return json_({ ok: false, error: msg, auth: msg.indexOf("AUTH:") === 0 });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function props_() {
  return PropertiesService.getScriptProperties();
}

/** Random per-sheet signing secret, created on first use. Changing it (or
 * deleting it in Script Properties) signs everyone out. */
function tokenSecret_() {
  var p = props_();
  var s = p.getProperty("TOKEN_SECRET");
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    p.setProperty("TOKEN_SECRET", s);
  }
  return s;
}

function sign_(payload) {
  var raw = Utilities.computeHmacSha256Signature(payload, tokenSecret_());
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, "");
}

function safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function pepper_() {
  var p = props_();
  var s = p.getProperty("PIN_PEPPER");
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    p.setProperty("PIN_PEPPER", s);
  }
  return s;
}

/** Salted, peppered, iterated HMAC-SHA256. A 4-6 digit PIN is guessable if
 * someone copies the users tab, so the pepper (kept only in Script
 * Properties, never in the sheet) is what actually protects it. */
function hashPin_(pin, salt) {
  var key = pepper_();
  var h = salt + ":" + pin;
  for (var i = 0; i < HASH_ROUNDS; i++) {
    h = Utilities.base64Encode(Utilities.computeHmacSha256Signature(h, key));
  }
  return h;
}

function normalizeId_(id) {
  return String(id || "").trim().toUpperCase();
}

function checkPinFormat_(pin) {
  pin = String(pin || "");
  if (pin.length < MIN_PIN_LENGTH) throw new Error("PIN ต้องมีอย่างน้อย " + MIN_PIN_LENGTH + " ตัว");
  if (/^(\d)\1+$/.test(pin) || pin === "1234" || pin === "123456") throw new Error("PIN นี้เดาง่ายเกินไป");
  return pin;
}

function usersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TAB.users);
  if (!sh) {
    sh = ss.insertSheet(TAB.users);
    sh.appendRow(USER_HEADER);
  }
  return sh;
}

/** {row (1-based), id, name, hash, salt, active} for every user row. */
function readUsers_() {
  var sh = usersSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 5).getValues()
    .map(function (r, i) {
      var active = String(r[4]).toUpperCase();
      return {
        row: i + 2, id: normalizeId_(r[0]), name: String(r[1] || "").trim(),
        hash: String(r[2] || ""), salt: String(r[3] || ""),
        active: active === "" || active === "TRUE" || r[4] === true,
      };
    })
    .filter(function (u) { return u.id; });
}

function login_(staffId, pin) {
  var id = normalizeId_(staffId);
  if (!id || !pin) return { ok: false, error: "กรอก Staff ID และ PIN" };
  var users = readUsers_();
  if (users.length === 0) {
    return { ok: false, error: "ยังไม่มีผู้ใช้งาน — เพิ่มจากเมนู 🔑 POCT หลังบ้าน ใน Google Sheet ก่อน" };
  }
  var cache = CacheService.getScriptCache();
  var failKey = "fail_" + id;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILED_LOGINS) return { ok: false, error: "กรอก PIN ผิดหลายครั้งเกินไป ระบบล็อก Staff ID นี้ไว้ 15 นาที" };

  var user = users.filter(function (u) { return u.id === id; })[0];
  // Hash even for an unknown ID so response time doesn't reveal which IDs exist.
  var ok = user && user.active && user.hash && safeEqual_(hashPin_(String(pin), user.salt), user.hash);
  if (!user) hashPin_(String(pin), "x");
  if (!ok) {
    cache.put(failKey, String(fails + 1), LOCKOUT_SECONDS);
    Utilities.sleep(600);
    var left = MAX_FAILED_LOGINS - fails - 1;
    var why = user && !user.active ? "Staff ID นี้ถูกปิดการใช้งาน" : "Staff ID หรือ PIN ไม่ถูกต้อง";
    return { ok: false, error: why + (left > 0 ? " (เหลืออีก " + left + " ครั้ง)" : " — ล็อกไว้ 15 นาที") };
  }
  cache.remove(failKey);
  try { usersSheet_().getRange(user.row, 7, 1, 1).setValues([[new Date()]]); } catch (e) {}
  var expiresAt = Date.now() + TOKEN_TTL_MS;
  var payload = Utilities.base64EncodeWebSafe(id + "|" + expiresAt).replace(/=+$/, "");
  appendLog_(id, "login", "", "", "เข้าสู่ระบบ");
  return { ok: true, token: payload + "." + sign_(payload), expiresAt: expiresAt, staffId: id, name: user.name };
}

/** Returns the staff ID inside a valid token; throws "AUTH: ..." otherwise.
 * Also re-checks the user is still active, so disabling someone in the
 * users tab cuts them off immediately rather than after 8 hours. */
function requireToken_(token) {
  var parts = String(token || "").split(".");
  if (parts.length !== 2 || !safeEqual_(sign_(parts[0]), parts[1])) throw new Error("AUTH: กรุณาเข้าสู่ระบบใหม่");
  var pad = parts[0] + "===".slice((parts[0].length + 3) % 4);
  var decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(pad)).getDataAsString().split("|");
  var id = decoded[0], exp = Number(decoded[1]);
  if (!(exp > Date.now())) throw new Error("AUTH: หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่");
  var user = readUsers_().filter(function (u) { return u.id === id; })[0];
  if (!user || !user.active) throw new Error("AUTH: Staff ID นี้ไม่มีสิทธิ์แล้ว");
  return id;
}

function setPin_(user, pin) {
  var salt = Utilities.getUuid();
  usersSheet_().getRange(user.row, 3, 1, 2).setValues([[hashPin_(pin, salt), salt]]);
  usersSheet_().getRange(user.row, 6, 1, 1).setValues([[new Date()]]);
}

function changePin_(staffId, oldPin, newPin) {
  var user = readUsers_().filter(function (u) { return u.id === staffId; })[0];
  if (!user || !safeEqual_(hashPin_(String(oldPin || ""), user.salt), user.hash)) {
    return { ok: false, error: "PIN เดิมไม่ถูกต้อง" };
  }
  checkPinFormat_(newPin);
  setPin_(user, String(newPin));
  appendLog_(staffId, "changePin", "", "", "เปลี่ยน PIN");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sheet menu: add staff / reset PIN (run by whoever can edit the sheet)
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🔑 POCT หลังบ้าน")
    .addItem("เพิ่มผู้ใช้งาน / ตั้ง PIN ใหม่", "menuSetUser")
    .addItem("ทดสอบการเชื่อมต่อ", "testRead")
    .addToUi();
}

function menuSetUser() {
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt("เพิ่มผู้ใช้งาน / ตั้ง PIN ใหม่", "Staff ID (เช่น รหัสพนักงาน):", ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var id = normalizeId_(r1.getResponseText());
  if (!/^[A-Z0-9._-]{2,20}$/.test(id)) return ui.alert("Staff ID ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข . _ - (2-20 ตัว)");

  var users = readUsers_();
  var user = users.filter(function (u) { return u.id === id; })[0];
  var name = user ? user.name : "";
  if (!user) {
    var r2 = ui.prompt("ผู้ใช้ใหม่: " + id, "ชื่อ-สกุล:", ui.ButtonSet.OK_CANCEL);
    if (r2.getSelectedButton() !== ui.Button.OK) return;
    name = r2.getResponseText().trim();
  }
  var r3 = ui.prompt((user ? "ตั้ง PIN ใหม่ให้ " : "ตั้ง PIN ให้ ") + id + (name ? " (" + name + ")" : ""),
    "PIN อย่างน้อย " + MIN_PIN_LENGTH + " ตัว (แนะนำตัวเลข 6 หลัก) — แจ้งเจ้าตัวแล้วให้เปลี่ยนเองในหน้าเว็บได้",
    ui.ButtonSet.OK_CANCEL);
  if (r3.getSelectedButton() !== ui.Button.OK) return;
  var pin = r3.getResponseText();
  try { checkPinFormat_(pin); } catch (e) { return ui.alert(e.message); }

  if (!user) {
    var sh = usersSheet_();
    sh.appendRow([id, name, "", "", true, "", ""]);
    user = readUsers_().filter(function (u) { return u.id === id; })[0];
  }
  setPin_(user, pin);
  CacheService.getScriptCache().remove("fail_" + id);
  appendLog_(Session.getActiveUser().getEmail() || "เจ้าของชีต", "setPin", "", "", "ตั้ง PIN ให้ " + id);
  ui.alert("บันทึกแล้ว ✓\n\nStaff ID: " + id + "\nเข้าสู่ระบบที่ปุ่มกุญแจ 🔑 มุมขวาบนของเว็บ\n\n(ปิดการใช้งาน: ใส่ FALSE ในคอลัมน์ \"ใช้งาน\")");
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบแท็บ "' + name + '" ใน Google Sheet');
  return sh;
}

/** Data rows (header dropped) as strings — same shape the site's CSV parser expects. */
function rows_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  return values
    .filter(function (r) { return r.some(function (v) { return v !== "" && v !== null; }); })
    .map(function (r) { return r.map(function (v) { return v === null ? "" : String(v); }); });
}

function readAllTabs_() {
  var out = {};
  [TAB.usage, TAB.wards, TAB.devices, TAB.kpi, TAB.kpiConfig].forEach(function (name) {
    out[name] = rows_(name);
  });
  // แท็บประวัติเครื่องสร้างตอนบันทึกครั้งแรก — ยังไม่มีก็ไม่เป็นไร
  out[TAB.fleet] = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.fleet) ? rows_(TAB.fleet) : [];
  return out;
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

function checkYearMonth_(year, month) {
  year = Number(year); month = Number(month);
  if (!(year >= 2500 && year <= 2700 && Math.floor(year) === year)) throw new Error("ปี (พ.ศ.) ไม่ถูกต้อง");
  if (!(month >= 1 && month <= 12 && Math.floor(month) === month)) throw new Error("เดือนไม่ถูกต้อง");
  return { year: year, month: month };
}

/** Replace one tab's data rows in a single write (fast, and atomic under the lock). */
function writeRows_(sh, width, oldCount, rows) {
  if (rows.length > 0) sh.getRange(2, 1, rows.length, width).setValues(rows);
  if (oldCount > rows.length) sh.getRange(2 + rows.length, 1, oldCount - rows.length, width).clearContent();
}

/**
 * body: {year, month, test, entries:[{ward, count|null}]}
 * count = null (หรือว่าง) → ลบแถวของหอนั้นในเดือนนั้น (= ไม่มีข้อมูล ไม่ใช่ 0)
 */
function saveUsage_(body, staffId) {
  var ym = checkYearMonth_(body.year, body.month);
  if (TESTS.indexOf(body.test) < 0) throw new Error("ประเภทการตรวจไม่ถูกต้อง");
  if (!Array.isArray(body.entries) || body.entries.length === 0) throw new Error("ไม่มีข้อมูลที่จะบันทึก");

  var knownWards = {};
  rows_(TAB.wards).forEach(function (r) { if (r[0] === body.test) knownWards[String(r[1]).trim()] = true; });

  var wanted = {};
  body.entries.forEach(function (en) {
    var ward = String(en.ward || "").trim();
    if (!knownWards[ward]) throw new Error('ไม่พบหอ "' + ward + '" ในแท็บหอผู้ป่วย (' + body.test + ")");
    var c = en.count;
    if (c === null || c === undefined || c === "") { wanted[ward] = null; return; }
    c = Number(c);
    if (!(c >= 0 && Math.floor(c) === c && c < 1000000)) throw new Error('จำนวนของ "' + ward + '" ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
    wanted[ward] = c;
  });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(TAB.usage);
    var last = sh.getLastRow();
    var old = last >= 2 ? sh.getRange(2, 1, last - 1, 6).getValues() : [];
    var next = [], seen = {}, added = 0, updated = 0, removed = 0;
    old.forEach(function (r) {
      var isThis = Number(r[0]) === ym.year && Number(r[1]) === ym.month && r[3] === body.test;
      var ward = String(r[4]).trim();
      if (!isThis || !(ward in wanted)) { next.push(r); return; }
      if (seen[ward]) { removed++; return; } // drop accidental duplicates
      seen[ward] = true;
      if (wanted[ward] === null) { removed++; return; }
      if (Number(r[5]) !== wanted[ward]) updated++;
      next.push([ym.year, ym.month, MONTH_NAMES_TH[ym.month - 1], body.test, ward, wanted[ward]]);
    });
    Object.keys(wanted).forEach(function (ward) {
      if (!seen[ward] && wanted[ward] !== null) {
        next.push([ym.year, ym.month, MONTH_NAMES_TH[ym.month - 1], body.test, ward, wanted[ward]]);
        added++;
      }
    });
    writeRows_(sh, 6, old.length, next);
    appendLog_(staffId, "saveUsage", ym.year + "-" + ym.month, body.test,
      "เพิ่ม " + added + " · แก้ " + updated + " · ลบ " + removed);
    return { ok: true, added: added, updated: updated, removed: removed };
  } finally {
    lock.releaseLock();
  }
}

function isND_(v) { return /^n\.?\/?d\.?$/i.test(String(v == null ? "" : v).trim()); }
/** ค่าในชีต: ND → "ND", ตัวเลข → number */
function cellValue_(v) { return isND_(v) ? "ND" : Number(v); }

/**
 * body: {year, month, entries:[{indicator, field, value|null}]}
 * field = "<indicator>_<pct|num|den|count>" ตามชนิดของตัวชี้วัด; value ว่าง = ยังไม่กรอก (ลบแถว);
 * value "ND" = ไม่ได้ดำเนินการเดือนนี้ — เก็บคำว่า ND ไว้ในชีต และไม่นำไปคิด %
 */
function saveKpi_(body, staffId) {
  var ym = checkYearMonth_(body.year, body.month);
  if (!Array.isArray(body.entries) || body.entries.length === 0) throw new Error("ไม่มีข้อมูลที่จะบันทึก");

  var kinds = {};
  rows_(TAB.kpiConfig).forEach(function (r) { if (r[0]) kinds[String(r[0]).trim()] = String(r[5]).trim(); });

  var wanted = {};
  body.entries.forEach(function (en) {
    var id = String(en.indicator || "").trim();
    var field = String(en.field || "").trim();
    var kind = kinds[id];
    if (!kind) throw new Error('ไม่พบตัวชี้วัด "' + id + '" ในแท็บตั้งค่า');
    var suffix = field.indexOf(id + "_") === 0 ? field.slice(id.length + 1) : "";
    if ((KIND_FIELDS[kind] || []).indexOf(suffix) < 0) throw new Error('ช่อง "' + field + '" ใช้กับตัวชี้วัดชนิด ' + kind + " ไม่ได้");
    var v = en.value;
    if (v === null || v === undefined || v === "") { wanted[id + "|" + field] = null; return; }
    if (isND_(v)) { wanted[id + "|" + field] = "ND"; return; }
    v = Number(v);
    if (!(isFinite(v) && v >= 0)) throw new Error('ค่าของ "' + field + '" ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
    if (suffix === "pct" && v > 100) throw new Error('ร้อยละของ "' + id + '" ต้องไม่เกิน 100');
    wanted[id + "|" + field] = v;
  });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(TAB.kpi);
    var last = sh.getLastRow();
    var old = last >= 2 ? sh.getRange(2, 1, last - 1, 6).getValues() : [];
    var next = [], seen = {}, added = 0, updated = 0, removed = 0;
    old.forEach(function (r) {
      var k = String(r[3]).trim() + "|" + String(r[4]).trim();
      var isThis = Number(r[0]) === ym.year && Number(r[1]) === ym.month;
      if (!isThis || !(k in wanted)) { next.push(r); return; }
      if (seen[k]) { removed++; return; }
      seen[k] = true;
      if (wanted[k] === null) { removed++; return; }
      if (cellValue_(r[5]) !== wanted[k]) updated++;
      next.push([ym.year, ym.month, MONTH_NAMES_TH[ym.month - 1], String(r[3]).trim(), String(r[4]).trim(), wanted[k]]);
    });
    Object.keys(wanted).forEach(function (k) {
      if (!seen[k] && wanted[k] !== null) {
        var p = k.split("|");
        next.push([ym.year, ym.month, MONTH_NAMES_TH[ym.month - 1], p[0], p[1], wanted[k]]);
        added++;
      }
    });
    writeRows_(sh, 6, old.length, next);
    appendLog_(staffId, "saveKpi", ym.year + "-" + ym.month, "", "เพิ่ม " + added + " · แก้ " + updated + " · ลบ " + removed);
    return { ok: true, added: added, updated: updated, removed: removed };
  } finally {
    lock.releaseLock();
  }
}


// ---------------------------------------------------------------------------
// Config tables (หอผู้ป่วย / ตัวชี้วัดคุณภาพ) — แก้จากหน้า Admin
// ---------------------------------------------------------------------------

/** ข้อความจากหน้าเว็บที่จะเขียนลงชีต: กัน formula injection (= + - @ นำหน้า), อักขระควบคุม และความยาวเกิน */
function cleanText_(v, label, max, required) {
  var t = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  if (required && !t) throw new Error(label + "ต้องไม่ว่าง");
  if (t.length > max) throw new Error(label + "ยาวเกิน " + max + " ตัวอักษร");
  if (/^[=+\-@]/.test(t)) throw new Error(label + "ห้ามขึ้นต้นด้วย = + - @");
  if (/[\u0000-\u001f]/.test(t)) throw new Error(label + "มีอักขระที่ไม่อนุญาต");
  return t;
}

var KPI_KINDS = ["direct_percent", "ratio_pair", "ratio_auto", "count"];
function boolCell_(v) { return v === false || String(v).toUpperCase() === "FALSE" || v === 0 || v === "0" ? "FALSE" : "TRUE"; }

/**
 * body: {table:"wards", rows:[[test, ward, order, active]], renames:[{test, from, to}]}
 *       {table:"kpiConfig", rows:[[id, กลุ่ม, ชื่อ, ชื่อย่อ, เกณฑ์, ชนิด, ช่อง1, ช่อง2, เป้า, ทิศทาง, ทศนิยม, ลำดับ, ใช้งาน]]}
 * rows คือรายการ "ทั้งหมด" หลังแก้ — เขียนทับแท็บในครั้งเดียว (ข้อมูลรายเดือนไม่ถูกลบ)
 * renames: เปลี่ยนชื่อหอ → แก้ชื่อในแท็บข้อมูลการใช้งานตามด้วย เพื่อไม่ให้ข้อมูลเก่าหลุด
 */
function saveConfig_(body, staffId) {
  if (!Array.isArray(body.rows)) throw new Error("ไม่มีข้อมูลที่จะบันทึก");
  var table = body.table, rows = [], seen = {};

  if (table === "wards") {
    body.rows.forEach(function (r, i) {
      var test = String(r[0] || "").trim();
      if (TESTS.indexOf(test) < 0) throw new Error("ประเภทการตรวจไม่ถูกต้อง: " + test);
      var ward = cleanText_(r[1], "ชื่อหอผู้ป่วย", 80, true);
      if (ward.indexOf("|") >= 0) throw new Error("ชื่อหอผู้ป่วยห้ามมีเครื่องหมาย |");
      var k = test + "|" + ward;
      if (seen[k]) throw new Error('มีหอ "' + ward + '" ซ้ำใน ' + test);
      seen[k] = true;
      rows.push([test, ward, i + 1, boolCell_(r[3])]);
    });
  } else if (table === "kpiConfig") {
    body.rows.forEach(function (r, i) {
      var id = String(r[0] || "").trim();
      if (!/^[A-Za-z0-9_]{2,40}$/.test(id)) throw new Error('รหัสตัวชี้วัด "' + id + '" ต้องเป็นอังกฤษ/ตัวเลข/_ ยาว 2-40 ตัว');
      if (seen[id]) throw new Error('รหัสตัวชี้วัด "' + id + '" ซ้ำ');
      seen[id] = true;
      var kind = String(r[5] || "").trim();
      if (KPI_KINDS.indexOf(kind) < 0) throw new Error('ชนิดของ "' + id + '" ไม่ถูกต้อง');
      var nm = cleanText_(r[2], 'ชื่อตัวชี้วัด "' + id + '"', 250, true);
      var grp = cleanText_(r[1] || id, "กลุ่ม", 60, false) || id;
      var sn = cleanText_(r[3] || nm, "ชื่อย่อ", 80, false) || nm;
      var cr = cleanText_(r[4], "คำอธิบายเกณฑ์", 250, false);
      var l1 = cleanText_(r[6], "ชื่อช่องที่ 1", 100, false), l2 = cleanText_(r[7], "ชื่อช่องที่ 2", 100, false);
      var target = r[8] === "" || r[8] == null ? "" : Number(r[8]);
      if (target !== "" && !isFinite(target)) throw new Error('ค่าเป้าหมายของ "' + id + '" ต้องเป็นตัวเลข');
      var dir = String(r[9] || "max").trim() === "min" ? "min" : "max";
      var dec = Number(r[10]); if (!(dec >= 0 && dec <= 4)) dec = 2;
      rows.push([id, grp, nm, sn, cr, kind, l1, l2, target, dir, dec, i + 1, boolCell_(r[12])]);
    });
  } else if (table === "devices") {
    // [test, sn, ward, fromYear, fromMonth, toYear, toMonth, note] — 1 แถว = เครื่องนี้อยู่หอนี้ช่วงนี้
    var known = {};
    rows_(TAB.wards).forEach(function (w) { known[String(w[0]).trim() + "|" + String(w[1]).trim()] = true; });
    var spans = {};
    body.rows.forEach(function (r) {
      var test = String(r[0] || "").trim();
      if (TESTS.indexOf(test) < 0) throw new Error("ประเภทการตรวจไม่ถูกต้อง: " + test);
      var sn = cleanText_(r[1], "SN", 40, true), ward = cleanText_(r[2], "ชื่อหอ", 80, true);
      if (!known[test + "|" + ward]) throw new Error('เครื่อง ' + sn + ': ไม่พบหอ "' + ward + '" ใน ' + test + " (เพิ่มหอก่อน)");
      var fy = Number(r[3]), fm = Number(r[4]);
      checkYearMonth_(fy, fm);
      var ty = r[5] === "" || r[5] == null ? null : Number(r[5]), tm = r[6] === "" || r[6] == null ? null : Number(r[6]);
      if ((ty === null) !== (tm === null)) throw new Error("เครื่อง " + sn + ": ระบุทั้งปีและเดือนสิ้นสุด หรือเว้นว่างทั้งคู่");
      if (ty !== null) checkYearMonth_(ty, tm);
      var a = fy * 12 + fm, b = ty === null ? 1e9 : ty * 12 + tm;
      if (b < a) throw new Error("เครื่อง " + sn + ": เดือนสิ้นสุดอยู่ก่อนเดือนเริ่มต้น");
      var key = test + "|" + sn;
      (spans[key] = spans[key] || []).forEach(function (o) {
        if (a <= o[1] && o[0] <= b) throw new Error("เครื่อง " + sn + ": ช่วงเวลาที่อยู่ในหอซ้อนทับกัน");
      });
      spans[key].push([a, b]);
      rows.push([test, sn, ward, fy, fm, ty === null ? "" : ty, tm === null ? "" : tm, cleanText_(r[7], "หมายเหตุ", 200, false)]);
    });
  } else {
    throw new Error("ไม่รู้จักตาราง: " + table);
  }
  if (rows.length === 0 && table !== "devices") throw new Error("ต้องมีอย่างน้อย 1 รายการ");
  if (rows.length > 300) throw new Error("รายการมากเกินไป");

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var name = table === "wards" ? TAB.wards : table === "devices" ? TAB.fleet : TAB.kpiConfig;
    var width = table === "wards" ? 4 : table === "devices" ? 8 : 13;
    var sh;
    if (table === "devices" && !SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name)) {
      sh = SpreadsheetApp.getActiveSpreadsheet().insertSheet(name);
      sh.appendRow(["ประเภทการตรวจ", "SN", "หอผู้ป่วย", "เริ่ม ปี (พ.ศ.)", "เริ่ม เดือน", "ถึง ปี (พ.ศ.)", "ถึง เดือน", "หมายเหตุ"]);
    } else {
      sh = sheet_(name);
    }
    var oldCount = Math.max(sh.getLastRow() - 1, 0);

    var renamed = 0;
    if (table === "wards" && Array.isArray(body.renames) && body.renames.length) {
      var map = {};
      body.renames.forEach(function (x) {
        var t = String(x.test || ""), a = String(x.from || "").trim(), b = String(x.to || "").trim();
        if (a && b && a !== b && seen[t + "|" + b]) map[t + "|" + a] = b;
      });
      var us = sheet_(TAB.usage), ulast = us.getLastRow();
      if (ulast >= 2 && Object.keys(map).length) {
        var rng = us.getRange(2, 4, ulast - 1, 2), vals = rng.getValues();
        vals.forEach(function (v) {
          var to = map[String(v[0]).trim() + "|" + String(v[1]).trim()];
          if (to) { v[1] = to; renamed++; }
        });
        rng.setValues(vals);
      }
    }
    writeRows_(sh, width, oldCount, rows);
    appendLog_(staffId, "saveConfig", "", table, rows.length + " รายการ" + (renamed ? " · แก้ชื่อในข้อมูลเก่า " + renamed + " แถว" : ""));
    return { ok: true, count: rows.length, renamed: renamed };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

function appendLog_(who, action, period, test, detail) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(TAB.log);
    if (!sh) {
      sh = ss.insertSheet(TAB.log);
      sh.appendRow(["เวลา", "Staff ID", "การกระทำ", "เดือน", "ประเภทการตรวจ", "รายละเอียด"]);
    }
    sh.appendRow([new Date(), who, action, period, test, detail]);
  } catch (e) {
    // logging must never block a save
  }
}

/** เรียกครั้งเดียวจากเมนู Run เพื่อทดสอบว่าอ่านทุกแท็บได้ (ดูผลใน Execution log) */
function testRead() {
  var tabs = readAllTabs_();
  Object.keys(tabs).forEach(function (k) { Logger.log(k + ": " + tabs[k].length + " แถว"); });
  Logger.log("ผู้ใช้งาน: " + readUsers_().length + " คน");
}
