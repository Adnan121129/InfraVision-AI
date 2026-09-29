import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { inspectionsApi } from "@/api/endpoints";
import { ChipSelect, FilterBar } from "@/components/filters/FilterBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { InferenceModeBadge, SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Input, Select } from "@/components/ui/Field";
import { Pagination } from "@/components/ui/Pagination";
import { useAuth } from "@/contexts/AuthContext";
import { useMeta } from "@/contexts/MetaContext";
import { useRealtime, useRealtimeEvents } from "@/contexts/RealtimeContext";
import { useApi } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useInterval } from "@/hooks/useInterval";
import type { InspectionListItem } from "@/types/api";
import { formatDate, formatDuration, formatScore } from "@/utils/format";
import { healthColor, INSPECTION_STATUS_META, SEVERITY_META } from "@/utils/status";

const PAGE_SIZE = 25;

export default function InspectionsPage() {
  useDocumentTitle("Inspections");
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { meta } = useMeta();
  const { state } = useRealtime();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const debounced = useDebounce(search, 350);

  const statuses = params.getAll("status");
  const severities = params.getAll("max_severity");
  const type = params.get("inspection_type") ?? "";
  const mode = params.get("inference_mode") ?? "";
  const from = params.get("date_from") ?? "";
  const to = params.get("date_to") ?? "";
  const ordering = params.get("ordering") ?? "-inspection_date";
  const page = Number(params.get("page") ?? 1);
  const urlSearch = params.get("search") ?? "";

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

  useEffect(() => {
    if (debounced !== urlSearch) update({ search: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const query = useMemo(
    () => ({ search: urlSearch, status: statuses, max_severity: severities, inspection_type: type, inference_mode: mode, date_from: from, date_to: to, ordering, page, page_size: PAGE_SIZE }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.toString()],
  );
  const list = useApi((signal) => inspectionsApi.list(query, signal), [query]);

  // Patch rows in place from realtime events; refetch shortly after terminal transitions.
  const refetchTimer = useRef<number | undefined>(undefined);
  useRealtimeEvents((event) => {
    if (event.type !== "inspection.update") return;
    list.setData((prev) =>
      prev
        ? {
            ...prev,
            results: prev.results.map((row) =>
              row.id === event.inspection.id
                ? { ...row, status: event.inspection.status, processing_stage: event.inspection.processing_stage, defect_count: event.inspection.defect_count, overall_health_score: event.inspection.overall_health_score, max_severity: event.inspection.max_severity }
                : row,
            ),
          }
        : prev!,
    );
    if (event.kind === "completed" || event.kind === "failed" || event.kind === "queued") {
      window.clearTimeout(refetchTimer.current);
      refetchTimer.current = window.setTimeout(() => void list.refetch(), 700);
    }
  });
  const hasActive = list.data?.results.some((r) => r.status === "QUEUED" || r.status === "PROCESSING");
  useInterval(() => void list.refetch(), hasActive && state !== "open" ? 5000 : null);

  const activeFilters = statuses.length + severities.length + (type ? 1 : 0) + (mode ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0) + (urlSearch ? 1 : 0);

  const columns: Column<InspectionListItem>[] = [
    { key: "ref", header: "Inspection ID", sortKey: "reference", render: (r) => <span className="font-mono text-xs text-ink">{r.reference}</span> },
    {
      key: "asset",
      header: "Asset",
      render: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          {r.thumbnail_url ? <img src={r.thumbnail_url} alt="" loading="lazy" className="size-9 shrink-0 rounded-md border border-line object-cover" /> : <span className="size-9 shrink-0 rounded-md border border-line bg-surface-2" />}
          <div className="min-w-0">
            <p className="max-w-52 truncate font-medium text-ink">{r.asset_name}</p>
            <p className="text-[11px] text-ink-3">{r.inspection_type_display}</p>
          </div>
        </div>
      ),
    },
    { key: "date", header: "Date", sortKey: "inspection_date", render: (r) => <span className="whitespace-nowrap">{formatDate(r.inspection_date)}</span> },
    { key: "status", header: "Status", sortKey: "status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "health",
      header: "Health",
      sortKey: "overall_health_score",
      align: "right",
      render: (r) => (
        <span className="font-semibold" style={{ color: healthColor(r.overall_health_score) }}>
          {formatScore(r.overall_health_score)}
        </span>
      ),
    },
    { key: "defects", header: "Defects", sortKey: "defect_count", align: "right", render: (r) => (r.status === "COMPLETED" ? <span className="text-ink">{r.defect_count}</span> : "—") },
    { key: "severity", header: "Severity", render: (r) => (r.status === "COMPLETED" ? <SeverityBadge severity={r.max_severity} /> : <span className="text-ink-3">—</span>) },
    { key: "inspector", header: "Inspector", hideBelow: "lg", render: (r) => <span className="whitespace-nowrap">{r.inspector_name ?? "—"}</span> },
    {
      key: "model",
      header: "AI model",
      hideBelow: "xl",
      render: (r) =>
        r.model_version ? (
          <span className="flex items-center gap-1.5">
            <span className="max-w-40 truncate text-xs">{r.model_version}</span>
            <InferenceModeBadge mode={r.inference_mode} compact />
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    { key: "time", header: "Processing", sortKey: "processing_time", align: "right", hideBelow: "md", render: (r) => formatDuration(r.processing_time) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Inspection history"
        title="Inspections"
        subtitle="Every AI inspection with its processing status, structural health outcome and model provenance."
        actions={
          hasRole("INSPECTOR") && (
            <Link to="/app/inspections/new">
              <Button variant="primary" icon={<Plus className="size-4" />}>New inspection</Button>
            </Link>
          )
        }
      />
      <Card className="mb-4 p-3">
        <FilterBar active={activeFilters} onReset={() => { setSearch(""); setParams(new URLSearchParams(), { replace: true }); }}>
          <Input aria-label="Search inspections" placeholder="Search ID, asset, notes…" value={search} onChange={(e) => setSearch(e.target.value)} leading={<Search className="size-4" />} wrapperClassName="w-full sm:w-60" />
          <Select aria-label="Inspection type" value={type} onChange={(e) => update({ inspection_type: e.target.value || null })} options={meta?.inspection_types ?? []} placeholder="All types" wrapperClassName="w-44" />
          <Select aria-label="Inference mode" value={mode} onChange={(e) => update({ inference_mode: e.target.value || null })} options={[{ value: "production", label: "Production model" }, { value: "demo", label: "Demo inference" }]} placeholder="Any inference mode" wrapperClassName="w-44" />
          <Input aria-label="From date" type="date" value={from} onChange={(e) => update({ date_from: e.target.value || null })} wrapperClassName="w-40" />
          <Input aria-label="To date" type="date" value={to} onChange={(e) => update({ date_to: e.target.value || null })} wrapperClassName="w-40" />
        </FilterBar>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3">
          <ChipSelect label="Status" options={Object.entries(INSPECTION_STATUS_META).map(([value, m]) => ({ value, label: m.label, color: m.color }))} value={statuses} onChange={(v) => update({ status: v })} />
          <ChipSelect label="Severity" options={Object.entries(SEVERITY_META).map(([value, m]) => ({ value, label: m.label, color: m.color }))} value={severities} onChange={(v) => update({ max_severity: v })} />
        </div>
      </Card>
      <Card>
        <DataTable
          rows={list.data?.results}
          columns={columns}
          rowKey={(r) => r.id}
          loading={list.loading}
          refreshing={list.refreshing}
          error={list.error?.message}
          onRetry={list.refetch}
          onRowClick={(r) => navigate(`/app/inspections/${r.id}`)}
          ordering={ordering}
          onOrderingChange={(o) => update({ ordering: o })}
          emptyTitle="No inspections found"
          emptyDescription="Try different filters, or run a new AI inspection."
          caption="Inspections"
        />
        {list.data && <Pagination page={list.data.page} totalPages={list.data.total_pages} count={list.data.count} pageSize={PAGE_SIZE} onPageChange={(p) => update({ page: String(p) })} />}
      </Card>
    </>
  );
}
