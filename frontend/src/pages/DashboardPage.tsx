import { AlertTriangle, ArrowRight, BellRing, Building2, OctagonAlert, RefreshCw, ScanSearch, ShieldCheck } from "lucide-react";
import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

import { analyticsApi, assetsApi } from "@/api/endpoints";
import { AlertCard } from "@/components/alerts/AlertCard";
import { HealthDonut } from "@/components/dashboard/HealthDonut";
import { HealthTrendChart } from "@/components/dashboard/HealthTrendChart";
import { ModelStatusCard } from "@/components/dashboard/ModelStatusCard";
import { ProcessingQueue } from "@/components/dashboard/ProcessingQueue";
import { PageHeader } from "@/components/layout/PageHeader";
import { AssetMap } from "@/components/map/AssetMap";
import { InferenceModeBadge, SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ChartCard } from "@/components/ui/ChartCard";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useRealtimeEvents } from "@/contexts/RealtimeContext";
import { useApi } from "@/hooks/useApi";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useInterval } from "@/hooks/useInterval";
import type { DashboardData } from "@/types/api";
import { formatDate, formatScore, relativeTime } from "@/utils/format";
import { healthColor, STATUS_COLORS } from "@/utils/status";

type RecentRow = DashboardData["recent_inspections"][number];

