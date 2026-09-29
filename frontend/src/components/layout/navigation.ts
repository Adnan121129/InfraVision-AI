import {
  BarChart3,
  BellRing,
  BrainCircuit,
  Building2,
  Cpu,
  LayoutDashboard,
  Map,
  Network,
  ScanSearch,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/types/api";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
  role?: Role;
  badge?: "alerts";
}

export const MAIN_NAV: NavItem[] = [
  { label: "Dashboard", to: "/app", icon: LayoutDashboard, end: true },
  { label: "Assets", to: "/app/assets", icon: Building2 },
  { label: "Inspections", to: "/app/inspections", icon: ScanSearch },
  { label: "AI Analysis", to: "/app/analysis", icon: BrainCircuit },
  { label: "Alerts", to: "/app/alerts", icon: BellRing, badge: "alerts" },
  { label: "Analytics", to: "/app/analytics", icon: BarChart3 },
  { label: "Infrastructure Map", to: "/app/map", icon: Map },
  { label: "AI Models", to: "/app/models", icon: Cpu },
  { label: "System Architecture", to: "/app/architecture", icon: Network },
];

export const ADMIN_NAV: NavItem[] = [
  { label: "Users", to: "/app/admin/users", icon: Users, role: "ADMINISTRATOR" },
  { label: "Settings", to: "/app/admin/settings", icon: Settings, role: "ADMINISTRATOR" },
];
