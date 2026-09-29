import { BrainCircuit, Check, ExternalLink, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { detectionsApi } from "@/api/endpoints";
import { ChipSelect, FilterBar } from "@/components/filters/FilterBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { InferenceModeBadge, SeverityBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Select } from "@/components/ui/Field";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useMeta } from "@/contexts/MetaContext";
import { useToast } from "@/contexts/ToastContext";
import { useApi } from "@/hooks/useApi";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { ExplorerDetection, ReviewStatus } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatDate } from "@/utils/format";
import { SEVERITY_META } from "@/utils/status";

const PAGE_SIZE = 24;

/** Fit a 4:3 window around the detection (padded, clamped to the image). */
function cropWindow(det: ExplorerDetection) {
  const W = det.image_width;
  const H = det.image_height;
  const w = det.x_max - det.x_min;
  const h = det.y_max - det.y_min;
  let cw = Math.max(w * 1.6, 80);
  let ch = Math.max(h * 1.6, 60);
  if (cw / ch > 4 / 3) ch = (cw * 3) / 4;
  else cw = (ch * 4) / 3;
  const scale = Math.min(1, W / cw, H / ch); // never larger than the image
  cw *= scale;
  ch *= scale;
  const cx = (det.x_min + det.x_max) / 2;
  const cy = (det.y_min + det.y_max) / 2;
  const x0 = Math.min(Math.max(0, cx - cw / 2), Math.max(0, W - cw));
  const y0 = Math.min(Math.max(0, cy - ch / 2), Math.max(0, H - ch));
  return { x0, y0, cw, ch };
}

/** Crop of the detection region rendered with CSS (reuses the cached preview image). */
function DetectionCrop({ det }: { det: ExplorerDetection }) {
  const { x0, y0, cw, ch } = cropWindow(det);
  const color = SEVERITY_META[det.severity].color;
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-black/50">
      {det.image_url && (
        <>
          <img
            src={det.image_url}
            alt={`${det.defect_type_display} region`}
            loading="lazy"
            className="absolute max-w-none"
            style={{ width: `${(det.image_width / cw) * 100}%`, height: `${(det.image_height / ch) * 100}%`, left: `${(-x0 / cw) * 100}%`, top: `${(-y0 / ch) * 100}%` }}
          />
          <span
            className="absolute rounded-[3px] border-2"
            style={{
              borderColor: color,
              left: `${((det.x_min - x0) / cw) * 100}%`,
              top: `${((det.y_min - y0) / ch) * 100}%`,
              width: `${((det.x_max - det.x_min) / cw) * 100}%`,
              height: `${((det.y_max - det.y_min) / ch) * 100}%`,
            }}
          />
        </>
      )}
    </div>
  );
}

