// Formatted Excel export of the two report tables. exceljs is loaded only when
// a button is pressed, so it never weighs on the dashboard's first load.

import type { Workbook, Worksheet, Fill, Borders } from "exceljs";
import { MONTH_NAMES_TH } from "./constants";
import { LOGO_MARK_SM_HREF } from "./paths";
import { kpiCellText, type KpiCell, type KpiRowData, type KpiTable, type UsageTable } from "./reportTables";

const FONT = "Tahoma";
const C = {
  navy: "FF0B2A4A", navySoft: "FFDCE6F2", zebra: "FFF4F8FC", line: "FFD5DEE8", grey: "FF6B7785",
  passBg: "FFD9F2E3", passFg: "FF136B3A", failBg: "FFFBDADA", failFg: "FFA11A1A", ndBg: "FFEDEFF2",
};

const solid = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const hair: Partial<Borders> = {
  top: { style: "thin", color: { argb: C.line } }, bottom: { style: "thin", color: { argb: C.line } },
  left: { style: "thin", color: { argb: C.line } }, right: { style: "thin", color: { argb: C.line } },
};

type ExcelModule = typeof import("exceljs");

async function newWorkbook(): Promise<{ wb: Workbook; logoId: number | null }> {
  const mod = (await import("exceljs")) as ExcelModule & { default?: ExcelModule };
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "KPI Dashboard — POCT Center";
  wb.created = new Date();
  let logoId: number | null = null;
  try {
    const res = await fetch(LOGO_MARK_SM_HREF);
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      logoId = wb.addImage({ base64: btoa(bin), extension: "png" });
    }
  } catch { /* the report is still complete without the logo */ }
  return { wb, logoId };
}

/** Title block (logo + three lines) and the shared page setup. Returns the
 * row number of the table header. */
function titleBlock(ws: Worksheet, wb: Workbook, logoId: number | null, title: string, lastCol: number, widths: number[]): number {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const now = new Date();
  const stamp = `${now.getDate()} ${MONTH_NAMES_TH[now.getMonth()]} ${now.getFullYear() + 543}`;
  const lines: [string, number, boolean, string][] = [
    ["KPI Dashboard — POCT Center", 16, true, C.navy],
    [title, 12, true, "FF1F2933"],
    [`หน่วยเจาะเลือดเก็บสิ่งส่งตรวจและ POCT · รพ.ศรีนครินทร์ · ข้อมูล ณ วันที่ ${stamp}`, 9.5, false, C.grey],
  ];
  lines.forEach(([text, size, bold, color], i) => {
    const row = ws.getRow(i + 1);
    row.height = i === 0 ? 24 : 18;
    const cell = row.getCell(1);
    cell.value = text;
    cell.font = { name: FONT, size, bold, color: { argb: color } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 6 };
  });
  ws.getRow(4).height = 6;
  if (logoId != null) ws.addImage(logoId, { tl: { col: 0.08, row: 0.08 }, ext: { width: 56, height: 56 } });

  ws.pageSetup = {
    paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    printTitlesRow: "5:5",
  };
  ws.headerFooter = { oddFooter: "&L&8KPI Dashboard — POCT Center&R&8หน้า &P / &N" };
  ws.properties.defaultRowHeight = 18;
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 5, showGridLines: false }];
  void wb; void lastCol;
  return 5;
}

function headerRow(ws: Worksheet, rowNo: number, labels: string[]) {
  const row = ws.getRow(rowNo);
  row.height = 30;
  labels.forEach((text, i) => {
    const cell = row.getCell(i + 1);
    cell.value = text;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = solid(C.navy);
    cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", wrapText: true, indent: i === 0 ? 1 : 0 };
    cell.border = hair;
  });
}

// ---------------------------------------------------------------------------
// Sheet 1 — usage
// ---------------------------------------------------------------------------

