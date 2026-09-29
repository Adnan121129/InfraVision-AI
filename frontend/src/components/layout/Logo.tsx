import { cn } from "@/utils/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="iv-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#3987e5" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0f1726" stroke="url(#iv-logo)" strokeOpacity="0.55" />
      <path d="M7 22 L13 12 L17 18 L20 14 L25 22" fill="none" stroke="url(#iv-logo)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="14" r="2" fill="#38bdf8" />
      <path d="M6 25.5 H26" stroke="#38bdf8" strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight text-ink">
            InfraVision <span className="text-accent">AI</span>
          </span>
          <span className="block text-[10px] font-medium tracking-[0.12em] text-ink-3 uppercase">Predictive maintenance</span>
        </span>
      )}
    </span>
  );
}