export default function AIAnalysisPage() {
  useDocumentTitle("AI analysis");
  const { meta } = useMeta();
  const { hasRole } = useAuth();
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const [pending, setPending] = useState<number | null>(null);
  const types = params.getAll("defect_type");
  const severities = params.getAll("severity");
  const reviewStatus = params.get("review_status") ?? "";
  const minConfidence = params.get("min_confidence") ?? "";
  const page = Number(params.get("page") ?? 1);

  const update = (changes: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key);
      if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
      else if (value) next.set(key, value);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  };

  const query = useMemo(
    () => ({ defect_type: types, severity: severities, review_status: reviewStatus, min_confidence: minConfidence, ordering: "-created_at", page, page_size: PAGE_SIZE }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.toString()],
  );
  const list = useApi((signal) => detectionsApi.list(query, signal), [query]);

  const review = async (det: ExplorerDetection, status: ReviewStatus) => {
    setPending(det.id);
    try {
      const updated = await detectionsApi.review(det.id, status);
      list.setData((prev) => ({ ...prev!, results: prev!.results.map((d) => (d.id === det.id ? updated : d)) }));
    } catch (err) {
      notify("Review failed", { level: "error", description: (err as ApiError).message });
    } finally {
      setPending(null);
    }
  };

  const active = types.length + severities.length + (reviewStatus ? 1 : 0) + (minConfidence ? 1 : 0);

  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5 text-accent"><BrainCircuit className="size-3.5" /> Defect intelligence</span>}
        title="AI analysis"
        subtitle="Every structural defect the models have detected across the portfolio. Engineers confirm or reject detections — the human-in-the-loop record used to audit and retrain models."
      />
      <Card className="mb-4 p-3">
        <FilterBar active={active} onReset={() => setParams(new URLSearchParams(), { replace: true })}>
          <Select aria-label="Review status" value={reviewStatus} onChange={(e) => update({ review_status: e.target.value || null })} options={meta?.review_statuses ?? []} placeholder="Any review status" wrapperClassName="w-52" />
          <Select
            aria-label="Minimum confidence"
            value={minConfidence}
            onChange={(e) => update({ min_confidence: e.target.value || null })}
            options={[{ value: "0.6", label: "≥ 60% confidence" }, { value: "0.75", label: "≥ 75% confidence" }, { value: "0.9", label: "≥ 90% confidence" }]}
            placeholder="Any confidence"
            wrapperClassName="w-44"
          />
        </FilterBar>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3">
          <ChipSelect label="Defect type" options={(meta?.defect_types ?? []).map((c) => ({ value: c.value, label: c.label }))} value={types} onChange={(v) => update({ defect_type: v })} />
          <ChipSelect label="Severity" options={Object.entries(SEVERITY_META).map(([value, m]) => ({ value, label: m.label, color: m.color }))} value={severities} onChange={(v) => update({ severity: v })} />
        </div>
      </Card>

      {list.loading && !list.data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : list.error && !list.data ? (
        <ErrorState message={list.error.message} onRetry={list.refetch} />
      ) : !list.data?.results.length ? (
        <EmptyState title="No detections match these filters" />
      ) : (
        <>
          <ul className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4", list.refreshing && "opacity-60")}>
            {list.data.results.map((det) => (
              <li key={det.id} className={cn("panel overflow-hidden", det.review_status === "REJECTED" && "opacity-60")}>
                <DetectionCrop det={det} />
                <div className="space-y-2.5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{det.defect_type_display}</p>
                      <Link to={`/app/assets/${det.asset_id}`} className="block truncate text-xs text-ink-3 hover:text-accent">
                        {det.asset_name}
                      </Link>
                    </div>
                    <SeverityBadge severity={det.severity} />
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <div className="h-full rounded-full bg-accent" style={{ width: `${det.confidence_score * 100}%` }} />
                    </div>
                    <span className="font-semibold text-ink tabular">{(det.confidence_score * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-ink-3">
                    <Link to={`/app/inspections/${det.inspection}`} className="inline-flex items-center gap-1 font-mono hover:text-accent">
                      {det.inspection_reference} <ExternalLink className="size-3" />
                    </Link>
                    <span className="flex items-center gap-1.5">
                      {formatDate(det.inspection_date)}
                      <InferenceModeBadge mode={det.inference_mode} compact />
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-line pt-2.5">
                    <span className="text-[11px] text-ink-2">
                      {det.review_status === "UNREVIEWED" ? "Unreviewed" : det.review_status === "CONFIRMED" ? "Confirmed" : "Rejected"}
                      {det.reviewed_by_name ? ` · ${det.reviewed_by_name}` : ""}
                    </span>
                    {hasRole("ENGINEER") && (
                      <span className="flex gap-1">
                        <button type="button" disabled={pending === det.id} onClick={() => review(det, "CONFIRMED")} className={cn("rounded-md border p-1", det.review_status === "CONFIRMED" ? "border-good/50 bg-good/15 text-good-ink" : "border-line text-ink-3 hover:text-ink")} aria-label="Confirm detection">
                          <Check className="size-3.5" />
                        </button>
                        <button type="button" disabled={pending === det.id} onClick={() => review(det, "REJECTED")} className={cn("rounded-md border p-1", det.review_status === "REJECTED" ? "border-critical/50 bg-critical/15 text-critical-ink" : "border-line text-ink-3 hover:text-ink")} aria-label="Reject detection">
                          <X className="size-3.5" />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Card className="mt-4">
            <Pagination page={list.data.page} totalPages={list.data.total_pages} count={list.data.count} pageSize={PAGE_SIZE} onPageChange={(p) => update({ page: String(p) })} />
          </Card>
        </>
      )}
    </>
  );
}
