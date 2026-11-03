/** Shared page footer: developer credit + copyright (Buddhist-era year). */
export function SiteFooter() {
  const be = new Date().getFullYear() + 543;
  return (
    <footer className="mt-10 border-t border-base-content/8 pt-5 pb-4 text-center print:hidden">
      <p className="text-[11px] text-base-content/55">พัฒนาโดย ทนพญ. มุกดารัตน์ สุพัฒน์ · งานห้องปฏิบัติการเวชศาสตร์ชันสูตร โรงพยาบาลศรีนครินทร์</p>
      <p className="mt-1 text-[10px] text-base-content/30">© {be} POCT Center · สงวนลิขสิทธิ์</p>
    </footer>
  );
}
