import { Beaker, ChevronRight, Clock, Cpu, Gauge, Layers, RefreshCcw, RotateCcw, ScanSearch, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { detectionsApi, inspectionsApi } from "@/api/endpoints";
import { makeTooltip } from "@/components/charts/ChartTooltip";
import { axisProps, barRadius, chartTheme } from "@/components/charts/theme";
import { DetectionList } from "@/components/inspection/DetectionList";
import { ImageViewer } from "@/components/inspection/ImageViewer";
import { ProcessingTimeline } from "@/components/inspection/ProcessingTimeline";
import { PageHeader } from "@/components/layout/PageHeader";
import { HealthBadge, InferenceModeBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { HealthGauge } from "@/components/ui/HealthGauge";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useApi } from "@/hooks/useApi";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useInspectionProgress } from "@/hooks/useInspectionProgress";
import type { InspectionResults, ReviewStatus } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatBytes, formatDateTime, formatDuration, formatPercent } from "@/utils/format";
import { DEFECT_LABELS, SEVERITY_META, SEVERITY_ORDER } from "@/utils/status";

const confidenceTooltip = makeTooltip({ title: (l) => `Confidence ${l}`, format: (v) => `${v} detections` });

function MetaStat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-2/50 p-3">
      <span className="mt-0.5 text-ink-3">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-ink-3">{label}</p>
        <p className="truncate text-sm font-semibold text-ink">{value}</p>
        {hint && <p className="truncate text-[11px] text-ink-3">{hint}</p>}
      </div>
    </div>
  );
}