export default function DashboardPage() {
  useDocumentTitle("Dashboard");
  const navigate = useNavigate();
  const dashboard = useApi((signal) => analyticsApi.dashboard(signal), []);
  const markers = useApi((signal) => assetsApi.map(undefined, signal), []);
  const refetchTimer = useRef<number | undefined>(undefined);

  // Debounced refresh when inspections change state anywhere on the platform.
  useRealtimeEvents((event) => {
    if (event.type === "inspection.update" && event.kind === "stage") return;
    window.clearTimeout(refetchTimer.current);
    refetchTimer.current = window.setTimeout(() => {
      void dashboard.refetch();
      void markers.refetch();
    }, 800);
  });
  useInterval(() => void dashboard.refetch(), 60_000);

  if (dashboard.loading && !dashboard.data) return <PageSkeleton />;
  if (dashboard.error && !dashboard.data) return <ErrorState message={dashboard.error.message} onRetry={dashboard.refetch} />;
  const data = dashboard.data!;
  const k = data.kpis;
  const demoShare = data.demo_data.completed_inspections ? data.demo_data.demo_inspections / data.demo_data.completed_inspections : 0;

  const columns: Column<RecentRow>[] = [
    {
      key: "asset",
      header: "Asset",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{r.asset_name}</p>
          <p className="text-[11px] text-ink-3">
            <span className="font-mono">{r.reference}</span> · {formatDate(r.inspection_date)}
          </p>
        </div>
      ),
    },
    {
      key: "health",
      header: "Health",
      align: "right",
      render: (r) => (
        <span className="font-semibold tabular" style={{ color: healthColor(r.overall_health_score) }}>
          {formatScore(r.overall_health_score)}
        </span>
      ),
    },
    { key: "defects", header: "Defects", align: "right", render: (r) => <span className="text-ink tabular">{r.status === "COMPLETED" ? r.defect_count : "—"}</span>, hideBelow: "sm" },
    { key: "severity", header: "Severity", render: (r) => (r.status === "COMPLETED" ? <SeverityBadge severity={r.max_severity} /> : <span className="text-ink-3">—</span>) },
    {
      key: "status",
      header: "Processing",
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <StatusBadge status={r.status} />
          {r.inference_mode === "demo" && <InferenceModeBadge mode="demo" compact />}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<span className="text-accent">Operations overview</span>}
        title="Predictive Infrastructure Monitoring"
        subtitle="AI-powered structural inspection, anomaly detection and maintenance intelligence."
        actions={
          <>
            <span className="text-xs text-ink-3">Updated {relativeTime(data.generated_at)}</span>
            <Button size="sm" variant="outline" onClick={() => void dashboard.refetch()} loading={dashboard.refreshing} icon={<RefreshCw className="size-3.5" />}>
              Refresh
            </Button>
          </>
        }
      />

      {demoShare > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warn/25 bg-warn/[0.06] px-4 py-3 text-sm">
          <InferenceModeBadge mode="demo" compact />
          <p className="text-ink-2">
            {Math.round(demoShare * 100)}% of completed inspections were produced by the <strong className="text-ink">demo heuristic detector</strong> on seeded or uploaded imagery. Treat these results as demonstration data, not engineering findings.
          </p>
        </div>
      )}

      <section aria-label="Key indicators" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total assets" value={k.total_assets} icon={<Building2 className="size-4" />} footnote={`${k.new_assets_this_month} added this month`} />
        <KpiCard label="Healthy assets" value={k.healthy_assets} icon={<ShieldCheck className="size-4" />} accent={STATUS_COLORS.good} footnote={`${k.total_assets ? Math.round((k.healthy_assets / k.total_assets) * 100) : 0}% of portfolio`} />
        <KpiCard label="At-risk assets" value={k.at_risk_assets} icon={<AlertTriangle className="size-4" />} accent={STATUS_COLORS.warn} footnote="Warning health band" />
        <KpiCard label="Critical assets" value={k.critical_assets} icon={<OctagonAlert className="size-4" />} accent={STATUS_COLORS.critical} footnote="Below critical threshold" />
        <KpiCard label="Inspections this month" value={k.inspections_this_month} icon={<ScanSearch className="size-4" />} delta={k.inspections_change_pct} deltaLabel="vs last month" />
        <KpiCard label="Active alerts" value={k.active_alerts} icon={<BellRing className="size-4" />} accent={STATUS_COLORS.serious} delta={k.alerts_change_pct} goodWhen="down" deltaLabel="new, 7d vs prior" />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-3">
        <ChartCard title="Asset health overview" subtitle="Current condition band of every inspected asset" height={200}>
          <HealthDonut data={data.health_distribution} uninspected={k.uninspected_assets} />
        </ChartCard>
        <ChartCard
          className="xl:col-span-2"
          title="Asset health trend"
          subtitle={`Fleet health index — mean of each asset's latest score, by month${k.average_health_delta !== null ? ` · ${k.average_health_delta > 0 ? "+" : ""}${k.average_health_delta} pts this month` : ""}`}
          refreshing={dashboard.refreshing}
        >
          <HealthTrendChart data={data.health_trend} />
        </ChartCard>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent inspections"
            subtitle="Latest AI inspection activity across the portfolio"
            actions={
              <Link to="/app/inspections" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                View all <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <DataTable
            rows={data.recent_inspections}
            columns={columns}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/app/inspections/${r.id}`)}
            refreshing={dashboard.refreshing}
            emptyTitle="No inspections yet"
            caption="Recent inspections"
            dense
          />
        </Card>
        <Card>
          <CardHeader
            title="Critical maintenance alerts"
            subtitle="Unresolved high and critical findings"
            actions={
              <Link to="/app/alerts?severity=CRITICAL&severity=HIGH&active=true" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                Alert center <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="space-y-2 px-4 pb-4">
            {data.critical_alerts.length === 0 ? (
              <EmptyState title="No urgent alerts" description="No unresolved high or critical findings." />
            ) : (
              data.critical_alerts.map((a) => (
                <AlertCard key={a.id} id={a.id} reference={a.reference} title={a.title} severity={a.severity} status={a.status} createdAt={a.created_at} assetId={a.asset_id} assetName={a.asset_name} inspectionReference={a.inspection_reference} />
              ))
            )}
          </div>
        </Card>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="flex flex-col xl:col-span-2">
          <CardHeader
            title="Infrastructure map"
            subtitle="Assets coloured by health band — select a marker for details"
            actions={
              <Link to="/app/map" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                Full map <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="flex min-h-[380px] flex-1 flex-col px-4 pb-4">
            {markers.data ? <AssetMap markers={markers.data} height="100%" interactive={false} /> : <div className="flex-1 animate-pulse rounded-lg bg-surface-2" />}
          </div>
        </Card>
        <div className="grid gap-5">
          <Card>
            <CardHeader title="Inspection processing queue" subtitle="Celery / Redis pipeline status" />
            <div className="px-4 pb-4">
              <ProcessingQueue counts={data.processing_queue} />
            </div>
          </Card>
          <Card>
            <CardHeader title="AI model status" subtitle="Model currently serving the ML worker" />
            <div className="px-4 pb-4">
              <ModelStatusCard model={data.model_status} />
            </div>
          </Card>
        </div>
      </section>
    </>
  );
}
