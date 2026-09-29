import { BellRing, CheckCircle2, Search, SearchCheck, Siren } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { alertsApi, usersApi } from "@/api/endpoints";
import { ChipSelect, FilterBar } from "@/components/filters/FilterBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { AlertStatusBadge, SeverityBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { KpiCard } from "@/components/ui/KpiCard";
import { Drawer } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useAuth } from "@/contexts/AuthContext";
import { useMeta } from "@/contexts/MetaContext";
import { useRealtimeEvents } from "@/contexts/RealtimeContext";
import { useToast } from "@/contexts/ToastContext";
import { useApi } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { Alert, AlertStatus } from "@/types/api";
import { formatDateTime, relativeTime } from "@/utils/format";
import { ALERT_STATUS_META, SEVERITY_META, STATUS_COLORS } from "@/utils/status";

const PAGE_SIZE = 20;

export default function AlertsPage() {
  useDocumentTitle("Alert center");
  const { meta } = useMeta();
  const { hasRole, user } = useAuth();
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const debounced = useDebounce(search, 350);
  const [selected, setSelected] = useState<Alert | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState<AlertStatus | "assign" | null>(null);

  const statuses = params.getAll("status");
  const severities = params.getAll("severity");
  const alertType = params.get("alert_type") ?? "";
  const activeOnly = params.get("active");
  const ordering = params.get("ordering") ?? "-created_at";
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
    () => ({ search: urlSearch, status: statuses, severity: severities, alert_type: alertType, active: activeOnly, ordering, page, page_size: PAGE_SIZE }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.toString()],
  );
  const list = useApi((signal) => alertsApi.list(query, signal), [query]);
  const summary = useApi((signal) => alertsApi.summary(undefined, signal), []);
  const engineers = useApi((signal) => usersApi.list({ role: "ENGINEER", is_active: true, page_size: 100 }, signal), [], { enabled: hasRole("ADMINISTRATOR") });

  useRealtimeEvents((event) => {
    if (event.type === "alert.created") {
      void list.refetch();
      void summary.refetch();
    }
  });

  useEffect(() => setNotes(selected?.resolution_notes ?? ""), [selected]);

  const transition = async (status: AlertStatus) => {
    if (!selected) return;
    setSaving(status);
    try {
      const updated = await alertsApi.update(selected.id, { status, resolution_notes: notes });
      setSelected(updated);
      list.setData((prev) => ({ ...prev!, results: prev!.results.map((a) => (a.id === updated.id ? updated : a)) }));
      void summary.refetch();
      notify(`${updated.reference} marked ${ALERT_STATUS_META[status].label.toLowerCase()}`, { level: "success" });
    } catch (err) {
      notify("Could not update alert", { level: "error", description: (err as ApiError).message });
    } finally {
      setSaving(null);
    }
  };

  const assign = async (assignee: number | null) => {
    if (!selected) return;
    setSaving("assign");
    try {
      const updated = await alertsApi.update(selected.id, { assigned_to: assignee });
      setSelected(updated);
      list.setData((prev) => ({ ...prev!, results: prev!.results.map((a) => (a.id === updated.id ? updated : a)) }));
    } catch (err) {
      notify("Could not assign alert", { level: "error", description: (err as ApiError).message });
    } finally {
      setSaving(null);
    }
  };

  const columns: Column<Alert>[] = [
    {
      key: "alert",
      header: "Alert",
      render: (a) => (
        <div className="min-w-0 max-w-md">
          <p className="truncate font-medium text-ink">{a.title}</p>
          <p className="text-[11px] text-ink-3">
            <span className="font-mono">{a.reference}</span> · {a.alert_type_display}
          </p>
        </div>
      ),
    },
    { key: "asset", header: "Asset", render: (a) => <span className="whitespace-nowrap">{a.asset_name}</span>, hideBelow: "md" },
    { key: "severity", header: "Severity", sortKey: "severity_rank", render: (a) => <SeverityBadge severity={a.severity} /> },
    { key: "defect", header: "Defect", hideBelow: "lg", render: (a) => a.defect_type_display ?? "—" },
    { key: "inspection", header: "Inspection", hideBelow: "xl", render: (a) => (a.inspection_reference ? <span className="font-mono text-xs">{a.inspection_reference}</span> : "—") },
    { key: "date", header: "Date", sortKey: "created_at", render: (a) => <span className="whitespace-nowrap" title={formatDateTime(a.created_at)}>{relativeTime(a.created_at)}</span> },
    { key: "status", header: "Status", sortKey: "status", render: (a) => <AlertStatusBadge status={a.status} /> },
  ];

  const active = statuses.length + severities.length + (alertType ? 1 : 0) + (activeOnly ? 1 : 0) + (urlSearch ? 1 : 0);
  const s = summary.data;
  const canResolve = hasRole("ENGINEER");

  return (
    <>
      <PageHeader eyebrow="Maintenance" title="Alert center" subtitle="Maintenance alerts raised from AI findings, health declines and overdue inspections." />
      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Open" value={s?.open ?? "—"} icon={<BellRing className="size-4" />} accent={STATUS_COLORS.critical} footnote="Awaiting triage" />
        <KpiCard label="Investigating" value={s?.investigating ?? "—"} icon={<SearchCheck className="size-4" />} accent={STATUS_COLORS.warn} footnote="Acknowledged by the team" />
        <KpiCard label="Critical & high (active)" value={s ? s.critical_active + s.high_active : "—"} icon={<Siren className="size-4" />} accent={STATUS_COLORS.serious} footnote={s ? `${s.critical_active} critical` : undefined} />
        <KpiCard label="Resolved" value={s?.resolved ?? "—"} icon={<CheckCircle2 className="size-4" />} accent={STATUS_COLORS.good} footnote="All time" />
      </section>

      <Card className="mb-4 p-3">
        <FilterBar active={active} onReset={() => { setSearch(""); setParams(new URLSearchParams(), { replace: true }); }}>
          <Input aria-label="Search alerts" placeholder="Search alerts, assets, IDs…" value={search} onChange={(e) => setSearch(e.target.value)} leading={<Search className="size-4" />} wrapperClassName="w-full sm:w-64" />
          <Select aria-label="Alert type" value={alertType} onChange={(e) => update({ alert_type: e.target.value || null })} options={meta?.alert_types ?? []} placeholder="All alert types" wrapperClassName="w-48" />
          <Select aria-label="Sort" value={ordering} onChange={(e) => update({ ordering: e.target.value })} options={[{ value: "-created_at", label: "Newest first" }, { value: "created_at", label: "Oldest first" }, { value: "-severity_rank", label: "Most severe first" }]} wrapperClassName="w-44" />
        </FilterBar>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3">
          <ChipSelect label="Status" options={Object.entries(ALERT_STATUS_META).map(([value, m]) => ({ value, label: m.label, color: m.color }))} value={statuses} onChange={(v) => update({ status: v, active: null })} />
          <ChipSelect label="Severity" options={Object.entries(SEVERITY_META).map(([value, m]) => ({ value, label: m.label, color: m.color }))} value={severities} onChange={(v) => update({ severity: v })} />
        </div>
      </Card>

      <Card>
        <DataTable
          rows={list.data?.results}
          columns={columns}
          rowKey={(a) => a.id}
          loading={list.loading}
          refreshing={list.refreshing}
          error={list.error?.message}
          onRetry={list.refetch}
          onRowClick={setSelected}
          ordering={ordering}
          onOrderingChange={(o) => update({ ordering: o })}
          emptyTitle="No alerts match these filters"
          caption="Maintenance alerts"
        />
        {list.data && <Pagination page={list.data.page} totalPages={list.data.total_pages} count={list.data.count} pageSize={PAGE_SIZE} onPageChange={(p) => update({ page: String(p) })} />}
      </Card>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        description={selected ? `${selected.reference} · raised ${formatDateTime(selected.created_at)}` : undefined}
        footer={
          selected && (
            <>
              {selected.status !== "INVESTIGATING" && selected.status !== "RESOLVED" && (
                <Button onClick={() => transition("INVESTIGATING")} loading={saving === "INVESTIGATING"}>Start investigating</Button>
              )}
              {canResolve && selected.status !== "RESOLVED" && (
                <Button variant="primary" onClick={() => transition("RESOLVED")} loading={saving === "RESOLVED"}>Mark resolved</Button>
              )}
              {canResolve && selected.status === "RESOLVED" && (
                <Button variant="outline" onClick={() => transition("OPEN")} loading={saving === "OPEN"}>Reopen</Button>
              )}
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-1.5">
              <SeverityBadge severity={selected.severity} />
              <AlertStatusBadge status={selected.status} />
            </div>
            <p className="text-sm text-ink-2">{selected.description}</p>
            <dl className="divide-y divide-line rounded-lg border border-line text-sm">
              {[
                ["Asset", <Link key="a" to={`/app/assets/${selected.structural_asset}`} className="text-accent hover:underline">{selected.asset_name}</Link>],
                ["Alert type", selected.alert_type_display],
                ["Defect", selected.defect_type_display ?? "—"],
                ["Inspection", selected.inspection ? <Link key="i" to={`/app/inspections/${selected.inspection}`} className="font-mono text-accent hover:underline">{selected.inspection_reference}</Link> : "—"],
                ["Assigned to", selected.assigned_to_detail?.full_name ?? "Unassigned"],
                ["Resolved", selected.resolved_at ? `${formatDateTime(selected.resolved_at)}${selected.resolved_by_name ? ` by ${selected.resolved_by_name}` : ""}` : "—"],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-4 px-3 py-2">
                  <dt className="text-ink-3">{label}</dt>
                  <dd className="text-right text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {canResolve && (
              <div className="flex items-end gap-2">
                {hasRole("ADMINISTRATOR") && engineers.data ? (
                  <Select
                    label="Assign engineer"
                    value={selected.assigned_to ? String(selected.assigned_to) : ""}
                    onChange={(e) => assign(e.target.value ? Number(e.target.value) : null)}
                    options={engineers.data.results.map((u) => ({ value: String(u.id), label: u.full_name }))}
                    placeholder="Unassigned"
                    wrapperClassName="flex-1"
                    disabled={saving === "assign"}
                  />
                ) : (
                  <Button size="sm" variant="outline" onClick={() => assign(user!.id)} loading={saving === "assign"} disabled={selected.assigned_to === user?.id}>
                    {selected.assigned_to === user?.id ? "Assigned to you" : "Assign to me"}
                  </Button>
                )}
              </div>
            )}
            <Textarea
              label="Resolution notes"
              placeholder={canResolve ? "Describe the repair or verification performed…" : "Only engineers can record resolutions"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canResolve}
            />
            {!canResolve && <p className="text-xs text-ink-3">Inspectors can acknowledge alerts; resolving requires the engineer role.</p>}
          </div>
        )}
      </Drawer>
    </>
  );
}
