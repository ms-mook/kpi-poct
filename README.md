# KPI Dashboard — หน่วย POCT

แดชบอร์ดสถิติการใช้งานเครื่อง POCT (Glucose, Blood gas) รายหอผู้ป่วย และตัวชี้วัดคุณภาพ
ศูนย์การทดสอบ ณ จุดดูแลผู้ป่วย รพ.ศรีนครินทร์ — หน่วยย่อยของหน่วยเจาะเลือดเก็บสิ่งส่งตรวจและ POCT
(คู่กับ [kpi-dashboard](https://github.com/tm-tmn/kpi-dashboard) ของหน่วยเจาะเลือด)

- **จำนวนการใช้งาน** — ยอดรายเดือน/รายปีงบ เทียบปีก่อน, หอที่ใช้มากที่สุด, ตารางหอ × เดือน,
  รายละเอียดรายหอพร้อมประวัติ SN เครื่อง (Glucose ปีงบ 2566–2569, Blood gas ปีงบ 2569)
- **ตัวชี้วัดคุณภาพ** — 5 ตัวชี้วัด (10 รายการย่อย) พร้อมสถานะผ่าน/ไม่ผ่านเกณฑ์และแนวโน้มทั้งปี

**Stack:** Next.js 16 (static export) · Tailwind 4 + daisyUI · Recharts · Google Sheets (อ่านผ่าน CSV)
**Hosting:** GitHub Pages (ดู [SETUP.md](SETUP.md))

## โครงสร้าง

```
app/page.tsx              หน้าแดชบอร์ด
components/               UsageSection, KpiSection + การ์ด/ธีมจาก kpi-dashboard
lib/data.ts               อ่าน Google Sheet (หรือ snapshot) → ข้อมูลแต่ละแท็บ
lib/aggregate.ts          สรุปยอด / คำนวณตัวชี้วัด / เกณฑ์ผ่าน
lib/snapshot.json         ข้อมูลสำรองที่ฝังในเว็บ (สร้างจาก data/*.xlsx)
data/POCT_KPI_Database.xlsx  ไฟล์ต้นแบบ Google Sheet (6 แท็บ)
.github/workflows/        build + deploy GitHub Pages อัตโนมัติ
```
