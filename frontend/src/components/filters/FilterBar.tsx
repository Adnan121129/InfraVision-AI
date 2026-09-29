import { SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

/** One row of filters above the content they scope. */
export function FilterBar({ children, onReset, active = 0, className }: { children: ReactNode; onReset?: () => void; active?: number; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end gap-2.5", className)} role="group" aria-label="Filters">
      <span className="hidden h-9 items-center gap-1.5 pr-1 text-xs text-ink-3 md:inline-flex">
        <SlidersHorizontal className="size-3.5" aria-hidden /> Filters
      </span>
      {children}
      {onReset && active > 0 && (
        <button type="button" onClick={onReset} className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink">
          <X className="size-3.5" /> Clear ({active})
        </button>
      )}
    </div>
  );
}

/** Compact multi-select rendered as toggle chips. */
export function ChipSelect({ label, options, value, onChange }: { label: string; options: { value: string; label: string; color?: string }[]; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-1">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const on = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== option.value) : [...value, option.value])}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
              on ? "border-accent/60 bg-accent/10 text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
            )}
          >
            {option.color && <span className="size-1.5 rounded-full" style={{ background: option.color }} aria-hidden />}
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
