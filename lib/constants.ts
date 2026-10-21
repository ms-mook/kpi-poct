// Shared Thai month labels and fiscal-year helpers. Same conventions as
// kpi-dashboard: rows store the calendar Buddhist-era year (พ.ศ.) and month
// 1-12; the Thai fiscal year runs ต.ค.–ก.ย., so ต.ค.–ธ.ค. belong to the
// *next* fiscal year (ต.ค. 2568 → ปีงบ 2569).

export const MONTH_NAMES_TH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export const MONTH_ABBR_TH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export const TESTS = ["Glucose", "Blood gas"] as const;
export type TestType = (typeof TESTS)[number];

export const TEST_META: Record<TestType, { label: string; long: string }> = {
  Glucose: { label: "Glucose", long: "การตรวจระดับน้ำตาลในเลือด POCT Glucose" },
  "Blood gas": { label: "Blood gas", long: "การตรวจ Blood gas POCT" },
};

export function fiscalYearOf(year: number, month: number): number {
  return month >= 10 ? year + 1 : year;
}

/** The 12 (year, month) pairs of a fiscal year, in order ต.ค. → ก.ย. */
export function fiscalYearMonths(fy: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const month = ((9 + i) % 12) + 1;
    out.push({ year: month >= 10 ? fy - 1 : fy, month });
  }
  return out;
}

export function monthLabel(year: number, month: number, short = true): string {
  const yy = String(year).slice(-2);
  return short ? `${MONTH_ABBR_TH[month - 1]} ${yy}` : `${MONTH_NAMES_TH[month - 1]} ${year}`;
}
