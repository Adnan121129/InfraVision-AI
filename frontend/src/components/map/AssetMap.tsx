import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { Link } from "react-router-dom";

import type { AssetMarker } from "@/types/api";
import { formatDate, formatScore } from "@/utils/format";
import { HEALTH_META, RISK_META, STATUS_COLORS } from "@/utils/status";

function FitBounds({ markers }: { markers: AssetMarker[] }) {
  const map = useMap();
  useEffect(() => {
    if (!markers.length) return;
    const lats = markers.map((m) => Number(m.latitude));
    const lngs = markers.map((m) => Number(m.longitude));
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [36, 36], maxZoom: 11 },
    );
  }, [map, markers]);
  return null;
}

function markerColor(marker: AssetMarker): string {
  return marker.health_status ? HEALTH_META[marker.health_status].color : STATUS_COLORS.neutral;
}

export function AssetMap({ markers, height = 420, interactive = true }: { markers: AssetMarker[]; height?: number | string; interactive?: boolean }) {
  return (
    <div className="min-h-[220px] flex-1 overflow-hidden rounded-lg border border-line" style={{ height }}>
      <MapContainer center={[39.5, -119.5]} zoom={5} scrollWheelZoom={interactive} className="size-full" attributionControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds markers={markers} />
        {markers.map((marker) => {
          const color = markerColor(marker);
          const critical = marker.health_status === "CRITICAL";
          return (
            <CircleMarker
              key={marker.id}
              center={[Number(marker.latitude), Number(marker.longitude)]}
              radius={critical ? 9 : 7}
              pathOptions={{ color: "#0f1726", weight: 2, fillColor: color, fillOpacity: 0.95 }}
            >
              <Popup>
                <div className="w-56 space-y-2 text-ink">
                  <div>
                    <p className="font-mono text-[10px] text-ink-3">{marker.asset_code}</p>
                    <p className="text-sm leading-tight font-semibold">{marker.asset_name}</p>
                    <p className="text-[11px] text-ink-3">
                      {marker.asset_type_display} · {marker.location}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <dt className="text-ink-3">Health score</dt>
                    <dd className="text-right font-semibold" style={{ color }}>
                      {formatScore(marker.current_health_score)}
                      <span className="text-ink-3">/100</span>
                    </dd>
                    <dt className="text-ink-3">Risk level</dt>
                    <dd className="text-right">{RISK_META[marker.risk_level].label}</dd>
                    <dt className="text-ink-3">Last inspection</dt>
                    <dd className="text-right">{formatDate(marker.last_inspection_at)}</dd>
                    <dt className="text-ink-3">Open alerts</dt>
                    <dd className="text-right">{marker.open_alerts_count}</dd>
                  </dl>
                  <Link to={`/app/assets/${marker.id}`} className="block rounded-md bg-accent/15 py-1.5 text-center text-xs font-medium !text-accent hover:bg-accent/25">
                    View asset details →
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
