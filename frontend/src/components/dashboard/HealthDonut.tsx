import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { TooltipCard } from "@/components/charts/ChartTooltip";
import type { HealthStatus } from "@/types/api";
import { HEALTH_META } from "@/utils/status";

interface Slice {
  status: HealthStatus;
  label: string;
  count: number;
}

export function HealthDonut({ data, uninspected = 0 }: { data: Slice[]; uninspected?: number }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  return (
    <div className="flex flex-col items-center gap-4 px-2 sm:flex-row sm:items-center">
      <div className="relative size-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="label" innerRadius="68%" outerRadius="96%" paddingAngle={2} stroke="#0f1726" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive animationDuration={700}>
              {data.map((slice) => (
                <Cell key={slice.status} fill={HEALTH_META[slice.status].color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title="Asset health"
                    rows={[{ color: HEALTH_META[(payload[0].payload as Slice).status].color, label: String(payload[0].name), value: `${payload[0].value} assets` }]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight text-ink">{total}</span>
          <span className="text-[11px] text-ink-3">scored assets</span>
        </div>
      </div>
      <ul className="w-full space-y-2.5">
        {data.map((slice) => {
          const pct = total ? (slice.count / total) * 100 : 0;
          return (
            <li key={slice.status}>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="flex items-center gap-2 text-ink-2">
                  <span className="size-2.5 rounded-[3px]" style={{ background: HEALTH_META[slice.status].color }} aria-hidden />
                  {slice.label}
                </span>
                <span className="text-ink tabular">
                  <span className="font-semibold">{slice.count}</span>
                  <span className="ml-1.5 text-xs text-ink-3">{pct.toFixed(0)}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: HEALTH_META[slice.status].color }} />
              </div>
            </li>
          );
        })}
        {uninspected > 0 && <li className="pt-1 text-xs text-ink-3">{uninspected} asset(s) awaiting a first AI inspection</li>}
      </ul>
    </div>
  );
}
