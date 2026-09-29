import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (value: T) => void; items: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-lg border border-line bg-surface-2 p-0.5", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          onClick={() => onChange(item.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            item.value === value ? "bg-surface-3 text-ink shadow-sm" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
