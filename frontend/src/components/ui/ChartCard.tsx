import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

import { Card, CardHeader } from "./Card";
import { ErrorState } from "./ErrorState";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  legend?: ReactNode;
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  onRetry?: () => void;
  height?: number;
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function ChartCard({ title, subtitle, actions, legend, loading, refreshing, error, onRetry, height = 260, className, children, footer }: ChartCardProps) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader title={title} subtitle={subtitle} actions={actions} />
      {legend && <div className="px-5 pb-2">{legend}</div>}
      <div className={cn("relative px-3 pb-4 transition-opacity", refreshing && "opacity-60")} style={{ minHeight: height }}>
        {loading ? (
          <div className="mx-2 animate-pulse rounded-lg bg-surface-3/40" style={{ height }} role="status" aria-label={`Loading ${title}`} />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} compact />
        ) : (
          children
        )}
      </div>
      {footer && <div className="border-t border-line px-5 py-2.5 text-xs text-ink-3">{footer}</div>}
    </Card>
  );
}
