// Runs apps-script/Code.gs against the in-memory fakes in dev-server.mjs.
// npm run test:backend
const { call, sheets, DEV_USER } = await import("./dev-server.mjs");
let pass = 0, fail = 0;
const t = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${name} ${cond ? "" : extra}`); };
const usage = () => sheets.get("ข้อมูลการใช้งาน").data;

const read = call("GET", { query: { action: "read" } });
t("read ok", read.ok);
t("read excludes users tab", !("ผู้ใช้งาน" in read.tabs));
t("read usage rows = 3349", read.tabs["ข้อมูลการใช้งาน"].length === 3349, read.tabs["ข้อมูลการใช้งาน"].length);

const u = sheets.get("ผู้ใช้งาน").data[1];
t("PIN stored hashed, not plain", u[2] && u[2] !== DEV_USER.pin && !String(u[2]).includes(DEV_USER.pin) && u[3]);

t("wrong PIN rejected", call("POST", { body: { action: "login", staffId: "DEV", pin: "000000" } }).ok === false);
t("unknown ID rejected", call("POST", { body: { action: "login", staffId: "NOPE", pin: "246810" } }).ok === false);
const login = call("POST", { body: { action: "login", staffId: "dev", pin: DEV_USER.pin } });
t("login ok (ID case-insensitive)", login.ok && login.staffId === "DEV", JSON.stringify(login));
const token = login.token;

t("save without token rejected", call("POST", { body: { action: "saveUsage", year: 2569, month: 10, test: "Glucose", entries: [{ ward: "หอผู้ป่วย 2ก", count: 1 }] } }).auth === true);
t("tampered token rejected", call("POST", { body: { action: "ping", token: token.slice(0, -2) + "xx" } }).auth === true);

const before = usage().filter(r => r[0] !== "").length;
let r = call("POST", { body: { action: "saveUsage", token, year: 2569, month: 10, test: "Glucose",
  entries: [{ ward: "หอผู้ป่วย 2ก", count: 152 }, { ward: "หอผู้ป่วย 2ข", count: 0 }, { ward: "หอผู้ป่วย 2ค", count: null }] } });
t("new month: 2 added", r.ok && r.added === 2 && r.updated === 0, JSON.stringify(r));
t("row count +2", usage().filter(r => r[0] !== "").length === before + 2);
const row = usage().find(x => x[0] === 2569 && x[1] === 10 && x[4] === "หอผู้ป่วย 2ก");
t("row shape correct", row && row[2] === "ตุลาคม" && row[3] === "Glucose" && row[5] === 152, JSON.stringify(row));

r = call("POST", { body: { action: "saveUsage", token, year: 2569, month: 10, test: "Glucose",
  entries: [{ ward: "หอผู้ป่วย 2ก", count: 160 }, { ward: "หอผู้ป่วย 2ข", count: null }] } });
t("resave: 1 updated, 1 removed", r.ok && r.updated === 1 && r.removed === 1, JSON.stringify(r));
t("row count back to +1", usage().filter(r => r[0] !== "").length === before + 1);

r = call("POST", { body: { action: "saveUsage", token, year: 2569, month: 9, test: "Glucose", entries: [{ ward: "หอผู้ป่วย 2ก", count: 345 }] } });
t("existing history untouched when value same", r.ok && r.updated === 0 && r.added === 0, JSON.stringify(r));

t("unknown ward rejected", call("POST", { body: { action: "saveUsage", token, year: 2569, month: 10, test: "Glucose", entries: [{ ward: "หอปลอม", count: 1 }] } }).ok === false);
t("negative rejected", call("POST", { body: { action: "saveUsage", token, year: 2569, month: 10, test: "Glucose", entries: [{ ward: "หอผู้ป่วย 2ก", count: -1 }] } }).ok === false);
t("bad month rejected", call("POST", { body: { action: "saveUsage", token, year: 2569, month: 13, test: "Glucose", entries: [{ ward: "หอผู้ป่วย 2ก", count: 1 }] } }).ok === false);
t("blood gas ward under glucose rejected", call("POST", { body: { action: "saveUsage", token, year: 2569, month: 10, test: "Glucose", entries: [{ ward: "RESUS", count: 1 }] } }).ok === false);

r = call("POST", { body: { action: "saveKpi", token, year: 2569, month: 10, entries: [
  { indicator: "iqc_level1", field: "iqc_level1_num", value: 64 }, { indicator: "iqc_level1", field: "iqc_level1_den", value: 67 },
  { indicator: "satisfaction_glucose", field: "satisfaction_glucose_pct", value: 81 },
  { indicator: "training_glucose", field: "training_glucose_den", value: 1250 }] } });
t("kpi save 4 added", r.ok && r.added === 4, JSON.stringify(r));
t("kpi wrong field for kind rejected", call("POST", { body: { action: "saveKpi", token, year: 2569, month: 10, entries: [{ indicator: "iqc_level1", field: "iqc_level1_pct", value: 90 }] } }).ok === false);
t("kpi pct > 100 rejected", call("POST", { body: { action: "saveKpi", token, year: 2569, month: 10, entries: [{ indicator: "eqa_bloodgas", field: "eqa_bloodgas_pct", value: 101 }] } }).ok === false);
r = call("POST", { body: { action: "saveKpi", token, year: 2569, month: 11, entries: [
  { indicator: "eqa_bloodgas", field: "eqa_bloodgas_pct", value: "ND" }, { indicator: "iqc_level2", field: "iqc_level2_num", value: "nd" }] } });
t("kpi ND saved (stored as ND, not a number)", r.ok && r.added === 2, JSON.stringify(r));
r = call("POST", { body: { action: "saveKpi", token, year: 2569, month: 11, entries: [{ indicator: "eqa_bloodgas", field: "eqa_bloodgas_pct", value: "N/D" }] } });
t("kpi ND again = no change", r.ok && r.added === 0 && r.updated === 0, JSON.stringify(r));
r = call("POST", { body: { action: "saveKpi", token, year: 2569, month: 11, entries: [{ indicator: "eqa_bloodgas", field: "eqa_bloodgas_pct", value: 99 }] } });
t("kpi ND → number counts as update", r.ok && r.updated === 1, JSON.stringify(r));
t("kpi garbage text still rejected", call("POST", { body: { action: "saveKpi", token, year: 2569, month: 11, entries: [{ indicator: "eqa_bloodgas", field: "eqa_bloodgas_pct", value: "abc" }] } }).ok === false);

t("change PIN wrong old rejected", call("POST", { body: { action: "changePin", token, oldPin: "111111", newPin: "135790" } }).ok === false);
t("change PIN weak rejected", call("POST", { body: { action: "changePin", token, oldPin: DEV_USER.pin, newPin: "1111" } }).ok === false);
t("change PIN ok", call("POST", { body: { action: "changePin", token, oldPin: DEV_USER.pin, newPin: "135790" } }).ok);
t("old PIN no longer works", call("POST", { body: { action: "login", staffId: "DEV", pin: DEV_USER.pin } }).ok === false);
t("new PIN works", call("POST", { body: { action: "login", staffId: "DEV", pin: "135790" } }).ok);

sheets.get("ผู้ใช้งาน").data[1][4] = false;
t("disabled user's existing token rejected", call("POST", { body: { action: "ping", token } }).auth === true);
sheets.get("ผู้ใช้งาน").data[1][4] = true;

for (let i = 0; i < 6; i++) call("POST", { body: { action: "login", staffId: "DEV", pin: "999999" } });
t("locked out after 5 fails, even with right PIN", call("POST", { body: { action: "login", staffId: "DEV", pin: "135790" } }).ok === false);


// ---- saveConfig (wards / KPI config) ----
const wardsNow = call("GET", { params: { action: "read" } }).tabs["หอผู้ป่วย"];
const wardRows = wardsNow.map(r => [r[0], r[1], r[2], r[3]]);
t("saveConfig without token rejected", call("POST", { body: { action: "saveConfig", table: "wards", rows: wardRows } }).auth === true);
r = call("POST", { body: { action: "saveConfig", token, table: "wards", rows: [...wardRows, ["Glucose", "หอผู้ป่วย ใหม่ 9ก", 99, true]] } });
t("add ward", r.ok && r.count === wardRows.length + 1, JSON.stringify(r));
t("duplicate ward rejected", call("POST", { body: { action: "saveConfig", token, table: "wards", rows: [...wardRows, wardRows[0]] } }).ok === false);
t("bad test rejected", call("POST", { body: { action: "saveConfig", token, table: "wards", rows: [["X", "a", 1, true]] } }).ok === false);
const wardBefore = call("GET", { params: { action: "read" } }).tabs["ข้อมูลการใช้งาน"].filter(x => x[4] === "หอผู้ป่วย 2ก").length;
const renamedRows = wardRows.map(x => x[1] === "หอผู้ป่วย 2ก" && x[0] === "Glucose" ? ["Glucose", "หอผู้ป่วย 2ก-ใหม่", x[2], x[3]] : x);
r = call("POST", { body: { action: "saveConfig", token, table: "wards", rows: renamedRows, renames: [{ test: "Glucose", from: "หอผู้ป่วย 2ก", to: "หอผู้ป่วย 2ก-ใหม่" }] } });
const after = call("GET", { params: { action: "read" } }).tabs["ข้อมูลการใช้งาน"];
t("rename ward migrates usage rows", r.ok && r.renamed === wardBefore && after.filter(x => x[4] === "หอผู้ป่วย 2ก-ใหม่").length === wardBefore && wardBefore > 0, JSON.stringify(r));
const kc = call("GET", { params: { action: "read" } }).tabs["ตัวชี้วัดคุณภาพ (ตั้งค่า)"];
t("kpiConfig bad id rejected", call("POST", { body: { action: "saveConfig", token, table: "kpiConfig", rows: [["ก ข", "g", "n", "n", "", "count", "", "", "", "max", 0, 1, true]] } }).ok === false);
t("kpiConfig bad kind rejected", call("POST", { body: { action: "saveConfig", token, table: "kpiConfig", rows: [["abc", "g", "n", "n", "", "zzz", "", "", "", "max", 0, 1, true]] } }).ok === false);
r = call("POST", { body: { action: "saveConfig", token, table: "kpiConfig", rows: [...kc, ["new_kpi", "newg", "ตัวชี้วัดใหม่", "ใหม่", "เกณฑ์", "direct_percent", "ร้อยละ", "", 80, "max", 1, 99, true]] } });
t("add kpi", r.ok && r.count === kc.length + 1, JSON.stringify(r));
t("formula-like ward name rejected", call("POST", { body: { action: "saveConfig", token, table: "wards", rows: [["Glucose", "=HYPERLINK(\"http://x\")", 1, true]] } }).ok === false);
t("ward name with | rejected", call("POST", { body: { action: "saveConfig", token, table: "wards", rows: [["Glucose", "a|b", 1, true]] } }).ok === false);
t("formula-like kpi text rejected", call("POST", { body: { action: "saveConfig", token, table: "kpiConfig", rows: [["abc", "g", "n", "n", "=1+1", "count", "", "", "", "max", 0, 1, true]] } }).ok === false);
r = call("POST", { body: { action: "saveKpi", token, year: 2569, month: 10, entries: [{ indicator: "new_kpi", field: "new_kpi_pct", value: 85 }] } });
t("new kpi accepts entries", r.ok && r.added === 1, JSON.stringify(r));

// ---- devices (SN history) ----
const W = "หอผู้ป่วย 2ข", W2 = "หอผู้ป่วย 3ก";
const dv = (rows) => call("POST", { body: { action: "saveConfig", token, table: "devices", rows } });
t("devices: first save creates tab", (r = dv([["Glucose", "UU1", W, 2566, 10, 2568, 3, ""], ["Glucose", "UU1", W2, 2568, 4, "", "", "ย้ายมาจาก 2ข"]])).ok && r.count === 2, JSON.stringify(r));
t("devices: read returns new tab", call("GET", { query: { action: "read" } }).tabs["เครื่อง POCT (ประวัติ)"].length === 2);
t("devices: overlapping stays rejected", dv([["Glucose", "UU1", W, 2566, 10, 2568, 6, ""], ["Glucose", "UU1", W2, 2568, 4, "", "", ""]]).ok === false);
t("devices: end before start rejected", dv([["Glucose", "UU1", W, 2568, 10, 2568, 3, ""]]).ok === false);
t("devices: half-open end rejected", dv([["Glucose", "UU1", W, 2568, 10, 2569, "", ""]]).ok === false);
t("devices: unknown ward rejected", dv([["Glucose", "UU1", "หอปลอม", 2568, 10, "", "", ""]]).ok === false);
t("devices: formula SN rejected", dv([["Glucose", "=1+1", W, 2568, 10, "", "", ""]]).ok === false);
t("devices: same SN in other test is independent", dv([["Glucose", "X1", W, 2568, 10, "", "", ""], ["Blood gas", "X1", "RESUS", 2568, 10, "", "", ""]]).ok);
t("devices: no token rejected", call("POST", { body: { action: "saveConfig", table: "devices", rows: [] } }).auth === true);

const log = sheets.get("บันทึกการแก้ไข").data;
t("audit log records staff ID", log.some(x => x[1] === "DEV" && x[2] === "saveUsage"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
