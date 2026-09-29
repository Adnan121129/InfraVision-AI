import { Check, Loader2, X } from "lucide-react";

import type { InspectionStatus, ProcessingStage } from "@/types/api";
import { cn } from "@/utils/cn";
import { PIPELINE_STAGES, stageIndex } from "@/utils/status";

interface ProcessingTimelineProps {
  stage: ProcessingStage;
  status: InspectionStatus;
  detail?: string;
  /** Last stage reached before a failure, when known (e.g. from realtime events). */
  failedAt?: ProcessingStage;
  orientation?: "vertical" | "horizontal";
}

export function ProcessingTimeline({ stage, status, detail, failedAt, orientation = "vertical" }: ProcessingTimelineProps) {
  const failed = status === "FAILED" || stage === "FAILED";
  const done = status === "COMPLETED";
  const reached = failedAt && failedAt !== "FAILED" ? stageIndex(failedAt) : stageIndex("PREPROCESSING");
  const current = failed ? reached : stageIndex(stage);

  return (
    <ol className={cn(orientation === "horizontal" ? "grid grid-cols-7 gap-2" : "space-y-0")} aria-label="AI processing progress">
      {PIPELINE_STAGES.map((item, index) => {
        const state = done || index < current ? "done" : index === current ? (failed ? "failed" : "active") : "pending";
        const last = index === PIPELINE_STAGES.length - 1;
        return (
          <li key={item.stage} className={cn("relative flex gap-3", orientation === "horizontal" && "flex-col items-center text-center")} aria-current={state === "active" ? "step" : undefined}>
            {orientation === "vertical" && !last && (
              <span className={cn("absolute top-7 left-[13px] h-[calc(100%-20px)] w-px", state === "done" ? "bg-accent/50" : "bg-line-strong")} aria-hidden />
            )}
            <span
              className={cn(
                "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors duration-300",
                state === "done" && "border-accent/60 bg-accent/15 text-accent",
                state === "active" && "border-accent bg-accent/20 text-accent shadow-[0_0_0_4px_rgb(56_189_248/0.12)]",
                state === "failed" && "border-critical bg-critical/20 text-critical-ink",
                state === "pending" && "border-line-strong bg-surface-2 text-ink-3",
              )}
            >
              {state === "done" ? <Check className="size-3.5" /> : state === "active" ? <Loader2 className="size-3.5 animate-spin" /> : state === "failed" ? <X className="size-3.5" /> : index + 1}
            </span>
            <div className={cn(orientation === "vertical" ? "pb-5" : "")}>
              <p className={cn("text-sm font-medium", state === "pending" ? "text-ink-3" : "text-ink")}>{item.label}</p>
              {orientation === "vertical" && (
                <p className="text-xs text-ink-3">{state === "active" && detail ? detail : state === "failed" ? "Processing stopped — see error below" : item.description}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
