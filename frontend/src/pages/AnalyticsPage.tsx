import { Activity, Clock3, Gauge, ScanSearch, Timer, Wrench } from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link, useSearchParams } from "react-router-dom";

import { analyticsApi, assetsApi } from "@/api/endpoints";
import { makeTooltip } from "@/components/charts/ChartTooltip";
import { ChartLegend } from "@/components/charts/Legend";
import { axisProps, barRadius, chartTheme, hBarRadius } from "@/components/charts/theme";
import { HealthTrendChart } from "@/components/dashboard/HealthTrendChart";
import { ChipSelect, FilterBar } from "@/components/filters/FilterBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { InferenceModeBadge, RiskBadge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { ChartCard } from "@/components/ui/ChartCard";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, Select } from "@/components/ui/Field";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useMeta } from "@/contexts/MetaContext";
import { useApi } from "@/hooks/useApi";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { formatDuration, formatMonth, formatNumber, formatPercent, formatScore } from "@/utils/format";
import { ASSET_TYPE_LABELS, healthColor, RISK_META, SEVERITY_META, STATUS_COLORS } from "@/utils/status";

type Preset = "90d" | "6m" | "12m" | "custom";
const PRESET_DAYS: Record<Exclude<Preset, "custom">, number> = { "90d": 90, "6m": 182, "12m": 365 };

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const monthTick = (v: string) => formatMonth(v);
const monthTitle = (l: string) => formatMonth(l);
const cursorFill = { fill: "rgb(148 163 184 / 0.06)" };

