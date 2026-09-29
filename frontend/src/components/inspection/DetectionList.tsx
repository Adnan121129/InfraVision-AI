import { Check, X } from "lucide-react";

import { SeverityBadge } from "@/components/ui/Badge";
import type { Detection, ReviewStatus } from "@/types/api";
import { cn } from "@/utils/cn";
import { SEVERITY_META } from "@/utils/status";

interface DetectionListProps {
  detections: Detection[];
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
  canReview?: boolean;
  onReview?: (id: number, status: ReviewStatus) => void;
}

export function DetectionList({ detections, selectedId, onSelect, canReview, onReview }: DetectionListProps) {
  if (!detections.length) {
    return <p className="rounded-lg border border-line bg-surface-2/50 px-4 py-6 text-center text-sm text-ink-3">No structural defects detected in this image.</p>;
  }
  return (
    <ul className="space-y-2" aria-label="Detected defects">
      {detections.map((det) => {
        const meta = SEVERITY_META[det.severity];
        const selected = selectedId === det.id;
        return (
          <li key={det.id}>
            <div
              role="button"
              tabIndex={0}
              onMouseEnter={() => onSelect?.(det.id)}
              onFocus={() => onSelect?.(det.id)}
              onClick={() => onSelect?.(selected ? null : det.id)}
              onKeyDown={(e) => e.key === "Enter" && onSelect?.(selected ? null : det.id)}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                selected ? "border-accent/50 bg-accent/[0.06]" : "border-line bg-surface-2/50 hover:border-line-strong",
                det.review_status === "REJECTED" && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: meta.color }} aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{det.defect_type_display}</p>
                    <p className="text-[11px] text-ink-3 tabular">
                      bbox [{det.x_min}, {det.y_min}] → [{det.x_max}, {det.y_max}]
                    </p>
                  </div>
                </div>
                <SeverityBadge severity={det.severity} />
              </div>
              <div className="mt-2.5 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <div className="h-full rounded-full bg-accent" style={{ width: `${det.confidence_score * 100}%` }} />
                </div>
                <span className="text-xs font-semibold text-ink tabular">{(det.confidence_score * 100).toFixed(1)}%</span>
                <span className="text-[11px] text-ink-3">confidence</span>
              </div>
              {det.description && <p className="mt-2 text-xs text-ink-2">{det.description}</p>}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink-3">
                  {det.review_status === "UNREVIEWED" ? "Awaiting engineer review" : det.review_status === "CONFIRMED" ? `Confirmed${det.reviewed_by_name ? ` by ${det.reviewed_by_name}` : ""}` : `Rejected${det.reviewed_by_name ? ` by ${det.reviewed_by_name}` : ""}`}
                </span>
                {canReview && onReview && (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReview(det.id, "CONFIRMED");
                      }}
                      className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]", det.review_status === "CONFIRMED" ? "border-good/50 bg-good/15 text-good-ink" : "border-line text-ink-2 hover:bg-surface-3")}
                      aria-label="Confirm detection"
                    >
                      <Check className="size-3" /> Confirm
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReview(det.id, "REJECTED");
                      }}
                      className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]", det.review_status === "REJECTED" ? "border-critical/50 bg-critical/15 text-critical-ink" : "border-line text-ink-2 hover:bg-surface-3")}
                      aria-label="Reject detection as false positive"
                    >
                      <X className="size-3" /> Reject
                    </button>
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
