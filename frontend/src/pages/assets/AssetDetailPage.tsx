import { Archive, ArchiveRestore, BrainCircuit, CalendarClock, ChevronRight, MapPin, Pencil, ScanSearch, Trash2, TrendingDown, TrendingUp, Wrench } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { alertsApi, assetsApi, inspectionsApi } from "@/api/endpoints";
import { AssetFormModal } from "@/components/assets/AssetFormModal";
import { makeTooltip } from "@/components/charts/ChartTooltip";
import { axisProps, barRadius, chartTheme, hBarRadius } from "@/components/charts/theme";
import { PageHeader } from "@/components/layout/PageHeader";
import { AssetMap } from "@/components/map/AssetMap";
import { AlertStatusBadge, HealthBadge, InferenceModeBadge, RiskBadge, SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { HealthGauge } from "@/components/ui/HealthGauge";
import { PageSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useApi } from "@/hooks/useApi";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { Asset, RiskAnalysis } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatDate, formatScore, relativeTime } from "@/utils/format";
import { DEFECT_LABELS, SEVERITY_META, SEVERITY_ORDER } from "@/utils/status";

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-right text-ink">{children || "—"}</dd>
    </div>
  );
}

function RiskAnalysisCard({ analysis }: { analysis: RiskAnalysis }) {
  const impactColor = { high: "#ec835a", medium: "#fab219", low: "#74829a" };
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      <CardHeader
        icon={<BrainCircuit className="size-4 text-accent" />}
        title="AI risk analysis"
        subtitle={`System-generated · ${analysis.method}`}
        actions={<span className="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent uppercase">System generated</span>}
      />
      <div className="space-y-4 px-5 pb-5">
        {analysis.has_data && analysis.priority ? (
          <>
            <div className="flex items-center gap-4">
              <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-center">
                <p className="text-[10px] text-ink-3 uppercase">Risk score</p>
                <p className="text-2xl font-semibold text-ink tabular">{analysis.risk_score?.toFixed(0)}</p>
              </div>
              <div>
                <p className="text-[11px] text-ink-3">Recommended priority</p>
                <p className="text-base font-semibold text-ink">
                  <span className="mr-1.5 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs">{analysis.priority.code}</span>
                  {analysis.priority.label}
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-ink-2">
                  <CalendarClock className="size-3.5" aria-hidden /> Next inspection by {formatDate(analysis.recommended_next_inspection)}
                </p>
              </div>
            </div>
            <p className="text-sm text-ink-2">{analysis.summary}</p>
            <div>
              <p className="label-eyebrow mb-2">Contributing factors</p>
              <ul className="space-y-2">
                {analysis.factors.map((f) => (
                  <li key={f.label}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink">{f.label}</span>
                      <span className="text-ink-3 tabular">+{f.contribution.toFixed(1)}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, f.contribution * 3.5)}%`, background: impactColor[f.impact] }} />
                    </div>
                    <p className="mt-1 text-[11px] text-ink-3">{f.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-2">{analysis.summary}</p>
        )}
        <div>
          <p className="label-eyebrow mb-2">Suggested actions</p>
          <ul className="space-y-1.5">
            {analysis.recommendations.map((r) => (
              <li key={r} className="flex gap-2 text-xs text-ink-2">
                <Wrench className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </div>
        <p className="rounded-lg border border-line bg-surface-2/60 p-2.5 text-[11px] leading-relaxed text-ink-3">{analysis.disclaimer}</p>
      </div>
    </Card>
  );
}

const historyTooltip = makeTooltip({ format: (v) => `${Number(v).toFixed(1)} / 100` });
const defectTooltip = makeTooltip({ format: (v) => `${v} detections` });

export default function AssetDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { notify } = useToast();
  const asset = useApi((signal) => assetsApi.get(id, signal), [id]);
  const history = useApi((signal) => assetsApi.healthHistory(id, signal), [id]);
  const risk = useApi((signal) => assetsApi.riskAnalysis(id, signal), [id]);
  const defects = useApi((signal) => assetsApi.defectSummary(id, signal), [id]);
  const inspections = useApi((signal) => inspectionsApi.list({ asset: id, page_size: 50, ordering: "-inspection_date" }, signal), [id]);
  const alerts = useApi((signal) => alertsApi.list({ asset: id, page_size: 50 }, signal), [id]);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  useDocumentTitle(asset.data?.asset_name ?? "Asset");

  if (asset.loading && !asset.data) return <PageSkeleton />;
  if (asset.error) {
    return asset.error.status === 404 ? (
      <EmptyState title="Asset not found" description="It may have been deleted. Archived assets are listed under the Archived filter." action={<Link to="/app/assets"><Button>Back to assets</Button></Link>} className="mt-16" />
    ) : (
      <ErrorState message={asset.error.message} onRetry={asset.refetch} />
    );
  }
  const a = asset.data!;

  const toggleArchive = async () => {
    setBusy(true);
    try {
      const updated = a.is_archived ? await assetsApi.restore(a.id) : await assetsApi.archive(a.id);
      asset.setData(updated);
      notify(updated.is_archived ? "Asset archived" : "Asset restored", { level: "success" });
    } catch (err) {
      notify("Action failed", { level: "error", description: (err as ApiError).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await assetsApi.remove(a.id);
      notify("Asset deleted", { level: "success" });
      navigate("/app/assets");
    } catch (err) {
      notify("Delete failed", { level: "error", description: (err as ApiError).message });
      setBusy(false);
    }
  };

  const trend = risk.data?.trend_per_month;
  const bySeverity = SEVERITY_ORDER.map((s) => ({ severity: s, count: defects.data?.by_severity.find((r) => r.severity === s)?.count ?? 0 }));
  const byType = (defects.data?.by_type ?? []).map((r) => ({ ...r, label: DEFECT_LABELS[r.defect_type] ?? r.defect_type }));
  const hasCoords = a.latitude && a.longitude;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-ink-3">
        <Link to="/app/assets" className="hover:text-ink-2">Assets</Link>
        <ChevronRight className="size-3" />
        <span className="text-ink-2">{a.asset_code}</span>
      </nav>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {a.asset_name}
            {a.is_archived && <span className="rounded-md border border-line px-2 py-0.5 text-xs font-normal text-ink-3">Archived</span>}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{a.asset_code}</span>
            <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {a.location}{a.region ? ` · ${a.region}` : ""}</span>
            <span>{a.asset_type_display}</span>
          </span>
        }
        actions={
          <>
            {hasRole("INSPECTOR") && !a.is_archived && (
              <Link to={`/app/inspections/new?asset=${a.id}`}>
                <Button variant="primary" icon={<ScanSearch className="size-4" />}>New inspection</Button>
              </Link>
            )}
            {hasRole("ENGINEER") && (
              <>
                <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Edit</Button>
                <Button variant="outline" icon={a.is_archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} onClick={toggleArchive} loading={busy}>
                  {a.is_archived ? "Restore" : "Archive"}
                </Button>
              </>
            )}
            {hasRole("ADMINISTRATOR") && <Button variant="ghost" aria-label="Delete asset" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)} />}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Health overview" subtitle="Overall structural health from the latest completed AI inspection" />
            <div className="grid gap-5 px-5 pb-5 md:grid-cols-[auto_1fr]">
              <div className="flex flex-col items-center gap-3 md:border-r md:border-line md:pr-6">
                <HealthGauge score={a.current_health_score} size={132} />
                <div className="flex flex-wrap justify-center gap-1.5">
                  <HealthBadge status={a.health_status} />
                  <RiskBadge risk={a.risk_level} />
                </div>
                {trend !== undefined && trend !== null && (
                  <p className={cn("flex items-center gap-1 text-xs", trend < -0.5 ? "text-critical-ink" : trend > 0.5 ? "text-good-ink" : "text-ink-2")}>
                    {trend < 0 ? <TrendingDown className="size-3.5" /> : <TrendingUp className="size-3.5" />}
                    {trend > 0 ? "+" : ""}
                    {trend.toFixed(1)} pts / month
                  </p>
                )}
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs text-ink-3">Historical health trend</p>
                {history.data && history.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={history.data.map((h) => ({ ...h, date: formatDate(h.inspection_date) }))} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
                      <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                      <XAxis dataKey="date" {...axisProps} minTickGap={24} />
                      <YAxis domain={[0, 100]} {...axisProps} axisLine={false} width={40} />
                      <ReferenceLine y={75} stroke="#0ca30c" strokeOpacity={0.35} />
                      <ReferenceLine y={50} stroke="#d03b3b" strokeOpacity={0.35} />
                      <Tooltip content={historyTooltip} cursor={{ stroke: "#38bdf8", strokeOpacity: 0.3 }} />
                      <Line type="monotone" dataKey="overall_health_score" name="Health score" stroke={chartTheme.accent} strokeWidth={2} dot={{ r: 4, fill: chartTheme.accent, stroke: chartTheme.surface, strokeWidth: 2 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : history.loading ? (
                  <Skeleton className="h-[200px]" />
                ) : (
                  <EmptyState title="No completed inspections yet" className="py-8" />
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Inspection timeline" subtitle={`${inspections.data?.count ?? 0} inspections, newest first`} />
            <div className="px-5 pb-5">
              {inspections.data?.results.length ? (
                <ol className="relative space-y-1 border-l border-line pl-5">
                  {inspections.data.results.map((ins) => (
                    <li key={ins.id} className="relative">
                      <span className="absolute top-4 -left-[25px] size-2.5 rounded-full border-2 border-surface" style={{ background: ins.status === "COMPLETED" ? (ins.overall_health_score !== null && ins.overall_health_score < 50 ? "#d03b3b" : ins.overall_health_score !== null && ins.overall_health_score < 75 ? "#fab219" : "#0ca30c") : "#74829a" }} aria-hidden />
                      <Link to={`/app/inspections/${ins.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2.5 hover:bg-surface-2">
                        <div className="min-w-40">
                          <p className="text-sm font-medium text-ink">{formatDate(ins.inspection_date)}</p>
                          <p className="font-mono text-[11px] text-ink-3">{ins.reference} · {ins.inspection_type_display}</p>
                        </div>
                        <StatusBadge status={ins.status} />
                        {ins.status === "COMPLETED" && (
                          <>
                            <span className="text-sm text-ink-2 tabular">
                              Health <span className="font-semibold text-ink">{formatScore(ins.overall_health_score)}</span>
                            </span>
                            <span className="text-sm text-ink-2">{ins.defect_count} defects</span>
                            <SeverityBadge severity={ins.max_severity} />
                          </>
                        )}
                        <span className="ml-auto flex items-center gap-2">
                          <InferenceModeBadge mode={ins.inference_mode} compact />
                          <ChevronRight className="size-4 text-ink-3" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : inspections.loading ? (
                <Skeleton className="h-32" />
              ) : (
                <EmptyState title="No inspections recorded" description="Upload inspection imagery to generate the first AI assessment." />
              )}
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Defect history" subtitle={`${defects.data?.total ?? 0} AI detections across all inspections`} />
              <div className="px-3 pb-4">
                {byType.length ? (
                  <ResponsiveContainer width="100%" height={Math.max(160, byType.length * 34)}>
                    <BarChart data={byType} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                      <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} {...axisProps} />
                      <YAxis type="category" dataKey="label" {...axisProps} width={110} />
                      <Tooltip content={defectTooltip} cursor={{ fill: "rgb(148 163 184 / 0.06)" }} />
                      <Bar dataKey="count" name="Detections" fill={chartTheme.series[0]} radius={hBarRadius} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title="No defects recorded" className="py-8" />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Severity profile" subtitle="All detections by severity" />
              <div className="px-3 pb-4">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={bySeverity} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                    <XAxis dataKey="severity" tickFormatter={(s: string) => SEVERITY_META[s as keyof typeof SEVERITY_META].label} {...axisProps} />
                    <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
                    <Tooltip content={makeTooltip({ title: (l) => SEVERITY_META[l as keyof typeof SEVERITY_META]?.label ?? l, format: (v) => `${v} detections`, colorFor: (i) => SEVERITY_META[(i.payload?.severity as keyof typeof SEVERITY_META) ?? "LOW"].color })} cursor={{ fill: "rgb(148 163 184 / 0.06)" }} />
                    <Bar dataKey="count" name="Detections" radius={barRadius} maxBarSize={24}>
                      {bySeverity.map((row) => (
                        <Cell key={row.severity} fill={SEVERITY_META[row.severity].color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Maintenance history" subtitle="Alerts raised for this asset and how they were resolved" />
            <div className="px-5 pb-5">
              {alerts.data?.results.length ? (
                <ul className="divide-y divide-line">
                  {alerts.data.results.map((al) => (
                    <li key={al.id} className="flex flex-wrap items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{al.title}</p>
                        <p className="text-[11px] text-ink-3">
                          <span className="font-mono">{al.reference}</span> · {al.alert_type_display} · raised {formatDate(al.created_at)}
                          {al.resolved_at ? ` · resolved ${formatDate(al.resolved_at)}${al.resolved_by_name ? ` by ${al.resolved_by_name}` : ""}` : ""}
                        </p>
                        {al.resolution_notes && <p className="mt-1 text-xs text-ink-2">“{al.resolution_notes}”</p>}
                      </div>
                      <SeverityBadge severity={al.severity} />
                      <AlertStatusBadge status={al.status} />
                    </li>
                  ))}
                </ul>
              ) : alerts.loading ? (
                <Skeleton className="h-24" />
              ) : (
                <EmptyState title="No maintenance alerts" description="No findings have required maintenance for this asset." />
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Asset information" />
            <dl className="divide-y divide-line px-5 pb-3">
              <Info label="Asset ID">{<span className="font-mono">{a.asset_code}</span>}</Info>
              <Info label="Type">{a.asset_type_display}</Info>
              <Info label="Material">{a.material_type_display}</Info>
              <Info label="Structural system">{a.structural_system}</Info>
              <Info label="Dimensions">{a.dimensions}</Info>
              <Info label="Installed">{a.installation_date ? `${formatDate(a.installation_date)} (${a.age_years} yrs)` : ""}</Info>
              <Info label="Operator">{a.operator}</Info>
              <Info label="Inspection interval">{`${a.inspection_interval_days} days`}</Info>
              <Info label="Last inspection">{a.last_inspection_at ? `${formatDate(a.last_inspection_at)} (${relativeTime(a.last_inspection_at)})` : ""}</Info>
              <Info label="Coordinates">{hasCoords ? <span className="font-mono text-xs">{Number(a.latitude).toFixed(4)}, {Number(a.longitude).toFixed(4)}</span> : ""}</Info>
            </dl>
            {a.description && <p className="border-t border-line px-5 py-3 text-xs text-ink-2">{a.description}</p>}
          </Card>
          {risk.data ? <RiskAnalysisCard analysis={risk.data} /> : risk.error ? <ErrorState message={risk.error.message} onRetry={risk.refetch} compact /> : <Skeleton className="h-96" />}
          {hasCoords && (
            <Card>
              <CardHeader title="Location" subtitle={a.location} />
              <div className="px-4 pb-4">
                <AssetMap
                  height={220}
                  interactive={false}
                  markers={[{ ...a, latitude: a.latitude!, longitude: a.longitude! } as Asset & { latitude: string; longitude: string }]}
                />
              </div>
            </Card>
          )}
        </div>
      </div>

      <AssetFormModal open={editing} asset={a} onClose={() => setEditing(false)} onSaved={(updated) => asset.setData(updated)} />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete asset permanently?"
        message={<>This permanently deletes <strong className="text-ink">{a.asset_name}</strong> with all inspections, imagery and alerts. Archiving is recommended instead.</>}
        confirmLabel="Delete asset"
        destructive
        loading={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </>
  );
}
