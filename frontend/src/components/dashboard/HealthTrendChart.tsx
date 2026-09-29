import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { makeTooltip } from "@/components/charts/ChartTooltip";
import { axisProps, chartTheme } from "@/components/charts/theme";
import type { TrendPoint } from "@/types/api";
import { formatMonth } from "@/utils/format";

const tooltip = makeTooltip({
  title: (label) => formatMonth(label),
  format: (value) => (value === null || value === undefined ? "—" : `${Number(value).toFixed(1)} / 100`),
});

export function HealthTrendChart({ data, height = 260, healthy = 75, critical = 50 }: { data: TrendPoint[]; height?: number; healthy?: number; critical?: number }) {
  const values = data.map((d) => d.avg_health).filter((v): v is number => v !== null);
  const min = values.length ? Math.max(0, Math.floor((Math.min(...values) - 8) / 5) * 5) : 0;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="health-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartTheme.accent} stopOpacity={0.22} />
            <stop offset="100%" stopColor={chartTheme.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={chartTheme.grid} vertical={false} />
        <XAxis dataKey="month" tickFormatter={formatMonth} {...axisProps} minTickGap={16} />
        <YAxis domain={[Math.min(min, critical - 5), 100]} {...axisProps} axisLine={false} width={40} />
        <ReferenceLine y={healthy} stroke="#0ca30c" strokeOpacity={0.45} label={{ value: `Healthy ≥ ${healthy}`, position: "insideTopRight", fill: "#74829a", fontSize: 10 }} />
        <ReferenceLine y={critical} stroke="#d03b3b" strokeOpacity={0.45} label={{ value: `Critical < ${critical}`, position: "insideBottomRight", fill: "#74829a", fontSize: 10 }} />
        <Tooltip content={tooltip} cursor={{ stroke: "#38bdf8", strokeOpacity: 0.35 }} />
        <Area
          type="monotone"
          dataKey="avg_health"
          name="Fleet health index"
          stroke={chartTheme.accent}
          strokeWidth={2}
          fill="url(#health-fill)"
          dot={false}
          activeDot={{ r: 4, stroke: chartTheme.surface, strokeWidth: 2 }}
          connectNulls
          animationDuration={800}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
