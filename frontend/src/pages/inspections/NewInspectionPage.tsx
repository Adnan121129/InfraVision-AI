import { AlertCircle, ArrowRight, CheckCircle2, FileImage, ImagePlus, Loader2, RotateCcw, Sparkles, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { assetsApi, inspectionsApi } from "@/api/endpoints";
import { ProcessingTimeline } from "@/components/inspection/ProcessingTimeline";
import { UploadZone, validateFiles, type RejectedFile } from "@/components/inspection/UploadZone";
import { PageHeader } from "@/components/layout/PageHeader";
import { InferenceModeBadge, SeverityBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select, Textarea } from "@/components/ui/Field";
import { HealthGauge } from "@/components/ui/HealthGauge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useMeta } from "@/contexts/MetaContext";
import { useToast } from "@/contexts/ToastContext";
import { useApi } from "@/hooks/useApi";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useInspectionProgress } from "@/hooks/useInspectionProgress";
import type { ProcessingStage } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatBytes } from "@/utils/format";

type FileState = "ready" | "uploading" | "uploaded" | "error";

interface QueuedFile {
  key: string;
  file: File;
  previewUrl: string;
  width?: number;
  height?: number;
  progress: number;
  state: FileState;
  error?: string;
}

type Phase = "compose" | "uploading" | "processing";

function readDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

