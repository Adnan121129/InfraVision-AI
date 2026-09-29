import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Logo } from "@/components/layout/Logo";

export function AuthShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-line lg:block">
        <div className="grid-backdrop absolute inset-0" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgb(56_189_248/0.16),transparent_55%),radial-gradient(ellipse_at_80%_90%,rgb(57_135_229/0.14),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Link to="/" aria-label="InfraVision AI home">
            <Logo />
          </Link>
          <div className="max-w-md">
            <p className="label-eyebrow text-accent">Structural intelligence</p>
            <h2 className="mt-3 text-3xl leading-tight font-semibold tracking-tight text-ink">Every inspection image becomes a measurable health signal.</h2>
            <p className="mt-4 text-sm text-ink-2">
              Computer-vision detection, severity scoring and asset risk analysis in one auditable workflow — built for civil, structural and maintenance engineering teams.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                ["OpenCV", "Preprocessing"],
                ["CNN", "Defect detection"],
                ["Celery", "Async pipeline"],
              ].map(([k, v]) => (
                <div key={k} className="panel p-3">
                  <p className="text-sm font-semibold text-ink">{k}</p>
                  <p className="text-[11px] text-ink-3">{v}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="flex items-center gap-2 text-xs text-ink-3">
            <ShieldCheck className="size-4 text-accent" aria-hidden /> JWT sessions · role-based access · encrypted transport
          </p>
        </div>
      </aside>
      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1.5 mb-7 text-sm text-ink-2">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
