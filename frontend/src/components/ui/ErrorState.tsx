import { AlertOctagon, RefreshCw } from "lucide-react";

import { Button } from "./Button";

export function ErrorState({ message, onRetry, compact = false }: { message: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div role="alert" className={compact ? "flex items-center gap-3 p-4" : "flex flex-col items-center justify-center px-6 py-12 text-center"}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-critical/30 bg-critical/10 text-critical-ink">
        <AlertOctagon className="size-5" aria-hidden />
      </div>
      <div className={compact ? "min-w-0 flex-1" : "mt-3"}>
        <p className="text-sm font-medium text-ink">Something went wrong</p>
        <p className="mt-0.5 text-xs text-ink-2">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" className={compact ? "" : "mt-4"} icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
