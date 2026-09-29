import { Activity, Beaker, Cpu, Gauge, Layers, Timer } from "lucide-react";
import type { ReactNode } from "react";

import { InferenceModeBadge } from "@/components/ui/Badge";
import type { DashboardData } from "@/types/api";
import { formatDuration, formatNumber, formatPercent, relativeTime } from "@/utils/format";

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2/50 px-3 py-2">
      <span className="text-ink-3">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-ink-3">{label}</p>
        <p className="text-sm leading-tight font-semibold text-ink tabular">{value}</p>
      </div>
    </div>
  );
}

export function ModelStatusCard({ model }: { model: DashboardData["model_status"] }) {
  if (!model) {
    return <p className="rounded-lg border border-line bg-surface-2/50 p-4 text-sm text-ink-3">No ML worker has registered a model yet. Start the ml-worker service to enable AI inspections.</p>;
  }
  const heartbeatAge = model.last_heartbeat_at ? (Date.now() - new Date(model.last_heartbeat_at).getTime()) / 60000 : Infinity;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{model.model_name}</p>
          <p className="truncate text-xs text-ink-3">
            v{model.version} · {model.framework}
          </p>
        </div>
        <InferenceModeBadge mode={model.is_demo ? "demo" : "production"} compact />
      </div>
      {model.is_demo && (
        <p className="flex gap-2 rounded-lg border border-warn/30 bg-warn/[0.07] p-2.5 text-[11px] text-ink-2">
          <Beaker className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
          Demo heuristic detector — not a trained neural network. Deploy a trained checkpoint to enable production inference.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Stat icon={<Gauge className="size-4" />} label="Accuracy" value={model.accuracy !== null ? formatPercent(model.accuracy) : "Not benchmarked"} />
        <Stat icon={<Layers className="size-4" />} label="Inspections processed" value={formatNumber(model.inspections_processed)} />
        <Stat icon={<Timer className="size-4" />} label="Avg. processing time" value={formatDuration(model.avg_inference_time)} />
        <Stat
          icon={<Activity className="size-4" />}
          label="Worker status"
          value={
            <span className="inline-flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${heartbeatAge < 60 * 24 ? "bg-good" : "bg-warn"}`} aria-hidden />
              {model.status === "ACTIVE" ? "Active" : model.status}
            </span>
          }
        />
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
        <Cpu className="size-3.5" aria-hidden /> {model.architecture} · last used {relativeTime(model.last_used_at)}
      </p>
    </div>
  );
}