function ProcessingView({ id, reference, onDone }: { id: number; reference: string; onDone: () => void }) {
  const progress = useInspectionProgress(id);
  const { notify } = useToast();
  const [retrying, setRetrying] = useState(false);
  const status = progress.status;
  useEffect(() => {
    if (status?.status === "COMPLETED") onDone();
  }, [status?.status, onDone]);
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader title={`${reference} is being processed`} subtitle="This page updates automatically when the ML worker finishes." />
      <div className="px-5 pb-5">
        {status ? <ProcessingTimeline stage={status.processing_stage} status={status.status} detail={progress.detail} failedAt={progress.lastActiveStage} /> : <PageSkeleton />}
        {status?.status === "FAILED" && (
          <div className="mt-2 space-y-3 rounded-lg border border-critical/40 bg-critical/[0.07] p-3">
            <p className="text-xs text-critical-ink">{status.error_message}</p>
            <Button
              size="sm"
              loading={retrying}
              icon={<RotateCcw className="size-3.5" />}
              onClick={async () => {
                setRetrying(true);
                try {
                  await inspectionsApi.retry(id);
                  await progress.refresh();
                } catch (err) {
                  notify("Retry failed", { level: "error", description: (err as ApiError).message });
                } finally {
                  setRetrying(false);
                }
              }}
            >
              Retry inspection
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function InspectionResultPage() {
  const { id = "" } = useParams();
  const { hasRole } = useAuth();
  const { notify } = useToast();
  const results = useApi((signal) => inspectionsApi.results(id, signal), [id]);
  const [imageIndex, setImageIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmReprocess, setConfirmReprocess] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  useDocumentTitle(results.data ? `${results.data.inspection.reference} analysis` : "Inspection");

  const data = results.data;
  const images = data?.images ?? [];
  const image = images[Math.min(imageIndex, Math.max(images.length - 1, 0))];
  const typeBreakdown = useMemo(() => Object.entries(data?.summary.type_counts ?? {}).sort((a, b) => b[1] - a[1]), [data]);

  if (results.loading && !data) return <PageSkeleton />;
  if (results.error && !data) {
    return results.error.status === 404 ? (
      <EmptyState title="Inspection not found" description="It may have been deleted with its asset." action={<Link to="/app/inspections"><Button>All inspections</Button></Link>} className="mt-16" />
    ) : (
      <ErrorState message={results.error.message} onRetry={results.refetch} />
    );
  }
  const ins = data!.inspection;

  if (ins.status !== "COMPLETED") {
    return (
      <>
        <PageHeader eyebrow="AI inspection" title={ins.reference} subtitle={`${ins.asset_name} · ${ins.inspection_type_display} · ${formatDateTime(ins.inspection_date)}`} actions={<StatusBadge status={ins.status} />} />
        {ins.status === "PENDING" ? (
          <EmptyState title="This inspection has not been submitted" description="Images may still be uploading. Start a new inspection to upload imagery and run AI analysis." action={<Link to="/app/inspections/new"><Button variant="primary">New inspection</Button></Link>} />
        ) : (
          <ProcessingView id={ins.id} reference={ins.reference} onDone={() => void results.refetch()} />
        )}
      </>
    );
  }

  const review = async (detectionId: number, status: ReviewStatus) => {
    try {
      const updated = await detectionsApi.review(detectionId, status);
      results.setData((prev) => {
        const current = prev as InspectionResults;
        return {
          ...current,
          images: current.images.map((img) => ({ ...img, detections: img.detections.map((d) => (d.id === detectionId ? { ...d, review_status: updated.review_status, reviewed_by_name: updated.reviewed_by_name } : d)) })),
        };
      });
      notify(status === "CONFIRMED" ? "Detection confirmed" : "Detection rejected as false positive", { level: "success" });
    } catch (err) {
      notify("Review failed", { level: "error", description: (err as ApiError).message });
    }
  };

  const reprocess = async () => {
    setReprocessing(true);
    try {
      await inspectionsApi.reprocess(ins.id);
      notify(`${ins.reference} queued for re-analysis`, { level: "info" });
      setConfirmReprocess(false);
      await results.refetch();
    } catch (err) {
      notify("Could not re-run analysis", { level: "error", description: (err as ApiError).message });
    } finally {
      setReprocessing(false);
    }
  };

  const s = data!.summary;
  const isDemo = data!.inference_mode === "demo";

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-ink-3">
        <Link to="/app/inspections" className="hover:text-ink-2">Inspections</Link>
        <ChevronRight className="size-3" />
        <span className="text-ink-2">{ins.reference}</span>
      </nav>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2 text-accent"><ScanSearch className="size-3.5" /> AI inspection results</span>}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {ins.reference}
            <InferenceModeBadge mode={data!.inference_mode} />
          </span>
        }
        subtitle={
          <>
            <Link to={`/app/assets/${ins.structural_asset}`} className="text-ink hover:text-accent">{ins.asset_name}</Link> · {ins.inspection_type_display} · {formatDateTime(ins.inspection_date)}
            {ins.inspector_name ? ` · ${ins.inspector_name}` : ""}
          </>
        }
        actions={
          hasRole("ENGINEER") && (
            <Button variant="outline" icon={<RefreshCcw className="size-4" />} onClick={() => setConfirmReprocess(true)}>
              Re-run analysis
            </Button>
          )
        }
      />

      {isDemo && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/[0.07] px-4 py-3 text-sm text-ink-2">
          <Beaker className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <p>
            These results were produced by the <strong className="text-ink">demo heuristic detector</strong> (classical OpenCV rules), not a trained neural network. Confidence values are heuristic scores. Use them to evaluate the workflow — not for engineering decisions.
          </p>
        </div>
      )}

      <section className="grid gap-5 lg:grid-cols-[300px_1fr]" aria-label="Inspection summary">
        <Card className="flex flex-col items-center justify-center p-5 text-center">
          <p className="label-eyebrow mb-3">Overall structural health</p>
          <HealthGauge score={s.overall_health_score} size={150} />
          <div className="mt-3">
            <HealthBadge status={s.health_status} />
          </div>
        </Card>
        <Card className="p-5">
          <div className="grid gap-5 md:grid-cols-[auto_1fr]">
            <div className="md:border-r md:border-line md:pr-6">
              <p className="text-[11px] text-ink-3">Detected defects</p>
              <p className="text-5xl font-semibold tracking-tight text-ink">{s.defect_count}</p>
              {s.rejected_count > 0 && <p className="mt-1 text-[11px] text-ink-3">{s.rejected_count} rejected by engineers</p>}
              <ul className="mt-4 space-y-1.5">
                {[...SEVERITY_ORDER].reverse().map((level) => (
                  <li key={level} className="flex items-center justify-between gap-6 text-sm">
                    <span className="flex items-center gap-2 text-ink-2">
                      <span className="size-2.5 rounded-[3px]" style={{ background: SEVERITY_META[level].color }} aria-hidden />
                      {SEVERITY_META[level].label}
                    </span>
                    <span className="font-semibold text-ink tabular">{s.severity_counts[level] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid content-start gap-2.5 sm:grid-cols-2">
              <MetaStat icon={<Cpu className="size-4" />} label="Model version" value={data!.model.version || "—"} hint={data!.model.architecture ?? undefined} />
              <MetaStat icon={<Clock className="size-4" />} label="Inference time" value={formatDuration(data!.processing_time)} hint={`${images.length} image${images.length === 1 ? "" : "s"} processed`} />
              <MetaStat icon={<Gauge className="size-4" />} label={isDemo ? "Average heuristic score" : "Average confidence"} value={formatPercent(s.avg_confidence)} />
              <MetaStat
                icon={<Layers className="size-4" />}
                label="Image preprocessing"
                value={`${data!.preprocessing_report.filter((r) => r.status === "completed").length} stages completed`}
                hint={`${data!.preprocessing_report.filter((r) => r.status === "skipped").length} skipped for this model`}
              />
              {typeBreakdown.length > 0 && (
                <div className="rounded-lg border border-line bg-surface-2/50 p-3 sm:col-span-2">
                  <p className="mb-2 text-[11px] text-ink-3">Defect types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {typeBreakdown.map(([type, count]) => (
                      <span key={type} className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-ink-2">
                        {DEFECT_LABELS[type] ?? type} <span className="font-semibold text-ink">{count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </section>

      {images.length > 1 && (
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Inspection images">
          {images.map((img, index) => (
            <button
              key={img.id}
              type="button"
              role="tab"
              aria-selected={index === imageIndex}
              onClick={() => {
                setImageIndex(index);
                setSelected(null);
              }}
              className={cn("relative shrink-0 overflow-hidden rounded-lg border-2", index === imageIndex ? "border-accent" : "border-transparent opacity-70 hover:opacity-100")}
            >
              {img.thumbnail_url && <img src={img.thumbnail_url} alt={img.original_filename} className="h-16 w-24 object-cover" loading="lazy" />}
              <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px] text-ink">{img.detections.length}</span>
            </button>
          ))}
        </div>
      )}

      {image ? (
        <section className="mt-5 grid gap-5 2xl:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader title={image.original_filename} subtitle={`${image.image_width} × ${image.image_height}px · ${formatBytes(image.file_size)} · image health ${image.health_score !== null ? Math.round(image.health_score) : "—"}/100`} />
            <div className="px-5 pb-5">
              <ImageViewer image={image} detections={image.detections} selectedId={selected} onSelect={setSelected} />
              <p className="mt-3 text-[11px] text-ink-3">Bounding boxes are stored in original-image pixel coordinates and scaled to the displayed preview. Hover a box or list entry to link them.</p>
            </div>
          </Card>
          <Card className="2xl:max-h-[calc(100vh-10rem)] 2xl:overflow-y-auto">
            <CardHeader title="Detections" subtitle={`${image.detections.length} in this image · engineers can confirm or reject`} />
            <div className="px-4 pb-4">
              <DetectionList detections={image.detections} selectedId={selected} onSelect={setSelected} canReview={hasRole("ENGINEER")} onReview={review} />
            </div>
          </Card>
        </section>
      ) : (
        <EmptyState title="No images on this inspection" className="mt-5" />
      )}

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Confidence distribution" subtitle={isDemo ? "Heuristic scores of all detections (demo)" : "Model confidence of all detections"} />
          <div className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data!.confidence_distribution} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                <XAxis dataKey="range" {...axisProps} />
                <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
                <Tooltip content={confidenceTooltip} cursor={{ fill: "rgb(148 163 184 / 0.06)" }} />
                <Bar dataKey="count" name="Detections" fill={chartTheme.series[0]} radius={barRadius} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Processing pipeline" subtitle="Stage-by-stage report from the ML worker (summed across images)" />
          <ol className="space-y-1 px-5 pb-5">
            {data!.preprocessing_report.map((stage, index) => (
              <li key={stage.name} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2/60">
                <span className="w-5 text-right font-mono text-[11px] text-ink-3">{index + 1}</span>
                {stage.status === "skipped" ? <SkipForward className="size-3.5 text-ink-3" aria-label="Skipped" /> : <span className={cn("size-2 rounded-full", stage.status === "failed" ? "bg-critical" : "bg-good")} aria-label={stage.status} />}
                <span className={cn("flex-1", stage.status === "skipped" ? "text-ink-3" : "text-ink")}>{stage.label}</span>
                <span className="text-xs text-ink-3 tabular">{stage.status === "skipped" ? "skipped" : `${stage.duration_ms.toFixed(0)} ms`}</span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <Card className="mt-5">
        <CardHeader title="Inspection record" />
        <dl className="grid gap-x-8 gap-y-2 px-5 pb-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Celery task", <span key="t" className="font-mono text-xs">{ins.celery_task_id || "—"}</span>],
            ["Attempts", ins.attempts],
            ["Queued", formatDateTime(ins.queued_at)],
            ["Completed", formatDateTime(ins.completed_at)],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="text-[11px] text-ink-3">{label}</dt>
              <dd className="text-ink-2">{value}</dd>
            </div>
          ))}
          {ins.notes && (
            <div className="sm:col-span-2 xl:col-span-4">
              <dt className="text-[11px] text-ink-3">Notes</dt>
              <dd className="text-ink-2">{ins.notes}</dd>
            </div>
          )}
        </dl>
      </Card>

      <ConfirmDialog
        open={confirmReprocess}
        title="Re-run AI analysis?"
        message="The inspection imagery is sent back to the ML worker with the currently deployed model. Existing detections and review decisions for this inspection are replaced when processing completes."
        confirmLabel="Re-run analysis"
        loading={reprocessing}
        onCancel={() => setConfirmReprocess(false)}
        onConfirm={reprocess}
      />
    </>
  );
}
