import { CheckCircle2, CloudUpload, Cog, ListOrdered, XCircle } from "lucide-react";

import type { QueueOverview } from "@/types/api";
import { cn } from "@/utils/cn";

const ITEMS = [
  { key: "uploading", label: "Uploading", icon: CloudUpload, color: "#74829a" },
  { key: "queued", label: "Queued", icon: ListOrdered, color: "#3987e5" },
  { key: "processing", label: "Processing", icon: Cog, color: "#38bdf8" },
  { key: "completed", label: "Completed", icon: CheckCircle2, color: "#0ca30c" },
  { key: "failed", label: "Failed", icon: XCircle, color: "#d03b3b" },
] as const;

export function ProcessingQueue({ counts, windowDays = 7 }: { counts: QueueOverview["counts"]; windowDays?: number }) {
  return (
    <div>
      <ul className="grid grid-cols-5 gap-1.5">
        {ITEMS.map(({ key, label, icon: Icon, color }) => {
          const value = counts[key];
          const live = (key === "processing" || key === "queued") && value > 0;
          return (
            <li key={key} className="rounded-lg border border-line bg-surface-2/50 px-2 py-3 text-center">
              <Icon className={cn("mx-auto size-4", live && key === "processing" && "animate-spin [animation-duration:3s]")} style={{ color }} aria-hidden />
              <p className="mt-2 text-lg leading-none font-semibold text-ink tabular">{value}</p>
              <p className="mt-1 text-[10px] text-ink-3">{label}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[11px] text-ink-3">Queued and processing are live; completed, failed and uploading cover the last {windowDays} days.</p>
    </div>
  );
}
