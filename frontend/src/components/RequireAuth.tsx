import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import type { Role } from "@/types/api";

import { LogoMark } from "./layout/Logo";
import { EmptyState } from "./ui/EmptyState";

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas" role="status" aria-label="Loading InfraVision AI">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="size-12 animate-pulse-soft" />
        <p className="text-xs tracking-[0.2em] text-ink-3 uppercase">Loading platform</p>
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, initializing, sessionExpired } = useAuth();
  const location = useLocation();
  if (initializing) return <FullScreenLoader />;
  if (!user) {
    const params = new URLSearchParams({ next: location.pathname + location.search });
    if (sessionExpired) params.set("expired", "1");
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }
  return <>{children}</>;
}

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(role)) {
    return <EmptyState title="Access restricted" description={`This area requires the ${role.toLowerCase()} role or higher. Contact an administrator if you need access.`} className="mt-16" />;
  }
  return <>{children}</>;
}
