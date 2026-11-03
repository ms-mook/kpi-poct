/** Shared page footer: unit / hospital, data note, copyright (Buddhist-era year). */
export function SiteFooter({ note }: { note?: string }) {
  const be = new Date().getFullYear() + 543;
  return (
    <footer className="mt-10 border-t border-base-content/8 pt-5 pb-4 text-center print:hidden">
      <p className="text-xs font-medium text-base-content/60">KPI Dashboard · POCT Center</p>
      <p className="mt-0.5 text-[11px] text-base-content/45">หน่วยเจาะเลือดเก็บสิ่งส่งตรวจและ POCT · โรงพยาบาลศรีนครินทร์ คณะแพทยศาสตร์ มหาวิทยาลัยขอนแก่น</p>
      <p className="mt-2 text-[11px] text-base-content/40">{note ?? "ข้อมูลจาก Google Sheet · ปีงบประมาณนับ ต.ค.–ก.ย."}</p>
      <p className="mt-2 text-[11px] text-base-content/55">พัฒนาโดย ทนพญ. มุกดารัตน์ สุพัฒน์ · งานห้องปฏิบัติการเวชศาสตร์ชันสูตร โรงพยาบาลศรีนครินทร์</p>
      <p className="mt-1 text-[10px] text-base-content/30">© {be} POCT Center · สงวนลิขสิทธิ์</p>
    </footer>
  );
}