function addUsageSheet(wb: Workbook, logoId: number | null, t: UsageTable) {
  const ws = wb.addWorksheet(`ใช้งาน ${t.test}`);
  const nCols = 1 + 12 + 2;
  const head = titleBlock(ws, wb, logoId, `จำนวนการใช้งานเครื่อง POCT ${t.test} รายหอผู้ป่วย · ปีงบประมาณ ${t.fy}`, nCols,
    [30, ...Array(12).fill(9.5), 12, 12]);
  headerRow(ws, head, ["หอผู้ป่วย", ...t.months.map((m) => (m.partial ? `${m.label}*` : m.label)), "รวมปีงบ", "เฉลี่ย/เดือน"]);

  t.rows.forEach((r, i) => {
    const row = ws.getRow(head + 1 + i);
    row.height = 18;
    const zebra = i % 2 === 1 ? solid(C.zebra) : undefined;
    const name = row.getCell(1);
    name.value = r.ward;
    name.font = { name: FONT, size: 10 };
    name.alignment = { vertical: "middle", indent: 1 };
    name.border = hair;
    if (zebra) name.fill = zebra;
    r.values.forEach((v, k) => {
      const cell = row.getCell(2 + k);
      if (v == null) {
        cell.value = "–";
        cell.font = { name: FONT, size: 10, color: { argb: "FFB0B8C2" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else {
        cell.value = v;
        cell.numFmt = "#,##0";
        cell.font = { name: FONT, size: 10, italic: t.months[k].partial, color: { argb: t.months[k].partial ? C.grey : "FF1F2933" } };
        cell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
      }
      cell.border = hair;
      if (zebra && v == null) cell.fill = zebra;
    });
    const total = row.getCell(14), avg = row.getCell(15);
    total.value = r.total; total.numFmt = "#,##0";
    total.font = { name: FONT, size: 10, bold: true };
    avg.value = r.average == null ? "–" : Math.round(r.average); avg.numFmt = "#,##0";
    avg.font = { name: FONT, size: 10, color: { argb: C.grey } };
    for (const c of [total, avg]) {
      c.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
      c.border = hair;
      c.fill = solid(C.navySoft);
    }
  });

  const first = head + 1, last = head + t.rows.length;
  if (t.rows.length > 0) {
    // Light heat shading across the month block (same idea as the dashboard table).
    ws.addConditionalFormatting({
      ref: `B${first}:M${last}`,
      rules: [{ type: "colorScale", priority: 1, cfvo: [{ type: "min" }, { type: "max" }], color: [{ argb: "FFFFFFFF" }, { argb: "FF9CC3EA" }] }],
    });
    ws.autoFilter = { from: { row: head, column: 1 }, to: { row: last, column: nCols } };
  }

  const totalRow = ws.getRow(last + 1);
  totalRow.height = 22;
  const label = totalRow.getCell(1);
  label.value = "รวมทุกหอ";
  label.alignment = { vertical: "middle", indent: 1 };
  t.monthTotals.forEach((v, k) => {
    const c = totalRow.getCell(2 + k);
    if (v == null) { c.value = t.months[k].partial ? "ไม่ครบ" : "–"; c.alignment = { horizontal: "center", vertical: "middle" }; }
    else { c.value = v; c.numFmt = "#,##0"; c.alignment = { horizontal: "right", vertical: "middle", indent: 1 }; }
  });
  const done = t.monthTotals.filter((v) => v != null).length;
  totalRow.getCell(14).value = t.grandTotal;
  totalRow.getCell(14).numFmt = "#,##0";
  totalRow.getCell(15).value = done ? Math.round(t.grandTotal / done) : "–";
  totalRow.getCell(15).numFmt = "#,##0";
  for (let c = 1; c <= nCols; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: c === 1 ? C.navy : "FF1F2933" } };
    cell.fill = solid(C.navySoft);
    cell.border = { ...hair, top: { style: "medium", color: { argb: C.navy } } };
    if (c >= 14) cell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  }
  if (t.rows.length === 0) {
    ws.getRow(head + 1).getCell(1).value = "ยังไม่มีข้อมูลในปีงบนี้";
    ws.getRow(head + 1).getCell(1).font = { name: FONT, size: 10, italic: true, color: { argb: C.grey } };
  }

  const notes = [
    t.partialMonths.length
      ? `* ${t.partialMonths.map((m) => m.label).join(", ")} กรอกข้อมูลยังไม่ครบทุกหอ — แสดงตามที่กรอกแต่ไม่นับในยอดรวมและค่าเฉลี่ย`
      : null,
    "– = ไม่มีข้อมูล · ความเข้มของสีฟ้า = ปริมาณการใช้งานมาก",
  ].filter((n): n is string => n != null);
  notes.forEach((n, i) => {
    const c = ws.getRow(last + 3 + i).getCell(1);
    c.value = n;
    c.font = { name: FONT, size: 9, color: { argb: C.grey } };
  });
}

// ---------------------------------------------------------------------------
// Sheet 2 — quality indicators
// ---------------------------------------------------------------------------

function pctFormat(decimals: number) {
  return `0${decimals > 0 ? "." + "0".repeat(decimals) : ""}"%"`;
}

function paintKpiCell(cell: ReturnType<Worksheet["getCell"]>, row: KpiRowData, c: KpiCell, bold = false) {
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = hair;
  if (c.nd) {
    cell.value = "ND";
    cell.font = { name: FONT, size: 10, italic: true, bold, color: { argb: C.grey } };
    cell.fill = solid(C.ndBg);
    return;
  }
  if (c.value == null) {
    cell.value = "–";
    cell.font = { name: FONT, size: 10, color: { argb: "FFB0B8C2" } };
    return;
  }
  cell.value = c.value;
  cell.numFmt = row.asCount ? '#,##0 "คน"' : pctFormat(row.cfg.decimals);
  const fg = c.status === "pass" ? C.passFg : c.status === "fail" ? C.failFg : "FF1F2933";
  cell.font = { name: FONT, size: 10, bold, color: { argb: fg } };
  if (c.status) cell.fill = solid(c.status === "pass" ? C.passBg : C.failBg);
  if (c.detail) cell.note = c.detail;
}

function addKpiSheet(wb: Workbook, logoId: number | null, t: KpiTable) {
  const ws = wb.addWorksheet("ตัวชี้วัดคุณภาพ");
  const nCols = 2 + 12 + 3;
  const head = titleBlock(ws, wb, logoId, `ตัวชี้วัดคุณภาพศูนย์การทดสอบ ณ จุดดูแลผู้ป่วย · ปีงบประมาณ ${t.fy}`, nCols,
    [48, 26, ...Array(12).fill(10.5), 13, 12, 11]);
  headerRow(ws, head, ["ตัวชี้วัด", "เกณฑ์", ...t.months.map((m) => m.label), "ทั้งปีงบ", "เดือนที่ดำเนินการ", "ผลประเมิน"]);

  t.rows.forEach((r, i) => {
    const row = ws.getRow(head + 1 + i);
    row.height = 44;
    const a = row.getCell(1);
    a.value = { richText: [
      { text: `${r.title}\n`, font: { name: FONT, size: 10, bold: true } },
      { text: r.sub, font: { name: FONT, size: 9, color: { argb: C.grey } } },
    ] };
    a.alignment = { vertical: "middle", wrapText: true, indent: 1 };
    a.border = hair;
    const b = row.getCell(2);
    b.value = r.cfg.criteria;
    b.font = { name: FONT, size: 9, color: { argb: "FF1F2933" } };
    b.alignment = { vertical: "middle", wrapText: true };
    b.border = hair;
    if (i % 2 === 1) { a.fill = solid(C.zebra); b.fill = solid(C.zebra); }

    r.cells.forEach((c, k) => paintKpiCell(row.getCell(3 + k), r, c));
    paintKpiCell(row.getCell(15), r, r.summary, true);
    const months = r.cells.filter((c) => c.value != null).length;
    const m = row.getCell(16);
    m.value = months;
    m.font = { name: FONT, size: 10 };
    m.alignment = { horizontal: "center", vertical: "middle" };
    m.border = hair;
    const s = row.getCell(17);
    s.value = r.summary.status === "pass" ? "ผ่าน" : r.summary.status === "fail" ? "ไม่ผ่าน" : "–";
    s.font = { name: FONT, size: 10, bold: true, color: { argb: r.summary.status === "pass" ? C.passFg : r.summary.status === "fail" ? C.failFg : "FFB0B8C2" } };
    s.alignment = { horizontal: "center", vertical: "middle" };
    s.border = hair;
    if (r.summary.status) s.fill = solid(r.summary.status === "pass" ? C.passBg : C.failBg);
  });

  const last = head + t.rows.length;
  [
    "เขียว = ผ่านเกณฑ์ · แดง = ไม่ผ่านเกณฑ์ · ND = ไม่ได้ดำเนินการในเดือนนั้น (ไม่นำไปคิด %) · – = ยังไม่มีข้อมูล · วางเมาส์บนช่องเพื่อดูตัวตั้ง/ตัวหาร",
    "ทั้งปีงบ: ตัวชี้วัดแบบตัวตั้ง/ตัวหาร = รวมตัวตั้ง ÷ รวมตัวหารเฉพาะเดือนที่ดำเนินการ · ร้อยละรายเดือน = ค่าเฉลี่ยเฉพาะเดือนที่มีผล · จำนวนคน = ค่าล่าสุด",
  ].forEach((n, i) => {
    const c = ws.getRow(last + 2 + i).getCell(1);
    c.value = n;
    c.font = { name: FONT, size: 9, color: { argb: C.grey } };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function save(wb: Workbook, fileName: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportUsageExcel(t: UsageTable) {
  const { wb, logoId } = await newWorkbook();
  addUsageSheet(wb, logoId, t);
  await save(wb, `POCT-Usage-${t.test.replace(/\s+/g, "")}-FY${t.fy}.xlsx`);
}

export async function exportKpiExcel(t: KpiTable) {
  const { wb, logoId } = await newWorkbook();
  addKpiSheet(wb, logoId, t);
  await save(wb, `POCT-KPI-FY${t.fy}.xlsx`);
}

export async function exportBothExcel(usage: UsageTable, kpi: KpiTable) {
  const { wb, logoId } = await newWorkbook();
  addUsageSheet(wb, logoId, usage);
  addKpiSheet(wb, logoId, kpi);
  await save(wb, `POCT-Report-FY${usage.fy}.xlsx`);
}

export { kpiCellText };
