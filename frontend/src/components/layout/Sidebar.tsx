import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { NavLink } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/utils/cn";

import { Logo } from "./Logo";
import { ADMIN_NAV, MAIN_NAV, type NavItem } from "./navigation";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activeAlerts?: number;
}

function NavEntry({ item, collapsed, activeAlerts, onNavigate }: { item: NavItem; collapsed: boolean; activeAlerts?: number; onNavigate: () => void }) {
  const Icon = item.icon;
  const count = item.badge === "alerts" ? activeAlerts : undefined;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
          isActive ? "bg-accent/10 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
          collapsed && "justify-center px-0",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden />}
          <Icon className={cn("size-4 shrink-0", isActive ? "text-accent" : "text-ink-3 group-hover:text-ink-2")} aria-hidden />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {count ? (
            <span
              className={cn(
                "rounded-full bg-critical/90 px-1.5 text-[10px] leading-4 font-semibold text-white tabular",
                collapsed ? "absolute top-0.5 right-0.5" : "ml-auto",
              )}
              aria-label={`${count} active alerts`}
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile, activeAlerts }: SidebarProps) {
  const { hasRole } = useAuth();
  const content = (isMobile: boolean) => {
    const isCollapsed = collapsed && !isMobile;
    return (
      <div className="flex h-full flex-col">
        <div className={cn("flex h-16 items-center border-b border-line px-4", isCollapsed && "justify-center px-0")}>
          <Logo collapsed={isCollapsed} />
          {isMobile && (
            <button type="button" onClick={onCloseMobile} className="ml-auto rounded-md p-1.5 text-ink-3 hover:bg-surface-2" aria-label="Close navigation">
              <X className="size-4" />
            </button>
          )}
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main navigation">
          <div className="space-y-0.5">
            {!isCollapsed && <p className="label-eyebrow px-2.5 pb-2">Operations</p>}
            {MAIN_NAV.map((item) => (
              <NavEntry key={item.to} item={item} collapsed={isCollapsed} activeAlerts={activeAlerts} onNavigate={onCloseMobile} />
            ))}
          </div>
          {hasRole("ADMINISTRATOR") && (
            <div className="space-y-0.5">
              {!isCollapsed && <p className="label-eyebrow px-2.5 pb-2">Administration</p>}
              {ADMIN_NAV.map((item) => (
                <NavEntry key={item.to} item={item} collapsed={isCollapsed} onNavigate={onCloseMobile} />
              ))}
            </div>
          )}
        </nav>
        {!isMobile && (
          <div className="border-t border-line p-3">
            <button
              type="button"
              onClick={onToggleCollapsed}
              className={cn("flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-xs text-ink-3 hover:bg-surface-2 hover:text-ink-2", isCollapsed && "justify-center px-0")}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
              {!isCollapsed && "Collapse"}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-[#0a1120] transition-[width] duration-300 ease-out lg:block",
          collapsed ? "w-[68px]" : "w-60",
        )}
      >
        {content(false)}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={onCloseMobile} aria-hidden />
          <aside className="relative h-full w-64 animate-slide-up border-r border-line bg-[#0a1120]">{content(true)}</aside>
        </div>
      )}
    </>
  );
}
