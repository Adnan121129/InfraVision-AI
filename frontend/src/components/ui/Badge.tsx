import { Beaker, Cpu } from "lucide-react";
import type { ReactNode } from "react";

import type { AlertStatus, HealthStatus, InferenceMode, InspectionStatus, RiskLevel, Severity } from "@/types/api";
import { cn } from "@/utils/cn";
import { ALERT_STATUS_META, HEALTH_META, INSPECTION_STATUS_META, RISK_META, SEVERITY_META } from "@/utils/status";

/** Neutral pill with a coloured dot: identity from the dot + label, never colour alone. */
export function DotBadge({ color, children, pulse = false, className }: { color: string; children: ReactNode; pulse?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-ink",
        className,
      )}
      style={{ borderColor: `${color}55`, background: `${color}14` }}
    >
      <span className={cn("size-1.5 rounded-full", pulse && "animate-pulse-soft")} style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity | null | undefined }) {
  if (!severity) return <span className="text-xs text-ink-3">None</span>;
  const meta = SEVERITY_META[severity];
  return <DotBadge color={meta.color}>{meta.label}</DotBadge>;
}

export function RiskBadge({ risk }: { risk: RiskLevel | null | undefined }) {
  if (!risk) return <span className="text-xs text-ink-3">—</span>;
  const meta = RISK_META[risk];
  return <DotBadge color={meta.color}>{meta.label}</DotBadge>;
}

export function HealthBadge({ status }: { status: HealthStatus | null | undefined }) {
  if (!status) return <DotBadge color="#74829a">Not inspected</DotBadge>;
  const meta = HEALTH_META[status];
  return <DotBadge color={meta.color}>{meta.label}</DotBadge>;
}

export function StatusBadge({ status }: { status: InspectionStatus }) {
  const meta = INSPECTION_STATUS_META[status];
  return (
    <DotBadge color={meta.color} pulse={status === "PROCESSING" || status === "QUEUED"}>
      {meta.label}
    </DotBadge>
  );
}

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const meta = ALERT_STATUS_META[status];
  return <DotBadge color={meta.color}>{meta.label}</DotBadge>;
}

/** Makes demo (mock) inference unmistakable wherever AI output is shown. */
export function InferenceModeBadge({ mode, compact = false }: { mode: InferenceMode | null | undefined; compact?: boolean }) {
  if (!mode) return null;
  if (mode === "demo") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap text-warn uppercase"
        title="Produced by the demo heuristic detector, not a trained model"
      >
        <Beaker className="size-3" aria-hidden />
        {compact ? "Demo" : "Demo inference"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap text-accent uppercase">
      <Cpu className="size-3" aria-hidden />
      {compact ? "Model" : "Production model"}
    </span>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2", className)}>
      {children}
    </span>
  );
}
