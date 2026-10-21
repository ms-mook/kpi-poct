"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";

const WEEKDAYS_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const MONTHS_TH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function formatThai(d: Date) {
  const weekday = WEEKDAYS_TH[d.getDay()];
  const day = d.getDate();
  const month = MONTHS_TH[d.getMonth()];
  const year = d.getFullYear() + 543;
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return { date: `วัน${weekday}ที่ ${day} ${month} ${year}`, time };
}

/** Live date/time, Asia/Bangkok wall-clock (the browser's own local time —
 * this app's users are all on-site). Ticks every second; purely client-side
 * so it never mismatches server-rendered markup. */
export function LiveClock({ className = "" }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Mount-time sync from an external clock, not state derived from props —
    // same pattern as the reset-on-switch effects in the entry forms.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    // Avoid an SSR/client text mismatch — render nothing until mounted.
    return <div className={`h-4 ${className}`} />;
  }

  const { date, time } = formatThai(now);
  return (
    <div className={`flex items-center gap-1.5 text-xs text-base-content/45 ${className}`}>
      <CalendarDays size={13} />
      <span>{date}</span>
      <span className="text-base-content/25">·</span>
      <span className="stat-figure-num">{time}</span>
    </div>
  );
}
