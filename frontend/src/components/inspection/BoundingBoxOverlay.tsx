import type { Detection } from "@/types/api";
import { cn } from "@/utils/cn";
import { SEVERITY_META } from "@/utils/status";

interface OverlayProps {
  detections: Detection[];
  imageWidth: number;
  imageHeight: number;
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
  showLabels?: boolean;
}

/**
 * Bounding boxes positioned in percentages of the original image size, so
 * they line up with any rendered variant (thumbnail, preview or original).
 */
export function BoundingBoxOverlay({ detections, imageWidth, imageHeight, selectedId, onSelect, showLabels = true }: OverlayProps) {
  if (!imageWidth || !imageHeight) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {detections.map((det) => {
        const meta = SEVERITY_META[det.severity];
        const selected = selectedId === det.id;
        const dimmed = selectedId != null && !selected;
        const left = (det.x_min / imageWidth) * 100;
        const top = (det.y_min / imageHeight) * 100;
        const width = ((det.x_max - det.x_min) / imageWidth) * 100;
        const height = ((det.y_max - det.y_min) / imageHeight) * 100;
        const rejected = det.review_status === "REJECTED";
        const labelInside = top < 6; // no room above the box: draw the label inside it
        return (
          <button
            key={det.id}
            type="button"
            onClick={() => onSelect?.(selected ? null : det.id)}
            onMouseEnter={() => onSelect?.(det.id)}
            aria-label={`${det.defect_type_display}, ${meta.label} severity, ${(det.confidence_score * 100).toFixed(1)}% confidence`}
            aria-pressed={selected}
            className={cn(
              "pointer-events-auto absolute rounded-[3px] border-2 transition-all duration-150",
              dimmed && "opacity-35",
              rejected && "border-dashed opacity-50",
            )}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              borderColor: meta.color,
              background: selected ? `${meta.color}26` : `${meta.color}0d`,
              boxShadow: selected ? `0 0 0 2px #0f1726, 0 0 18px ${meta.color}80` : undefined,
            }}
          >
            {showLabels && (
              <span
                className={cn(
                  "absolute left-[-2px] px-1.5 py-0.5 text-[10px] leading-none font-semibold whitespace-nowrap text-slate-950",
                  labelInside ? "top-[-2px] rounded-br-[3px]" : "-top-[21px] rounded-t-[3px]",
                )}
                style={{ background: meta.color }}
              >
                {det.defect_type_display} {(det.confidence_score * 100).toFixed(0)}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
