import { Archive, BellRing, LayoutGrid, MapPin, Plus, Rows3, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { assetsApi } from "@/api/endpoints";
import { AssetFormModal } from "@/components/assets/AssetFormModal";
import { ChipSelect, FilterBar } from "@/components/filters/FilterBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { HealthBadge, RiskBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, Select } from "@/components/ui/Field";
import { Pagination } from "@/components/ui/Pagination";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useMeta } from "@/contexts/MetaContext";
import { useApi } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { Asset } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatDate, formatScore, relativeTime } from "@/utils/format";
import { healthColor, RISK_META } from "@/utils/status";

const PAGE_SIZE = 20;
type View = "table" | "cards";

function HealthCell({ score }: { score: number | null }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-surface-3 xl:block" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${score ?? 0}%`, background: healthColor(score) }} />
      </div>
      <span className="w-7 text-right font-semibold tabular" style={{ color: healthColor(score) }}>
        {formatScore(score)}
      </span>
    </div>
  );
}

export default function AssetsPage() {
  useDocumentTitle("Assets");
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { meta } = useMeta();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const debouncedSearch = useDebounce(search, 350);
  const [view, setView] = useState<View>("table");
  const [creating, setCreating] = useState(false);

  const assetTypes = params.getAll("asset_type");
  const risk = params.getAll("risk_level");
  const material = params.get("material_type") ?? "";
  const ordering = params.get("ordering") ?? "asset_name";
  const page = Number(params.get("page") ?? 1);
  const archived = params.get("archived") === "true";

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

  const urlSearch = params.get("search") ?? "";
  useEffect(() => setSearch(urlSearch), [urlSearch]); // external navigation (e.g. top-bar search)
  useEffect(() => {
    if (debouncedSearch !== urlSearch) update({ search: debouncedSearch || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const query = useMemo(
    () => ({
      search: urlSearch,
      asset_type: assetTypes,
      risk_level: risk,
      material_type: material,
      ordering,
      page,
      page_size: PAGE_SIZE,
      archived: archived ? "true" : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.toString()],
  );
  const assets = useApi((signal) => assetsApi.list(query, signal), [query]);

  const activeFilters = assetTypes.length + risk.length + (material ? 1 : 0) + (archived ? 1 : 0) + (urlSearch ? 1 : 0);

  const columns: Column<Asset>[] = [
    {
      key: "name",
      header: "Asset",
      sortKey: "asset_name",
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{a.asset_name}</p>
          <p className="font-mono text-[11px] text-ink-3">{a.asset_code}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      sortKey: "asset_type",
      render: (a) => (
        <div className="min-w-0">
          <p className="text-ink-2">{a.asset_type_display}</p>
          <p className="truncate text-[11px] text-ink-3">{a.material_type_display}</p>
        </div>
      ),
    },
    {
      key: "location",
      header: "Location",
      hideBelow: "xl",
      render: (a) => (
        <span className="flex items-center gap-1 whitespace-nowrap">
          <MapPin className="size-3.5 text-ink-3" aria-hidden />
          {a.location}
        </span>
      ),
    },
    { key: "health", header: "Health", sortKey: "current_health_score", align: "right", render: (a) => <HealthCell score={a.current_health_score} /> },
    { key: "risk", header: "Risk", sortKey: "risk_level", render: (a) => <RiskBadge risk={a.risk_level} /> },
    { key: "last", header: "Last inspection", sortKey: "last_inspection_at", hideBelow: "md", render: (a) => <span className="whitespace-nowrap">{formatDate(a.last_inspection_at)}</span> },
    {
      key: "alerts",
      header: "Open alerts",
      sortKey: "open_alerts_count",
      align: "right",
      render: (a) =>
        a.open_alerts_count ? (
          <span className="inline-flex items-center gap-1 font-semibold text-serious">
            <BellRing className="size-3.5" aria-hidden />
            {a.open_alerts_count}
          </span>
        ) : (
          <span className="text-ink-3">0</span>
        ),
    },
  ];

  const typeOptions = (meta?.asset_types ?? []).map((c) => ({ value: c.value, label: c.label }));
  const riskOptions = (meta?.risk_levels ?? []).map((c) => ({ value: c.value, label: c.label, color: RISK_META[c.value as keyof typeof RISK_META]?.color }));

  return (
    <>
      <PageHeader
        eyebrow="Asset register"
        title="Structural assets"
        subtitle="Bridges, roads, buildings, tunnels, towers and industrial structures under AI monitoring."
        actions={
          <>
            <Tabs<View>
              value={view}
              onChange={setView}
              items={[
                { value: "table", label: <span className="inline-flex items-center gap-1"><Rows3 className="size-3.5" /> Table</span> },
                { value: "cards", label: <span className="inline-flex items-center gap-1"><LayoutGrid className="size-3.5" /> Cards</span> },
              ]}
            />
            {hasRole("ENGINEER") && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                Add asset
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4 p-3">
        <FilterBar
          active={activeFilters}
          onReset={() => {
            setSearch("");
            setParams(new URLSearchParams(), { replace: true });
          }}
        >
          <Input
            aria-label="Search assets"
            placeholder="Search name, ID, location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leading={<Search className="size-4" />}
            wrapperClassName="w-full sm:w-64"
          />
          <Select aria-label="Material" value={material} onChange={(e) => update({ material_type: e.target.value || null })} options={meta?.material_types ?? []} placeholder="All materials" wrapperClassName="w-44" />
          <Select
            aria-label="Sort by"
            value={ordering}
            onChange={(e) => update({ ordering: e.target.value })}
            options={[
              { value: "asset_name", label: "Name A–Z" },
              { value: "current_health_score", label: "Health (lowest first)" },
              { value: "-current_health_score", label: "Health (highest first)" },
              { value: "-last_inspection_at", label: "Recently inspected" },
              { value: "-open_alerts_count", label: "Most open alerts" },
              { value: "-created_at", label: "Newest" },
            ]}
            wrapperClassName="w-48"
          />
          <button
            type="button"
            aria-pressed={archived}
            onClick={() => update({ archived: archived ? null : "true" })}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs", archived ? "border-accent/60 bg-accent/10 text-ink" : "border-line text-ink-2 hover:text-ink")}
          >
            <Archive className="size-3.5" /> {archived ? "Showing archived" : "Archived"}
          </button>
        </FilterBar>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3">
          <ChipSelect label="Asset type" options={typeOptions} value={assetTypes} onChange={(v) => update({ asset_type: v })} />
          <ChipSelect label="Risk level" options={riskOptions} value={risk} onChange={(v) => update({ risk_level: v })} />
        </div>
      </Card>

      {view === "table" ? (
        <Card>
          <DataTable
            rows={assets.data?.results}
            columns={columns}
            rowKey={(a) => a.id}
            loading={assets.loading}
            refreshing={assets.refreshing}
            error={assets.error?.message}
            onRetry={assets.refetch}
            onRowClick={(a) => navigate(`/app/assets/${a.id}`)}
            ordering={ordering}
            onOrderingChange={(o) => update({ ordering: o })}
            emptyTitle="No assets match your filters"
            emptyDescription="Adjust the filters or register a new structural asset."
            caption="Structural assets"
          />
          {assets.data && <Pagination page={assets.data.page} totalPages={assets.data.total_pages} count={assets.data.count} pageSize={PAGE_SIZE} onPageChange={(p) => update({ page: String(p) })} />}
        </Card>
      ) : assets.loading && !assets.data ? (
        <SkeletonRows rows={4} />
      ) : assets.error && !assets.data ? (
        <ErrorState message={assets.error.message} onRetry={assets.refetch} />
      ) : assets.data?.results.length === 0 ? (
        <EmptyState title="No assets match your filters" />
      ) : (
        <>
          <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4", assets.refreshing && "opacity-60")}>
            {assets.data?.results.map((a) => (
              <button key={a.id} type="button" onClick={() => navigate(`/app/assets/${a.id}`)} className="panel group p-4 text-left transition-colors hover:border-line-strong hover:bg-surface-2/60">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-ink-3">{a.asset_code}</p>
                    <p className="truncate text-sm font-semibold text-ink group-hover:text-accent">{a.asset_name}</p>
                    <p className="truncate text-xs text-ink-3">
                      {a.asset_type_display} · {a.material_type_display}
                    </p>
                  </div>
                  <span className="text-2xl font-semibold tabular" style={{ color: healthColor(a.current_health_score) }}>
                    {formatScore(a.current_health_score)}
                  </span>
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${a.current_health_score ?? 0}%`, background: healthColor(a.current_health_score) }} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <HealthBadge status={a.health_status} />
                  <RiskBadge risk={a.risk_level} />
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-ink-3">
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="size-3" aria-hidden /> {a.location}
                  </span>
                  <span>{a.open_alerts_count ? `${a.open_alerts_count} open alerts` : `Inspected ${relativeTime(a.last_inspection_at)}`}</span>
                </div>
              </button>
            ))}
          </div>
          {assets.data && (
            <Card className="mt-4">
              <Pagination page={assets.data.page} totalPages={assets.data.total_pages} count={assets.data.count} pageSize={PAGE_SIZE} onPageChange={(p) => update({ page: String(p) })} />
            </Card>
          )}
        </>
      )}

      <AssetFormModal open={creating} onClose={() => setCreating(false)} onSaved={(a) => navigate(`/app/assets/${a.id}`)} />
    </>
  );
}
