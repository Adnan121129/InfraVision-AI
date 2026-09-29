import { MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { assetsApi } from "@/api/endpoints";
import { ChipSelect } from "@/components/filters/FilterBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { AssetMap } from "@/components/map/AssetMap";
import { RiskBadge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMeta } from "@/contexts/MetaContext";
import { useApi } from "@/hooks/useApi";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { formatScore } from "@/utils/format";
import { HEALTH_META, healthColor, STATUS_COLORS } from "@/utils/status";

export default function MapPage() {
  useDocumentTitle("Infrastructure map");
  const { meta } = useMeta();
  const [types, setTypes] = useState<string[]>([]);
  const [health, setHealth] = useState<string[]>([]);
  const markers = useApi((signal) => assetsApi.map(undefined, signal), []);

  const filtered = useMemo(
    () => (markers.data ?? []).filter((m) => (!types.length || types.includes(m.asset_type)) && (!health.length || health.includes(m.health_status ?? "UNSCORED"))),
    [markers.data, types, health],
  );
  const counts = useMemo(() => {
    const c = { HEALTHY: 0, WARNING: 0, CRITICAL: 0 };
    filtered.forEach((m) => m.health_status && (c[m.health_status] += 1));
    return c;
  }, [filtered]);
  const worst = useMemo(() => [...filtered].filter((m) => m.current_health_score !== null).sort((a, b) => (a.current_health_score ?? 0) - (b.current_health_score ?? 0)).slice(0, 8), [filtered]);

  return (
    <>
      <PageHeader eyebrow="Geospatial" title="Infrastructure map" subtitle="Every geolocated asset, coloured by structural health. Select a marker for health, risk, last inspection and open alerts." />
      <Card className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 p-3">
        <ChipSelect
          label="Health"
          options={[
            { value: "HEALTHY", label: "Healthy", color: HEALTH_META.HEALTHY.color },
            { value: "WARNING", label: "Warning", color: HEALTH_META.WARNING.color },
            { value: "CRITICAL", label: "Critical", color: HEALTH_META.CRITICAL.color },
            { value: "UNSCORED", label: "Not inspected", color: STATUS_COLORS.neutral },
          ]}
          value={health}
          onChange={setHealth}
        />
        <ChipSelect label="Asset type" options={(meta?.asset_types ?? []).map((c) => ({ value: c.value, label: c.label }))} value={types} onChange={setTypes} />
      </Card>
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card className="p-3">
          {markers.error ? <ErrorState message={markers.error.message} onRetry={markers.refetch} /> : markers.data ? <AssetMap markers={filtered} height="min(72vh, 760px)" /> : <Skeleton className="h-[70vh]" />}
          <div className="mt-3 flex flex-wrap items-center gap-4 px-1 text-xs text-ink-2" aria-label="Map legend">
            {(["HEALTHY", "WARNING", "CRITICAL"] as const).map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full ring-2 ring-surface" style={{ background: HEALTH_META[status].color }} aria-hidden />
                {HEALTH_META[status].label} <span className="text-ink-3 tabular">({counts[status]})</span>
              </span>
            ))}
            <span className="ml-auto text-ink-3">{filtered.length} assets shown</span>
          </div>
        </Card>
        <Card>
          <CardHeader title="Lowest health in view" subtitle="Prioritise these for field verification" />
          <ul className="divide-y divide-line px-4 pb-3">
            {worst.map((m) => (
              <li key={m.id}>
                <Link to={`/app/assets/${m.id}`} className="flex items-center gap-3 py-2.5 hover:text-accent">
                  <span className="w-8 text-base font-semibold tabular" style={{ color: healthColor(m.current_health_score) }}>
                    {formatScore(m.current_health_score)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{m.asset_name}</span>
                    <span className="flex items-center gap-1 text-[11px] text-ink-3">
                      <MapPin className="size-3" /> {m.location}
                    </span>
                  </span>
                  <RiskBadge risk={m.risk_level} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