export default function AnalyticsPage() {
  useDocumentTitle("Analytics");
  const { meta } = useMeta();
  const [params, setParams] = useSearchParams();
  const assets = useApi((signal) => assetsApi.options(signal), []);

  const preset = (params.get("range") as Preset) ?? "12m";
  const customFrom = params.get("date_from") ?? "";
  const customTo = params.get("date_to") ?? "";
  const asset = params.get("asset") ?? "";
  const assetTypes = params.getAll("asset_type");
  const defectTypes = params.getAll("defect_type");
  const severities = params.getAll("severity");

  const update = (changes: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key);
      if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
      else if (value) next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const query = useMemo(() => {
    const today = new Date();
    const from = preset === "custom" ? customFrom : isoDate(new Date(today.getTime() - PRESET_DAYS[preset] * 86400000));
    const to = preset === "custom" ? customTo : isoDate(today);
    return { date_from: from, date_to: to, asset, asset_type: assetTypes, defect_type: defectTypes, severity: severities };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()]);

  const analytics = useApi((signal) => analyticsApi.analytics(query, signal), [query]);
  const data = analytics.data;
  const activeFilters = (asset ? 1 : 0) + assetTypes.length + defectTypes.length + severities.length + (preset !== "12m" ? 1 : 0);

  if (analytics.loading && !data) return <PageSkeleton />;
  if (analytics.error && !data) return <ErrorState message={analytics.error.message} onRetry={analytics.refetch} />;
  const d = data!;
  const r = analytics.refreshing;

  return (
    <>
      <PageHeader eyebrow="Portfolio analytics" title="Analytics" subtitle="Structural health, defect patterns, AI performance and maintenance throughput across the asset portfolio." />

      <Card className="mb-5 p-3">
        <FilterBar active={activeFilters} onReset={() => setParams(new URLSearchParams(), { replace: true })}>
          <Tabs<Preset>
            value={preset}
            onChange={(v) => update({ range: v === "12m" ? null : v })}
            items={[
              { value: "90d", label: "Last 90 days" },
              { value: "6m", label: "6 months" },
              { value: "12m", label: "12 months" },
              { value: "custom", label: "Custom" },
            ]}
            className="h-9 items-center"
          />
          {preset === "custom" && (
            <>
              <Input aria-label="From date" type="date" value={customFrom} onChange={(e) => update({ date_from: e.target.value || null })} wrapperClassName="w-40" />
              <Input aria-label="To date" type="date" value={customTo} onChange={(e) => update({ date_to: e.target.value || null })} wrapperClassName="w-40" />
            </>
          )}
          <Select aria-label="Asset" value={asset} onChange={(e) => update({ asset: e.target.value || null })} options={(assets.data ?? []).map((a) => ({ value: String(a.id), label: a.asset_name }))} placeholder="All assets" wrapperClassName="w-56" />
        </FilterBar>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3">
          <ChipSelect label="Asset type" options={(meta?.asset_types ?? []).map((c) => ({ value: c.value, label: c.label }))} value={assetTypes} onChange={(v) => update({ asset_type: v })} />
          <ChipSelect label="Severity" options={Object.entries(SEVERITY_META).map(([value, m]) => ({ value, label: m.label, color: m.color }))} value={severities} onChange={(v) => update({ severity: v })} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          <ChipSelect label="Defect type" options={(meta?.defect_types ?? []).map((c) => ({ value: c.value, label: c.label }))} value={defectTypes} onChange={(v) => update({ defect_type: v })} />
        </div>
      </Card>

      {d.totals.demo_inspections > 0 && (
        <p className="mb-4 flex items-center gap-2 text-xs text-ink-3">
          <InferenceModeBadge mode="demo" compact /> {d.totals.demo_inspections} of {d.totals.inspections} inspections in this range use demo inference; AI metrics below describe the demo detector.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Inspections" value={formatNumber(d.totals.inspections)} icon={<ScanSearch className="size-4" />} footnote={`${d.totals.completed_inspections} completed`} />
        <KpiCard label="AI detections" value={formatNumber(d.totals.detections)} icon={<Activity className="size-4" />} footnote="Excludes rejected" />
        <KpiCard label="Average AI confidence" value={formatPercent(d.totals.avg_confidence)} icon={<Gauge className="size-4" />} footnote="All detections" />
        <KpiCard label="Avg. processing time" value={formatDuration(d.totals.avg_processing_time)} icon={<Timer className="size-4" />} footnote="Per inspection" />
        <KpiCard
          label="Mean time to resolve"
          value={d.totals.mean_time_to_resolve_hours !== null ? `${(d.totals.mean_time_to_resolve_hours / 24).toFixed(1)} d` : "—"}
          icon={<Wrench className="size-4" />}
          accent={STATUS_COLORS.good}
          footnote={`${d.totals.alerts_resolved} of ${d.totals.alerts_opened} alerts resolved`}
        />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Asset health trends" subtitle="Fleet health index (mean latest score per asset), monthly" refreshing={r}>
          <HealthTrendChart data={d.health_trend} height={280} />
        </ChartCard>
        <ChartCard title="Asset risk distribution" subtitle="Current risk level of assets in scope" refreshing={r}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={d.risk_distribution} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="risk_level" tickFormatter={(v: string) => RISK_META[v as keyof typeof RISK_META]?.label.replace(" risk", "") ?? v} {...axisProps} />
              <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
              <Tooltip cursor={cursorFill} content={makeTooltip({ title: (l) => RISK_META[l as keyof typeof RISK_META]?.label ?? l, format: (v) => `${v} assets`, colorFor: (i) => RISK_META[i.payload?.risk_level as keyof typeof RISK_META]?.color })} />
              <Bar dataKey="count" name="Assets" radius={barRadius} maxBarSize={24}>
                {d.risk_distribution.map((row) => (
                  <Cell key={row.risk_level} fill={RISK_META[row.risk_level].color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <ChartCard title="Defects by type" subtitle="Detections in range (one hue: magnitude)" refreshing={r}>
          <ResponsiveContainer width="100%" height={Math.max(240, d.defects_by_type.length * 36)}>
            <BarChart data={d.defects_by_type} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} {...axisProps} />
              <YAxis type="category" dataKey="label" {...axisProps} width={124} />
              <Tooltip cursor={cursorFill} content={makeTooltip({ format: (v) => `${v} detections` })} />
              <Bar dataKey="count" name="Detections" fill={chartTheme.series[0]} radius={hBarRadius} maxBarSize={20} label={{ position: "right", fill: "#a7b3c7", fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Defects by severity" subtitle="Severity mix of detections in range" refreshing={r}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={d.defects_by_severity} margin={{ top: 16, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="severity" tickFormatter={(v: string) => SEVERITY_META[v as keyof typeof SEVERITY_META]?.label ?? v} {...axisProps} />
              <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
              <Tooltip cursor={cursorFill} content={makeTooltip({ title: (l) => SEVERITY_META[l as keyof typeof SEVERITY_META]?.label ?? l, format: (v) => `${v} detections`, colorFor: (i) => SEVERITY_META[i.payload?.severity as keyof typeof SEVERITY_META]?.color })} />
              <Bar dataKey="count" name="Detections" radius={barRadius} maxBarSize={24} label={{ position: "top", fill: "#a7b3c7", fontSize: 11 }}>
                {d.defects_by_severity.map((row) => (
                  <Cell key={row.severity} fill={SEVERITY_META[row.severity].color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Inspections per month"
          subtitle="Completed and failed AI inspections"
          legend={<ChartLegend items={[{ label: "Completed", color: chartTheme.series[0] }, { label: "Failed", color: STATUS_COLORS.critical }]} />}
          refreshing={r}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={d.inspections_per_month} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="month" tickFormatter={monthTick} {...axisProps} minTickGap={12} />
              <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
              <Tooltip cursor={cursorFill} content={makeTooltip({ title: monthTitle })} />
              <Bar dataKey="completed" name="Completed" stackId="a" fill={chartTheme.series[0]} maxBarSize={24} stroke={chartTheme.surface} strokeWidth={1} />
              <Bar dataKey="failed" name="Failed" stackId="a" fill={STATUS_COLORS.critical} radius={barRadius} maxBarSize={24} stroke={chartTheme.surface} strokeWidth={1} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard
          title="Critical incidents"
          subtitle="High and critical severity detections per month"
          legend={<ChartLegend items={[{ label: "Critical", color: STATUS_COLORS.critical }, { label: "High", color: STATUS_COLORS.serious }]} />}
          refreshing={r}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={d.critical_incidents} margin={{ top: 8, right: 12, left: -16, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="month" tickFormatter={monthTick} {...axisProps} minTickGap={12} />
              <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
              <Tooltip cursor={cursorFill} content={makeTooltip({ title: monthTitle })} />
              <Bar dataKey="critical" name="Critical" fill={STATUS_COLORS.critical} radius={barRadius} maxBarSize={14} />
              <Bar dataKey="high" name="High" fill={STATUS_COLORS.serious} radius={barRadius} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-3">
        <ChartCard title="Average AI confidence" subtitle="Mean detection confidence per month" refreshing={r}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={d.confidence_trend} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="month" tickFormatter={monthTick} {...axisProps} minTickGap={16} />
              <YAxis domain={[0.5, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} {...axisProps} axisLine={false} width={52} />
              <Tooltip cursor={{ stroke: chartTheme.accent, strokeOpacity: 0.3 }} content={makeTooltip({ title: monthTitle, format: (v) => (v === null || v === undefined ? "—" : formatPercent(Number(v))) })} />
              <Line type="monotone" dataKey="avg_confidence" name="Avg. confidence" stroke={chartTheme.series[2]} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, stroke: chartTheme.surface, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Model processing time" subtitle="Average seconds per completed inspection" refreshing={r}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={d.processing_time} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="month" tickFormatter={monthTick} {...axisProps} minTickGap={16} />
              <YAxis tickFormatter={(v: number) => `${v}s`} {...axisProps} axisLine={false} width={40} />
              <Tooltip cursor={{ stroke: chartTheme.accent, strokeOpacity: 0.3 }} content={makeTooltip({ title: monthTitle, format: (v) => formatDuration(v === null || v === undefined ? null : Number(v)) })} />
              <Line type="monotone" dataKey="avg_seconds" name="Avg. processing" stroke={chartTheme.series[0]} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, stroke: chartTheme.surface, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard
          title="Maintenance trends"
          subtitle="Alerts opened vs resolved per month"
          legend={<ChartLegend shape="line" items={[{ label: "Opened", color: chartTheme.series[1] }, { label: "Resolved", color: chartTheme.series[0] }]} />}
          refreshing={r}
          height={200}
        >
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={d.maintenance_trend} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="month" tickFormatter={monthTick} {...axisProps} minTickGap={16} />
              <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
              <Tooltip cursor={{ stroke: chartTheme.accent, strokeOpacity: 0.3 }} content={makeTooltip({ title: monthTitle })} />
              <Line type="linear" dataKey="opened" name="Opened" stroke={chartTheme.series[1]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: chartTheme.surface, strokeWidth: 2 }} />
              <Line type="linear" dataKey="resolved" name="Resolved" stroke={chartTheme.series[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: chartTheme.surface, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <ChartCard title="Health by asset type" subtitle="Average current health score" refreshing={r}>
          <ResponsiveContainer width="100%" height={Math.max(220, d.health_by_asset_type.length * 34)}>
            <BarChart data={d.health_by_asset_type.map((row) => ({ ...row, label: ASSET_TYPE_LABELS[row.asset_type] ?? row.asset_type }))} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} {...axisProps} />
              <YAxis type="category" dataKey="label" {...axisProps} width={84} />
              <Tooltip cursor={cursorFill} content={makeTooltip({ format: (v) => `${formatScore(Number(v))} / 100`, colorFor: (i) => healthColor(i.payload?.avg_health) })} />
              <Bar dataKey="avg_health" name="Avg. health" radius={hBarRadius} maxBarSize={18}>
                {d.health_by_asset_type.map((row) => (
                  <Cell key={row.asset_type} fill={healthColor(row.avg_health)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <Card>
          <CardHeader title="Highest-risk assets" subtitle="Lowest current health in scope" icon={<Clock3 className="size-4" />} />
          <ul className="divide-y divide-line px-5 pb-3">
            {d.top_risk_assets.map((a) => (
              <li key={a.id}>
                <Link to={`/app/assets/${a.id}`} className="flex items-center gap-3 py-2.5 hover:text-accent">
                  <span className="w-9 text-lg font-semibold tabular" style={{ color: healthColor(a.current_health_score) }}>
                    {formatScore(a.current_health_score)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{a.asset_name}</span>
                    <span className="block text-[11px] text-ink-3">
                      <span className="font-mono">{a.asset_code}</span> · {ASSET_TYPE_LABELS[a.asset_type] ?? a.asset_type}
                    </span>
                  </span>
                  <RiskBadge risk={a.risk_level} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </>
  );
}
