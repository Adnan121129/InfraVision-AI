import type { ReactNode } from "react";

export interface TooltipRow {
  color: string;
  label: string;
  value: ReactNode;
}

/** Tooltip body: value leads (strong), series name follows; keyed with a short line, not a box. */
export function TooltipCard({ title, rows }: { title: ReactNode; rows: TooltipRow[] }) {
  return (
    <div className="min-w-36 rounded-lg border border-line-strong bg-[#101a2c]/95 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur">
      <p className="mb-1.5 text-[11px] font-medium text-ink-3">{title}</p>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-xs">
            <span className="h-0.5 w-3 rounded-full" style={{ background: row.color }} aria-hidden />
            <span className="font-semibold text-ink tabular">{row.value}</span>
            <span className="text-ink-2">{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Recharts passes a loosely-typed payload to custom tooltip content.
export interface RechartsPayloadItem {
  name?: unknown;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
}

export function makeTooltip(options: {
  title?: (label: string, payload: readonly RechartsPayloadItem[]) => ReactNode;
  format?: (value: number | string | null | undefined, name: string) => ReactNode;
  colorFor?: (item: RechartsPayloadItem) => string | undefined;
}) {
  return function ChartTooltipContent({ active, payload, label }: { active?: boolean; payload?: readonly RechartsPayloadItem[]; label?: unknown }) {
    if (!active || !payload?.length) return null;
    const title = options.title ? options.title(String(label ?? ""), payload) : String(label ?? "");
    return (
      <TooltipCard
        title={title}
        rows={payload.map((item) => ({
          color: options.colorFor?.(item) ?? item.color ?? "#38bdf8",
          label: String(item.name ?? item.dataKey ?? ""),
          value: options.format ? options.format(item.value as number | string | null | undefined, String(item.name ?? "")) : String(item.value ?? "—"),
        }))}
      />
    );
  };
}
