# KPI Dashboard — POCT Center

แดชบอร์ดสถิติการใช้งานเครื่อง POCT (Glucose, Blood gas) รายหอผู้ป่วย และตัวชี้วัดคุณภาพ
ศูนย์การทดสอบ ณ จุดดูแลผู้ป่วย รพ.ศรีนครินทร์ — หน่วยย่อยของหน่วยเจาะเลือดเก็บสิ่งส่งตรวจและ POCT
(คู่กับ [kpi-dashboard](https://github.com/tm-tmn/kpi-dashboard) ของหน่วยเจาะเลือด)

- **จำนวนการใช้งาน** — ยอดรายเดือน/รายปีงบ เทียบปีก่อน, หอที่ใช้มากที่สุด, ตารางหอ × เดือน,
  รายละเอียดรายหอพร้อมประวัติ SN เครื่อง (Glucose ปีงบ 2566–2569, Blood gas ปีงบ 2569)
- **แนวโน้ม & พยากรณ์** — แนวโน้มรายเดือนทั้งหมดของ Glucose และ Blood gas พร้อมพยากรณ์ 12 เดือน (ตามฤดูกาล,
  ทดสอบย้อนหลังคลาดเคลื่อน ~3%/เดือน) และแนวโน้มรายหอของ Blood gas
- **ตัวชี้วัดคุณภาพ** — 5 ตัวชี้วัด (10 รายการย่อย) พร้อมสถานะผ่าน/ไม่ผ่านเกณฑ์และแนวโน้มทั้งปี
- **🔑 หน้าผู้ดูแล** — ด้วย Staff ID + PIN (บันทึกลง Google Sheet ผ่าน Apps Script): กรอกจำนวนการใช้งาน/ตัวชี้วัดรายเดือน,
  ตารางข้อมูล + ส่งออก Excel, monitor เครื่องตาม SN, ตั้งค่าหอผู้ป่วย/เครื่อง/ตัวชี้วัด (เพิ่ม แก้ไข ปิดใช้งาน)
- **ตัวกรองช่วงเวลา** — ปีงบประมาณ/เดือน หรือกำหนดช่วงเดือนเอง (ข้ามปีงบได้)
- เตือนเดือนที่ยอดใช้ต่ำผิดปกติ · แยก/รวมเครื่องในหอเดียวกัน · เดือนที่กรอกยังไม่ครบไม่ถูกนับ

**Stack:** Next.js 16 (static export) · Tailwind 4 + daisyUI · Recharts · Google Sheets + Apps Script (หลังบ้าน)
**Hosting:** Vercel (ดู [SETUP.md](SETUP.md))

## โครงสร้าง

```
app/page.tsx              หน้าแดชบอร์ด
components/               UsageSection, KpiSection + การ์ด/ธีมจาก kpi-dashboard
lib/data.ts               อ่าน Google Sheet (หรือ snapshot) → ข้อมูลแต่ละแท็บ
lib/aggregate.ts          สรุปยอด / คำนวณตัวชี้วัด / เกณฑ์ผ่าน
lib/range.ts, lib/fleet.ts  ช่วงเดือนกำหนดเอง / ประวัติและสถานะเครื่อง (SN)
lib/forecast.ts           พยากรณ์รายเดือน (+ backtest)
lib/backend.ts            เรียกหลังบ้าน (login / บันทึก)
app/entry/                หน้าผู้ดูแล (ปุ่ม 🔑)
apps-script/Code.gs       หลังบ้าน: วางใน Google Sheet → ส่วนขยาย → Apps Script
apps-script/dev-server.mjs  หลังบ้านจำลองสำหรับพัฒนา/ทดสอบ (รัน Code.gs ตัวจริงใน Node)
lib/snapshot.json         ข้อมูลสำรองที่ฝังในเว็บ (สร้างจาก data/*.xlsx)
data/POCT_KPI_Database.xlsx  ไฟล์ต้นแบบ Google Sheet (ต้นแบบ — แท็บ "เครื่อง POCT (ประวัติ)" ระบบสร้างให้เอง)
```
