import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  /** Signed change; ``goodWhen`` decides whether up is good. */
  delta?: number | null;
  deltaLabel?: string;
  deltaUnit?: string;
  goodWhen?: "up" | "down";
  accent?: string;
  footnote?: ReactNode;
}

export function KpiCard({ label, value, icon, delta, deltaLabel, deltaUnit = "%", goodWhen = "up", accent = "#38bdf8", footnote }: KpiCardProps) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  const direction = !hasDelta || delta === 0 ? "flat" : delta! > 0 ? "up" : "down";
  const good = direction === "flat" ? null : direction === goodWhen;
  const Arrow = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  return (
    <div className="panel group relative overflow-hidden p-4 transition-colors hover:border-line-strong">
      <div className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full opacity-[0.08] blur-2xl" style={{ background: accent }} />
      <div className="flex min-h-7 items-start justify-between gap-2">
        <p className="text-xs leading-snug font-medium text-ink-2">{label}</p>
        <span className="flex size-7 items-center justify-center rounded-lg border border-line bg-surface-2" style={{ color: accent }} aria-hidden>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-[28px] leading-none font-semibold tracking-tight text-ink">{value}</p>
      <div className="mt-2.5 flex min-h-5 items-center gap-1.5 text-xs">
        {hasDelta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular",
              good === true && "bg-good/12 text-good-ink",
              good === false && "bg-critical/12 text-critical-ink",
              good === null && "bg-surface-3 text-ink-2",
            )}
          >
            <Arrow className="size-3" aria-hidden />
            {`${delta! > 0 ? "+" : ""}${deltaUnit === "%" ? delta!.toFixed(0) : delta!.toFixed(1)}${deltaUnit}`}
          </span>
        )}
        {deltaLabel && <span className="text-ink-3">{deltaLabel}</span>}
        {footnote && !deltaLabel && <span className="text-ink-3">{footnote}</span>}
      </div>
    </div>
  );
}
