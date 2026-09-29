import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "@/utils/cn";

export type ToastLevel = "info" | "success" | "warning" | "error";

interface Toast {
  id: number;
  title: string;
  description?: string;
  level: ToastLevel;
}

interface ToastContextValue {
  notify: (title: string, options?: { description?: string; level?: ToastLevel; duration?: number }) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };
const ACCENTS = { info: "text-accent", success: "text-good-ink", warning: "text-warn", error: "text-critical-ink" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const notify = useCallback<ToastContextValue["notify"]>(
    (title, options = {}) => {
      counter.current += 1;
      const toast: Toast = { id: counter.current, title, description: options.description, level: options.level ?? "info" };
      setToasts((all) => [...all.slice(-3), toast]);
      window.setTimeout(() => dismiss(toast.id), options.duration ?? (toast.level === "error" ? 8000 : 5000));
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.level];
          return (
            <div
              key={toast.id}
              role={toast.level === "error" ? "alert" : "status"}
              className="panel-raised pointer-events-auto flex animate-toast-in items-start gap-3 p-3.5 shadow-2xl shadow-black/40"
            >
              <Icon className={cn("mt-0.5 size-4.5 shrink-0", ACCENTS[toast.level])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{toast.title}</p>
                {toast.description && <p className="mt-0.5 text-xs text-ink-2">{toast.description}</p>}
              </div>
              <button type="button" onClick={() => dismiss(toast.id)} className="rounded p-0.5 text-ink-3 hover:bg-surface-3 hover:text-ink" aria-label="Dismiss notification">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
