"""Regenerate lib/snapshot.json from data/POCT_KPI_Database.xlsx.

The snapshot is what the site shows when no Google Sheet ID is configured
(or the sheet can't be reached). Each tab is stored exactly as its rows
appear in the sheet (header row dropped), so the same column mapping in
lib/data.ts parses both the live CSV and this file.

Usage:  python3 scripts/make-snapshot.py
"""
import json, pathlib, openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
TABS = ["ข้อมูลการใช้งาน", "หอผู้ป่วย", "เครื่อง Glucose", "ตัวชี้วัด", "ตัวชี้วัดคุณภาพ (ตั้งค่า)"]

wb = openpyxl.load_workbook(ROOT / "data" / "POCT_KPI_Database.xlsx", data_only=True)
out = {}
for name in TABS:
    rows = []
    for r in wb[name].iter_rows(min_row=2, values_only=True):
        if all(v is None or v == "" for v in r):
            continue
        rows.append(["" if v is None else str(v) for v in r])
    out[name] = rows
(ROOT / "lib" / "snapshot.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
print({k: len(v) for k, v in out.items()})