export default function NewInspectionPage() {
  useDocumentTitle("New inspection");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { meta } = useMeta();
  const { notify } = useToast();
  const options = useApi((signal) => assetsApi.options(signal), []);

  const [assetId, setAssetId] = useState(params.get("asset") ?? "");
  const [inspectionType, setInspectionType] = useState("DRONE");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [phase, setPhase] = useState<Phase>("compose");
  const [inspectionId, setInspectionId] = useState<number | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [localStage, setLocalStage] = useState<ProcessingStage>("UPLOADING");
  const [formError, setFormError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const maxMb = meta?.upload_limits.max_file_mb ?? 25;
  const maxImages = meta?.upload_limits.max_images ?? 20;
  const progress = useInspectionProgress(inspectionId, phase === "processing");
  const serverStatus = progress.status;

  // Revoke object URLs when files are removed or the page unmounts.
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.previewUrl)), []);

  const addFiles = async (accepted: File[], bad: RejectedFile[]) => {
    const room = Math.max(0, maxImages - files.length);
    if (accepted.length > room) notify(`Only ${maxImages} images per inspection`, { level: "warning", description: `${accepted.length - room} file(s) were not added.` });
    const decoded = await Promise.all(
      accepted.slice(0, room).map(async (file) => {
        const previewUrl = URL.createObjectURL(file);
        const dims = await readDimensions(previewUrl);
        return { file, previewUrl, ...dims };
      }),
    );
    // Files the browser cannot decode are rejected before upload (the API validates again).
    const unreadable = decoded.filter((d) => !d.width || !d.height);
    unreadable.forEach((d) => URL.revokeObjectURL(d.previewUrl));
    setRejected([...bad, ...unreadable.map((d) => ({ name: d.file.name, reason: "Not a readable image — the file may be corrupted" }))]);
    const additions: QueuedFile[] = decoded
      .filter((d) => d.width && d.height)
      .map((d) => ({ key: `${d.file.name}-${d.file.size}-${d.file.lastModified}-${Math.random()}`, file: d.file, previewUrl: d.previewUrl, width: d.width, height: d.height, progress: 0, state: "ready" as FileState }));
    setFiles((prev) => [...prev, ...additions]);
  };

  const removeFile = (key: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.key !== key);
    });
  };

  const patchFile = (key: string, patch: Partial<QueuedFile>) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + f.file.size, 0), [files]);
  const overallUpload = files.length ? files.reduce((sum, f) => sum + (f.state === "uploaded" ? 100 : f.progress), 0) / files.length : 0;

  const run = async () => {
    setFormError(null);
    if (!assetId) return setFormError("Select the structural asset being inspected.");
    if (!files.length) return setFormError("Add at least one inspection image.");
    setPhase("uploading");
    setLocalStage("UPLOADING");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let id = inspectionId;
      if (!id) {
        const created = await inspectionsApi.create({ structural_asset: Number(assetId), inspection_type: inspectionType, notes });
        id = created.id;
        setInspectionId(created.id);
        setReference(created.reference);
      }
      let uploaded = 0;
      for (const item of filesRef.current) {
        if (item.state === "uploaded") {
          uploaded += 1;
          continue;
        }
        patchFile(item.key, { state: "uploading", progress: 0, error: undefined });
        try {
          await inspectionsApi.uploadImage(id, item.file, (p) => patchFile(item.key, { progress: p }), controller.signal);
          patchFile(item.key, { state: "uploaded", progress: 100 });
          uploaded += 1;
        } catch (err) {
          const message = err instanceof ApiError ? err.message : "Upload failed";
          patchFile(item.key, { state: "error", error: message });
          if (err instanceof ApiError && (err.code === "network_error" || err.code === "cancelled")) throw err;
        }
      }
      if (uploaded === 0) throw new ApiError("None of the images could be uploaded. Fix the errors below and try again.");
      if (uploaded < filesRef.current.length) {
        setPhase("compose");
        setFormError(`${filesRef.current.length - uploaded} image(s) failed to upload. Remove or replace them, then run the inspection again.`);
        return;
      }
      setLocalStage("STORED");
      await inspectionsApi.submit(id);
      setLocalStage("QUEUED");
      setPhase("processing");
    } catch (err) {
      setPhase("compose");
      setFormError(err instanceof ApiError ? err.message : "Could not start the inspection.");
    }
  };

  const retry = async () => {
    if (!inspectionId) return;
    setRetrying(true);
    try {
      await inspectionsApi.retry(inspectionId);
      await progress.refresh();
    } catch (err) {
      notify("Retry failed", { level: "error", description: (err as ApiError).message });
    } finally {
      setRetrying(false);
    }
  };

  const stage: ProcessingStage = phase === "processing" && serverStatus ? serverStatus.processing_stage : localStage;
  const status = phase === "processing" && serverStatus ? serverStatus.status : "PENDING";
  const completed = status === "COMPLETED";
  const failed = status === "FAILED";

  const assetOptions = (options.data ?? []).map((a) => ({ value: String(a.id), label: `${a.asset_name} · ${a.asset_code}` }));
  const locked = phase !== "compose";

  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5 text-accent"><Sparkles className="size-3.5" /> AI inspection</span>}
        title="New inspection"
        subtitle="Upload drone, fixed-camera or handheld imagery. Images are stored in object storage and analysed asynchronously by the ML worker."
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Inspection imagery" subtitle={`${files.length} of ${maxImages} images · ${formatBytes(totalBytes)}`} />
            <div className="space-y-4 px-5 pb-5">
              <UploadZone onFiles={addFiles} maxMb={maxMb} disabled={locked || files.length >= maxImages} compact={files.length > 0} />
              {rejected.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-critical/30 bg-critical/[0.06] p-3" aria-live="polite">
                  {rejected.map((r) => (
                    <li key={r.name} className="flex items-center gap-2 text-xs text-critical-ink">
                      <XCircle className="size-3.5 shrink-0" /> <span className="truncate font-medium">{r.name}</span> — {r.reason}
                    </li>
                  ))}
                </ul>
              )}
              {files.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {files.map((f) => (
                    <li key={f.key} className={cn("overflow-hidden rounded-lg border bg-surface-2/50", f.state === "error" ? "border-critical/50" : "border-line")}>
                      <div className="relative aspect-[4/3] bg-black/40">
                        <img src={f.previewUrl} alt={`Preview of ${f.file.name}`} className="size-full object-cover" />
                        {f.state === "uploading" && <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />}
                        {f.state === "uploaded" && (
                          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] text-good-ink">
                            <CheckCircle2 className="size-3" /> Stored
                          </span>
                        )}
                        {!locked && f.state !== "uploaded" && (
                          <button type="button" onClick={() => removeFile(f.key)} className="absolute top-2 right-2 rounded-md bg-black/70 p-1 text-ink-2 hover:text-critical-ink" aria-label={`Remove ${f.file.name}`}>
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5 p-2.5">
                        <p className="truncate text-xs font-medium text-ink" title={f.file.name}>
                          {f.file.name}
                        </p>
                        <p className="text-[11px] text-ink-3 tabular">
                          {formatBytes(f.file.size)} · {f.width && f.height ? `${f.width} × ${f.height}px` : "resolution unknown"}
                        </p>
                        {(f.state === "uploading" || f.state === "uploaded") && <ProgressBar value={f.state === "uploaded" ? 100 : f.progress} color={f.state === "uploaded" ? "#0ca30c" : "#38bdf8"} label={`Upload progress for ${f.file.name}`} />}
                        {f.state === "error" && (
                          <p className="flex items-start gap-1 text-[11px] text-critical-ink">
                            <AlertCircle className="mt-px size-3 shrink-0" /> {f.error}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                  {!locked && files.length < maxImages && (
                    <li>
                      <label className="flex aspect-[4/3] h-full min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-xs text-ink-3 hover:border-accent/50 hover:text-ink-2">
                        <ImagePlus className="size-5" /> Add more images
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(e) => {
                            const list = Array.from(e.target.files ?? []);
                            e.target.value = "";
                            const { accepted, rejected: bad } = validateFiles(list, maxMb);
                            void addFiles(accepted, bad);
                          }}
                        />
                      </label>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Inspection details" />
            <div className="space-y-4 px-5 pb-5">
              <Select label="Structural asset" value={assetId} onChange={(e) => setAssetId(e.target.value)} options={assetOptions} placeholder={options.loading ? "Loading assets…" : "Select an asset"} disabled={locked} required />
              <Select label="Inspection type" value={inspectionType} onChange={(e) => setInspectionType(e.target.value)} options={meta?.inspection_types ?? []} disabled={locked} />
              <Textarea label="Notes" hint="optional" placeholder="Weather, access constraints, areas of concern…" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={locked} maxLength={4000} />
              {formError && (
                <p role="alert" className="rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-xs text-critical-ink">
                  {formError}
                </p>
              )}
              {phase === "compose" && (
                <Button variant="primary" size="lg" className="w-full" onClick={run} disabled={!files.length || !assetId} icon={<Sparkles className="size-4" />}>
                  Run AI Inspection
                </Button>
              )}
              {phase === "uploading" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-ink-2">
                    <span className="flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin text-accent" /> Uploading imagery…</span>
                    <span className="tabular">{Math.round(overallUpload)}%</span>
                  </div>
                  <ProgressBar value={overallUpload} label="Overall upload progress" />
                </div>
              )}
            </div>
          </Card>

          {phase !== "compose" && (
            <Card className="animate-slide-up">
              <CardHeader
                title={reference ? `Processing ${reference}` : "Processing"}
                subtitle={completed ? "Analysis complete" : failed ? "Processing failed" : "Live status from the inspection pipeline"}
                actions={serverStatus?.inference_mode ? <InferenceModeBadge mode={serverStatus.inference_mode} compact /> : undefined}
              />
              <div className="px-5 pb-5">
                <ProcessingTimeline stage={stage} status={status} detail={progress.detail} failedAt={progress.lastActiveStage} />
                {failed && (
                  <div className="mt-2 space-y-3 rounded-lg border border-critical/40 bg-critical/[0.07] p-3">
                    <p className="text-xs text-critical-ink">{serverStatus?.error_message || "The AI pipeline reported a failure."}</p>
                    <Button size="sm" onClick={retry} loading={retrying} icon={<RotateCcw className="size-3.5" />}>
                      Retry inspection
                    </Button>
                  </div>
                )}
                {completed && serverStatus && (
                  <div className="mt-2 space-y-4 rounded-lg border border-good/30 bg-good/[0.06] p-4">
                    <div className="flex items-center gap-4">
                      <HealthGauge score={serverStatus.overall_health_score} size={84} />
                      <div>
                        <p className="text-sm font-medium text-ink">{serverStatus.defect_count} structural anomalies detected</p>
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-3">
                          Highest severity <SeverityBadge severity={serverStatus.max_severity} />
                        </div>
                      </div>
                    </div>
                    <Button variant="primary" className="w-full" onClick={() => navigate(`/app/inspections/${inspectionId}`)} icon={<FileImage className="size-4" />}>
                      Open AI analysis <ArrowRight className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}

          {phase === "compose" && (
            <Card className="p-4 text-xs text-ink-3">
              <p className="mb-2 font-medium text-ink-2">What happens next</p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>Images are validated and stored in S3/MinIO; originals never ship back to your browser.</li>
                <li>An inspection task is queued in Redis for the dedicated ML worker.</li>
                <li>OpenCV preprocessing, model inference and severity scoring run in the background.</li>
                <li>Results and alerts appear here in real time.</li>
              </ol>
              <p className="mt-3">
                Browse all inspections in the <Link to="/app/inspections" className="text-accent hover:underline">inspection history</Link>.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
