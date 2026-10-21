"use client";

import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type BannerType = "success" | "warning" | "error" | "info";

const STYLES: Record<BannerType, { icon: LucideIcon; classes: string }> = {
  success: { icon: CheckCircle2, classes: "bg-success/12 text-success border-success/20" },
  warning: { icon: AlertTriangle, classes: "bg-warning/12 text-warning border-warning/20" },
  error: { icon: XCircle, classes: "bg-error/12 text-error border-error/20" },
  info: { icon: Info, classes: "bg-info/12 text-info border-info/20" },
};

/** A "fire card" status banner — success / warning / error / info, each with
 * its own reserved color + icon (never color alone). Used for save results,
 * missing-data notices, and auto-surfaced alerts (e.g. a failed KPI). */
export function StatusBanner({
  type,
  title,
  message,
  onDismiss,
  className = "",
}: {
  type: BannerType;
  title?: string;
  message: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const { icon: Icon, classes } = STYLES[type];
  return (
    <div
      role={type === "error" || type === "warning" ? "alert" : "status"}
      className={`banner-enter flex items-start gap-3 rounded-box border px-4 py-3 text-sm ${classes} ${className}`}
    >
      <Icon size={18} className="mt-0.5 shrink-0" strokeWidth={2.2} />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        <div className={title ? "mt-0.5 text-[13px] opacity-90" : ""}>{message}</div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="ปิด"
          className="shrink-0 rounded-field p-1 text-current/60 transition-colors hover:bg-current/10"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
