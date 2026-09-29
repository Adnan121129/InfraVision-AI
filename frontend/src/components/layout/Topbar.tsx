import { LogOut, Menu, Plus, Search, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtime } from "@/contexts/RealtimeContext";
import { cn } from "@/utils/cn";

const CONNECTION = {
  open: { label: "Live", className: "bg-good", title: "Receiving realtime inspection updates" },
  connecting: { label: "Connecting", className: "bg-warn animate-pulse-soft", title: "Connecting to realtime updates" },
  closed: { label: "Polling", className: "bg-ink-3", title: "Realtime unavailable - falling back to periodic refresh" },
};

export function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { user, logout, hasRole } = useAuth();
  const { state } = useRealtime();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const connection = CONNECTION[state];

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    if (term) navigate(`/app/assets?search=${encodeURIComponent(term)}`);
  };

  const initials = (user?.full_name || user?.email || "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line px-4 sm:px-6">
      <button type="button" onClick={onOpenMobile} className="rounded-md p-2 text-ink-2 hover:bg-surface-2 lg:hidden" aria-label="Open navigation">
        <Menu className="size-5" />
      </button>

      <form onSubmit={onSearch} className="relative hidden max-w-md flex-1 md:block" role="search">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search assets, locations, asset IDs…"
          aria-label="Search assets"
          className="h-9 w-full rounded-lg border border-line bg-surface/70 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-accent/60 focus:outline-none"
        />
      </form>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-2 sm:inline-flex" title={connection.title}>
          <span className={cn("size-1.5 rounded-full", connection.className)} aria-hidden />
          {connection.label}
        </span>
        {hasRole("INSPECTOR") && (
          <Link to="/app/inspections/new">
            <Button variant="primary" size="sm" icon={<Plus className="size-4" />}>
              <span className="hidden sm:inline">New inspection</span>
            </Button>
          </Link>
        )}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 hover:bg-surface-2"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/30 to-blue-600/30 text-xs font-semibold text-ink ring-1 ring-line-strong">
              {initials}
            </span>
            <span className="hidden text-left leading-tight xl:block">
              <span className="block text-xs font-medium text-ink">{user?.full_name}</span>
              <span className="block text-[11px] text-ink-3">{user?.role_display}</span>
            </span>
          </button>
          {menuOpen && (
            <div role="menu" className="panel-raised absolute right-0 mt-2 w-60 animate-fade-in p-1.5 shadow-2xl shadow-black/50">
              <div className="border-b border-line px-2.5 pt-1.5 pb-2.5">
                <p className="truncate text-sm font-medium text-ink">{user?.full_name}</p>
                <p className="truncate text-xs text-ink-3">{user?.email}</p>
                <p className="mt-1 text-[11px] text-accent">{user?.role_display}</p>
              </div>
              <Link to="/app/profile" role="menuitem" onClick={() => setMenuOpen(false)} className="mt-1 flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-3 hover:text-ink">
                <UserRound className="size-4" /> Profile & security
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  await logout();
                  navigate("/login");
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-3 hover:text-ink"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
