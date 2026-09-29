import { Loader2 } from "lucide-react";

import { cn } from "@/utils/cn";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <Loader2 className={cn("size-5 animate-spin text-accent", className)} aria-hidden />
    </span>
  );
}
