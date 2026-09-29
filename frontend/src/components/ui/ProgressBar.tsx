import { cn } from "@/utils/cn";

export function ProgressBar({ value, className, color = "#38bdf8", label }: { value: number; className?: string; color?: string; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${clamped}%`, background: color }} />
    </div>
  );
}
