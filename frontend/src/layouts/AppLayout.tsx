import { Suspense, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { alertsApi } from "@/api/endpoints";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useRealtimeEvents } from "@/contexts/RealtimeContext";
import { useApi } from "@/hooks/useApi";
import { useInterval } from "@/hooks/useInterval";
import { cn } from "@/utils/cn";

const COLLAPSE_KEY = "iv.sidebar.collapsed";

export function AppLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const alerts = useApi((signal) => alertsApi.summary({ active: true }, signal), []);

  useRealtimeEvents((event) => {
    if (event.type === "alert.created") void alerts.refetch();
  });
  useInterval(() => void alerts.refetch(), 60_000);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, value ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !value;
    });
  };

  const activeAlerts = alerts.data ? alerts.data.open + alerts.data.investigating : undefined;

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-slate-950">
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} activeAlerts={activeAlerts} />
      <div className={cn("transition-[padding] duration-300 ease-out", collapsed ? "lg:pl-[68px]" : "lg:pl-60")}>
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <div key={location.pathname} className="animate-slide-up">
                <Outlet />
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
