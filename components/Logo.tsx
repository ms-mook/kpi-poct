import { LOGO_HREF, LOGO_MARK_HREF } from "@/lib/paths";

// The logo has dark-navy lettering and a blue ring, so it is always shown on a
// light plate — it stays readable on every theme, dark ones included.

/** Round emblem (drop + hand) for headers. */
export function LogoMark({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`icon-badge flex shrink-0 items-center justify-center rounded-field bg-white p-[3px] shadow-sm ring-1 ring-black/5 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_MARK_HREF} alt="โลโก้ POCT Center" width={size} height={size} className="h-full w-full object-contain" />
    </span>
  );
}

/** Full logo with the "POCT CENTER · MDKKU" lettering, for the login page. */
export function LogoFull({ width = 150, className = "" }: { width?: number; className?: string }) {
  return (
    <span className={`inline-flex rounded-box bg-white p-4 shadow-sm ring-1 ring-black/5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_HREF} alt="โลโก้ POCT Center MDKKU" width={width} height={Math.round((width * 640) / 459)} className="h-auto" style={{ width }} />
    </span>
  );
}
