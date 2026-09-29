import { Beaker, BookOpen, CheckCircle2, Cpu, Database, Gauge, Layers, Timer } from "lucide-react";
import type { ReactNode } from "react";

import { modelsApi } from "@/api/endpoints";
import { PageHeader } from "@/components/layout/PageHeader";
import { DotBadge, InferenceModeBadge, Tag } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useApi } from "@/hooks/useApi";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { MLModel } from "@/types/api";
import { formatDate, formatDuration, formatNumber, formatPercent, relativeTime } from "@/utils/format";
import { STATUS_COLORS } from "@/utils/status";

const STATUS_COLOR: Record<MLModel["status"], string> = { ACTIVE: STATUS_COLORS.good, STAGING: "#3987e5", INACTIVE: STATUS_COLORS.neutral, RETIRED: STATUS_COLORS.neutral };

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/50 p-3">
      <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
        {icon} {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-ink tabular">{value}</p>
    </div>
  );
}

function ModelCard({ model }: { model: MLModel }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink">{model.model_name}</h2>
            <Tag>v{model.version}</Tag>
            <DotBadge color={STATUS_COLOR[model.status]}>{model.status.toLowerCase().replace(/^./, (c) => c.toUpperCase())}</DotBadge>
            <InferenceModeBadge mode={model.is_demo ? "demo" : "production"} compact />
          </div>
          <p className="mt-1 text-xs text-ink-3">
            {model.framework_display} · {model.architecture}
          </p>
        </div>
        <p className="text-xs text-ink-3">Deployed {formatDate(model.deployed_at)} · heartbeat {relativeTime(model.last_heartbeat_at)}</p>
      </div>
      <div className="space-y-4 p-5">
        {model.is_demo && (
          <p className="flex gap-2 rounded-lg border border-warn/30 bg-warn/[0.07] p-3 text-xs text-ink-2">
            <Beaker className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            This is the demo heuristic detector (classical OpenCV rules). It has no trained weights and no benchmarked accuracy; its outputs are always flagged as demo inference.
          </p>
        )}
        {model.description && <p className="text-sm text-ink-2">{model.description}</p>}
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Metric icon={<Gauge className="size-3.5" />} label="Validation accuracy" value={model.accuracy !== null ? formatPercent(model.accuracy) : "Not benchmarked"} />
          <Metric icon={<CheckCircle2 className="size-3.5" />} label="Macro F1" value={model.f1_score !== null ? model.f1_score.toFixed(3) : "—"} />
          <Metric icon={<Layers className="size-3.5" />} label="Inspections processed" value={formatNumber(model.inspections_processed)} />
          <Metric icon={<Timer className="size-3.5" />} label="Avg. processing time" value={formatDuration(model.avg_processing_time)} />
        </div>
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <p className="text-ink-3">Classes</p>
            <div className="mt-1 flex flex-wrap gap-1">{model.classes.length ? model.classes.map((c) => <Tag key={c}>{c}</Tag>) : <span className="text-ink-2">—</span>}</div>
          </div>
          <div>
            <p className="flex items-center gap-1 text-ink-3"><Database className="size-3.5" /> Training dataset</p>
            <p className="mt-1 text-ink-2">{model.training_dataset || (model.is_demo ? "None (rule-based)" : "—")}</p>
          </div>
          <div>
            <p className="text-ink-3">Artifact</p>
            <p className="mt-1 truncate font-mono text-ink-2" title={model.artifact_uri}>{model.artifact_uri || "—"}</p>
          </div>
        </div>
        <p className="text-[11px] text-ink-3">
          {model.failed_inspections} failed inspection(s) · input size {model.input_size ? `${model.input_size}px` : "native resolution"} · last used {relativeTime(model.last_used_at)}
        </p>
      </div>
    </Card>
  );
}

export default function ModelsPage() {
  useDocumentTitle("AI models");
  const models = useApi((signal) => modelsApi.list(signal), []);

  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5 text-accent"><Cpu className="size-3.5" /> Model registry</span>}
        title="AI models"
        subtitle="Models are registered automatically by the ML worker when it loads them, so this registry always reflects what is actually serving predictions."
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {models.loading && !models.data ? (
            <SkeletonRows rows={4} />
          ) : models.error ? (
            <ErrorState message={models.error.message} onRetry={models.refetch} />
          ) : models.data?.results.length ? (
            models.data.results.map((m) => <ModelCard key={m.id} model={m} />)
          ) : (
            <EmptyState title="No models registered" description="Start the ml-worker service; it registers its model on start-up." />
          )}
        </div>
        <Card className="h-fit">
          <CardHeader icon={<BookOpen className="size-4" />} title="Deploying a trained model" />
          <ol className="list-decimal space-y-2.5 px-5 pb-5 pl-9 text-xs text-ink-2">
            <li>
              Prepare SDNET2018 (or your own labelled patches): <code className="font-mono text-ink">python -m infravision_ml.training.prepare_sdnet2018</code>
            </li>
            <li>
              Fine-tune ResNet-50 with transfer learning: <code className="font-mono text-ink">python -m infravision_ml.training.train_patch_classifier --arch resnet50</code>
            </li>
            <li>Place <code className="font-mono text-ink">model.pt</code> and <code className="font-mono text-ink">model_card.json</code> in the worker's <code className="font-mono text-ink">/models</code> volume.</li>
            <li>
              Set <code className="font-mono text-ink">INFERENCE_MODE=pytorch</code> and restart the ml-worker. It registers the new version here and marks it active; demo labelling disappears from new results.
            </li>
          </ol>
        </Card>
      </div>
    </>
  );
}
