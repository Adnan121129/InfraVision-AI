import { AlertTriangle, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { AlertStatusBadge, SeverityBadge } from "@/components/ui/Badge";
import type { AlertStatus, Severity } from "@/types/api";
import { relativeTime } from "@/utils/format";
import { SEVERITY_META } from "@/utils/status";

interface AlertCardProps {
  id: number;
  reference: string;
  title: string;
  severity: Severity;
  status: AlertStatus;
  createdAt: string;
  assetId: number;
  assetName: string;
  inspectionReference?: string | null;
}

export function AlertCard({ reference, title, severity, status, createdAt, assetId, assetName, inspectionReference }: AlertCardProps) {
  const color = SEVERITY_META[severity].color;
  return (
    <Link
      to={`/app/alerts?search=${encodeURIComponent(reference)}`}
      className="group flex items-start gap-3 rounded-lg border border-line bg-surface-2/40 p-3 transition-colors hover:border-line-strong hover:bg-surface-2"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1f`, color }}>
        <AlertTriangle className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{title}</p>
        <p className="mt-0.5 truncate text-xs text-ink-3">
          <span className="font-mono">{reference}</span> · {assetName}
          {inspectionReference ? ` · ${inspectionReference}` : ""} · {relativeTime(createdAt)}
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <SeverityBadge severity={severity} />
          <AlertStatusBadge status={status} />
        </div>
      </div>
      <ChevronRight className="mt-1 size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      <span className="sr-only">Asset {assetId}</span>
    </Link>
  );
}
