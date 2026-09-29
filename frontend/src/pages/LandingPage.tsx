import {
  Activity,
  ArrowRight,
  BarChart3,
  BellRing,
  BrainCircuit,
  Building2,
  Camera,
  CheckCircle2,
  CloudUpload,
  Cpu,
  Database,
  Factory,
  FileLock2,
  KeyRound,
  Landmark,
  Layers,
  Map as MapIcon,
  RadioTower,
  Route,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TrainFront,
  Users,
  Waves,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { cn } from "@/utils/cn";
import { SEVERITY_META } from "@/utils/status";

/** Reveal-on-scroll with IntersectionObserver (respects reduced motion via CSS). */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={cn("transition-all duration-700 ease-out", visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const HERO_BOXES = [
  { label: "Spalling", severity: "CRITICAL", conf: 93, box: [25.2, 23.2, 46.6, 45.2] },
  { label: "Concrete crack", severity: "HIGH", conf: 94, box: [33.9, 18.4, 67.4, 47.9] },
  { label: "Concrete crack", severity: "MEDIUM", conf: 88, box: [0.3, 21.6, 22, 59.5] },
  { label: "Rust staining", severity: "MEDIUM", conf: 81, box: [61.2, 23.5, 75.1, 44.1] },
] as const;

function InspectionVisual() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[28px] bg-[radial-gradient(ellipse_at_center,rgb(56_189_248/0.18),transparent_65%)] blur-2xl" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-good animate-pulse-soft" aria-hidden />
            <span className="font-mono text-[11px] text-ink-2">INS-2048 · Harbor Point Viaduct · Deck soffit</span>
          </div>
          <span className="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-warn uppercase">Illustration</span>
        </div>
        <div className="relative aspect-[4/3]">
          <img src="/images/inspection-hero.jpg" alt="Synthetic concrete surface with detected cracks, spalling and rust staining" className="size-full object-cover" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-full">
            <div className="h-0.5 w-full animate-scan bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_24px_4px_rgb(56_189_248/0.45)]" />
          </div>
          {HERO_BOXES.map((b, i) => {
            const color = SEVERITY_META[b.severity].color;
            return (
              <div
                key={i}
                className="absolute animate-fade-in rounded-[3px] border-2"
                style={{ left: `${b.box[0]}%`, top: `${b.box[1]}%`, width: `${b.box[2] - b.box[0]}%`, height: `${b.box[3] - b.box[1]}%`, borderColor: color, background: `${color}14`, animationDelay: `${600 + i * 350}ms` }}
              >
                <span className="absolute -top-[19px] left-[-2px] rounded-t-[3px] px-1.5 py-0.5 text-[10px] leading-none font-semibold whitespace-nowrap text-slate-950" style={{ background: color }}>
                  {b.label} {b.conf}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="glass absolute -bottom-6 -left-4 hidden w-52 rounded-xl border border-line-strong p-3.5 shadow-xl sm:block">
        <p className="text-[10px] text-ink-3 uppercase">Overall structural health</p>
        <p className="mt-1 text-2xl font-semibold text-ink">
          54<span className="text-sm text-ink-3">/100</span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full w-[54%] rounded-full bg-warn" />
        </div>
      </div>
      <div className="glass absolute -top-5 -right-3 hidden w-48 rounded-xl border border-line-strong p-3.5 shadow-xl md:block">
        <p className="text-[10px] text-ink-3 uppercase">Detected defects</p>
        <ul className="mt-1.5 space-y-1 text-xs">
          {(["CRITICAL", "HIGH", "MEDIUM"] as const).map((s, i) => (
            <li key={s} className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-ink-2">
                <span className="size-2 rounded-[2px]" style={{ background: SEVERITY_META[s].color }} />
                {SEVERITY_META[s].label}
              </span>
              <span className="font-semibold text-ink">{[2, 1, 2][i]}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Section({ id, eyebrow, title, subtitle, children, className }: { id?: string; eyebrow: string; title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-8", className)}>
      <Reveal className="mx-auto mb-12 max-w-2xl text-center">
        <p className="label-eyebrow text-accent">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h2>
        {subtitle && <p className="mt-4 text-base text-ink-2">{subtitle}</p>}
      </Reveal>
      {children}
    </section>
  );
}

const CAPABILITIES = [
  { icon: ScanSearch, title: "Computer-vision defect detection", text: "CNN models trained with transfer learning localise cracks, spalling, corrosion, rust, exposed rebar and efflorescence." },
  { icon: Activity, title: "Severity & health scoring", text: "Every finding is rated Low → Critical from defect type, physical extent and confidence, rolled into a 0–100 health index." },
  { icon: Workflow, title: "Asynchronous ML pipeline", text: "Uploads land in object storage and queue on Redis; a dedicated ML worker runs inference without blocking the API." },
  { icon: BrainCircuit, title: "Risk analysis & prioritisation", text: "System-generated maintenance priority from health trends, open alerts and overdue inspections — decision support for engineers." },
  { icon: BellRing, title: "Maintenance alerting", text: "Critical findings and sharp health declines raise alerts with investigation and resolution workflows." },
  { icon: Users, title: "Human-in-the-loop review", text: "Engineers confirm or reject each detection, creating an auditable record for model governance and retraining." },
];

const STEPS = [
  { icon: Camera, title: "Capture", text: "Drone surveys, fixed cameras or handheld imagery of decks, soffits, piers, linings and facades." },
  { icon: CloudUpload, title: "Upload & store", text: "Drag-and-drop upload with validation; originals are stored in S3 / MinIO with previews generated." },
  { icon: Cpu, title: "AI analysis", text: "OpenCV preprocessing, CNN inference and defect post-processing on the ML worker." },
  { icon: CheckCircle2, title: "Act", text: "Annotated results, health trends, alerts and prioritised maintenance recommendations." },
];

const INFRA = [
  { icon: Landmark, label: "Bridges & viaducts" },
  { icon: Route, label: "Roads & pavements" },
  { icon: Building2, label: "Buildings & car parks" },
  { icon: TrainFront, label: "Tunnels & rail" },
  { icon: RadioTower, label: "Towers & masts" },
  { icon: Waves, label: "Dams & spillways" },
  { icon: Factory, label: "Industrial structures" },
  { icon: MapIcon, label: "Wharves & retaining walls" },
];

const SECURITY = [
  { icon: KeyRound, title: "JWT authentication", text: "Short-lived access tokens, rotating refresh tokens and server-side blacklisting on logout." },
  { icon: Users, title: "Role-based access", text: "Administrator, Engineer, Inspector and Viewer roles enforced on every API route and screen." },
  { icon: FileLock2, title: "Hardened uploads", text: "Extension, size, dimension and decode validation with decompression-bomb protection." },
  { icon: ShieldCheck, title: "Production security", text: "HSTS, secure cookies, CORS allow-lists, rate limiting and secrets supplied only via environment." },
];

export default function LandingPage() {
  useDocumentTitle("");
  const { user } = useAuth();
  const dashboardHref = user ? "/app" : "/login?next=/app";

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas">
      <header className="glass sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 sm:px-8">
          <Link to="/" aria-label="InfraVision AI home">
            <Logo />
          </Link>
          <nav className="hidden flex-1 items-center gap-6 text-sm text-ink-2 md:flex" aria-label="Landing">
            <a href="#capabilities" className="hover:text-ink">Capabilities</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#architecture" className="hover:text-ink">Architecture</a>
            <a href="#security" className="hover:text-ink">Security</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {!user && (
              <Link to="/login" className="hidden sm:block">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
            )}
            <Link to={dashboardHref}>
              <Button variant="primary" size="sm">Launch Dashboard</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative">
          <div className="grid-backdrop absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_0%,rgb(56_189_248/0.12),transparent_60%),radial-gradient(ellipse_60%_50%_at_10%_20%,rgb(57_135_229/0.1),transparent_60%)]" aria-hidden />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pt-16 pb-24 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent">
                <Sparkles className="size-3.5" /> AI-powered predictive infrastructure maintenance
              </span>
              <h1 className="mt-6 text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl xl:text-[3.5rem]">
                Predict Infrastructure Failures <span className="bg-gradient-to-r from-sky-300 to-blue-500 bg-clip-text text-transparent">Before They Become Critical.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg text-ink-2">AI-powered computer vision transforms structural inspection imagery into actionable infrastructure health intelligence.</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to={dashboardHref}>
                  <Button variant="primary" size="lg" icon={<BarChart3 className="size-4" />}>
                    Launch Dashboard
                  </Button>
                </Link>
                <Link to={user ? "/app/inspections/new" : "/login?next=/app/inspections/new"}>
                  <Button variant="outline" size="lg">
                    Explore AI Inspection <ArrowRight className="size-4" />
                  </Button>
                </Link>
              </div>
              <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
                {[
                  ["9", "defect classes in the taxonomy"],
                  ["10-stage", "OpenCV + CNN pipeline"],
                  ["Real-time", "WebSocket status updates"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <dt className="sr-only">{label}</dt>
                    <dd className="text-xl font-semibold text-ink">{value}</dd>
                    <dd className="mt-1 text-xs text-ink-3">{label}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
            <Reveal delay={150}>
              <InspectionVisual />
            </Reveal>
          </div>
        </section>

        <Section id="capabilities" eyebrow="Platform capabilities" title="From image to maintenance decision" subtitle="One platform for inspection teams, structural engineers and asset managers.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 60}>
                <div className="panel h-full p-6 transition-colors hover:border-line-strong">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-base font-semibold text-ink">{title}</h3>
                  <p className="mt-2 text-sm text-ink-2">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        <section id="how" className="scroll-mt-20 border-y border-line bg-[#0a1120]">
          <Section eyebrow="How AI inspection works" title="Four steps. Fully asynchronous." className="py-20">
            <ol className="grid gap-4 md:grid-cols-4">
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} delay={i * 80}>
                  <li className="relative h-full rounded-xl border border-line bg-surface p-6">
                    <span className="font-mono text-xs text-ink-3">0{i + 1}</span>
                    <Icon className="mt-3 size-6 text-accent" />
                    <h3 className="mt-4 font-semibold text-ink">{title}</h3>
                    <p className="mt-2 text-sm text-ink-2">{text}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </Section>
        </section>

        <Section eyebrow="Infrastructure monitoring" title="Portfolio health at a glance" subtitle="Executive dashboards, asset intelligence pages and a geospatial map keep every structure's condition in view.">
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              { img: "/images/inspection-steel.jpg", title: "Steel corrosion tracking", text: "Oxide staining and pitting on painted steel members, trended across inspections.", tag: "Transmission tower · Structural steel", boxes: [[76.9, 10.7, 88.6, 23.2, "CRITICAL"], [15, 3.7, 33.8, 25.5, "HIGH"]] },
              { img: "/images/inspection-hero.jpg", title: "Concrete deterioration", text: "Spalling with exposed reinforcement, crack networks and rust staining on deck soffits.", tag: "Viaduct · Prestressed concrete", boxes: [[25.2, 23.2, 46.6, 45.2, "CRITICAL"], [0.3, 21.6, 22, 59.5, "MEDIUM"]] },
              { img: "/images/inspection-asphalt.jpg", title: "Pavement cracking", text: "Longitudinal and block cracking detected from vehicle-mounted cameras.", tag: "Highway · Asphalt", boxes: [[55.4, 4.6, 99.7, 50.3, "HIGH"], [41.8, 46.8, 58.4, 77.9, "MEDIUM"]] },
            ].map((card, i) => (
              <Reveal key={card.title} delay={i * 80}>
                <article className="panel overflow-hidden">
                  <div className="relative aspect-[4/3]">
                    <img src={card.img} alt={card.title} loading="lazy" className="size-full object-cover" />
                    {card.boxes.map(([x0, y0, x1, y1, sev], j) => (
                      <span key={j} className="absolute rounded-[3px] border-2" style={{ left: `${x0}%`, top: `${y0}%`, width: `${Number(x1) - Number(x0)}%`, height: `${Number(y1) - Number(y0)}%`, borderColor: SEVERITY_META[sev as keyof typeof SEVERITY_META].color }} />
                    ))}
                    <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] text-ink-2">{card.tag}</span>
                  </div>
                  <div className="p-5">
                    <h3 className="font-semibold text-ink">{card.title}</h3>
                    <p className="mt-1.5 text-sm text-ink-2">{card.text}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-ink-3">Imagery shown is synthetic demonstration data generated by the platform's demo seeder.</p>
        </Section>

        <section className="border-y border-line bg-[#0a1120]">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2">
            <Reveal>
              <p className="label-eyebrow text-accent">Analytics</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Understand deterioration, not just defects</h2>
              <p className="mt-4 text-ink-2">
                Health indices, defect mix, critical incidents, AI confidence, processing throughput and maintenance resolution times — filtered by date range, asset, type, defect and severity.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-ink-2">
                {["Fleet health index carried forward between inspections", "Mean time to resolve maintenance alerts", "Model confidence and latency monitoring"].map((t) => (
                  <li key={t} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" /> {t}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={120}>
              <div className="panel p-6" role="img" aria-label="Illustrative chart of a declining fleet health index">
                <div className="mb-4 flex items-baseline justify-between">
                  <p className="text-sm font-medium text-ink">Fleet health index</p>
                  <p className="text-xs text-ink-3">Illustrative</p>
                </div>
                <svg viewBox="0 0 400 160" className="w-full">
                  <defs>
                    <linearGradient id="landing-area" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#38bdf8" stopOpacity="0.25" />
                      <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[30, 70, 110, 150].map((y) => (
                    <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="#1e2a3f" />
                  ))}
                  <line x1="0" x2="400" y1="62" y2="62" stroke="#0ca30c" strokeOpacity="0.5" />
                  <path d="M0,40 C40,42 70,44 100,50 S160,58 200,57 S260,66 300,72 S360,80 400,86 L400,160 L0,160 Z" fill="url(#landing-area)" />
                  <path d="M0,40 C40,42 70,44 100,50 S160,58 200,57 S260,66 300,72 S360,80 400,86" fill="none" stroke="#38bdf8" strokeWidth="2" />
                  <circle cx="400" cy="86" r="4" fill="#38bdf8" stroke="#0f1726" strokeWidth="2" />
                </svg>
              </div>
            </Reveal>
          </div>
        </section>

        <Section eyebrow="AI workflow" title="A modular, auditable ML pipeline" subtitle="Every stage is timed and reported with each inspection. Swap models without touching the web application.">
          <Reveal>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {["Image loading", "Resolution normalization", "Noise reduction", "Color normalization", "Lighting correction", "Contrast enhancement", "Edge enhancement", "Resizing", "Tensor conversion", "CNN inference", "Severity scoring", "Health index"].map((stage, i, all) => (
                <span key={stage} className="flex items-center gap-2">
                  <span className={cn("rounded-lg border px-3 py-1.5 text-sm", i >= all.length - 3 ? "border-accent/40 bg-accent/10 text-accent" : "border-line bg-surface text-ink-2")}>{stage}</span>
                  {i < all.length - 1 && <ArrowRight className="size-3.5 text-ink-3" aria-hidden />}
                </span>
              ))}
            </div>
            <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-ink-3">
              Production inference uses a PyTorch ResNet-50 patch classifier fine-tuned on SDNET2018-style data. Without trained weights the platform runs a clearly-labelled demo detector — it never presents demo output as a trained model.
            </p>
          </Reveal>
        </Section>

        <section className="border-y border-line bg-[#0a1120]">
          <Section eyebrow="Supported infrastructure" title="Built for every structure type" className="py-20">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {INFRA.map(({ icon: Icon, label }, i) => (
                <Reveal key={label} delay={i * 40}>
                  <div className="panel flex items-center gap-3 p-4">
                    <Icon className="size-5 text-accent" aria-hidden />
                    <span className="text-sm text-ink">{label}</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </Section>
        </section>

        <Section id="architecture" eyebrow="Technology architecture" title="Enterprise-grade, container-native" subtitle="React · Django REST · PostgreSQL · S3/MinIO · Celery + Redis · PyTorch/OpenCV worker">
          <Reveal>
            <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-3">
              {[
                { icon: Layers, title: "React dashboard", text: "TypeScript, Tailwind, Recharts, Leaflet; WebSocket live updates." },
                { icon: Database, title: "Django REST API", text: "JWT, RBAC, PostgreSQL, S3/MinIO storage, OpenAPI docs." },
                { icon: Cpu, title: "ML worker", text: "Celery inference queue; PyTorch + OpenCV; model registry." },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="panel p-5 text-center">
                  <Icon className="mx-auto size-6 text-accent" />
                  <p className="mt-3 font-semibold text-ink">{title}</p>
                  <p className="mt-1.5 text-sm text-ink-2">{text}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center">
              <Link to={user ? "/app/architecture" : "/login?next=/app/architecture"} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
                Explore the full system architecture <ArrowRight className="size-4" />
              </Link>
            </p>
          </Reveal>
        </Section>

        <section id="security" className="scroll-mt-20 border-y border-line bg-[#0a1120]">
          <Section eyebrow="Security" title="Secure by default" className="py-20">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SECURITY.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} delay={i * 60}>
                  <div className="panel h-full p-5">
                    <Icon className="size-5 text-accent" />
                    <h3 className="mt-4 font-semibold text-ink">{title}</h3>
                    <p className="mt-2 text-sm text-ink-2">{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </Section>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-gradient-to-br from-[#10213d] via-surface to-surface p-10 text-center sm:p-14">
              <div className="grid-backdrop absolute inset-0 opacity-60" aria-hidden />
              <div className="relative">
                <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Start monitoring your portfolio today</h2>
                <p className="mx-auto mt-4 max-w-xl text-ink-2">Seeded demo data, a working asynchronous pipeline and a model layer ready for your trained weights.</p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Link to={dashboardHref}>
                    <Button variant="primary" size="lg">Launch Dashboard</Button>
                  </Link>
                  <Link to={user ? "/app/inspections/new" : "/login?next=/app/inspections/new"}>
                    <Button variant="outline" size="lg">Explore AI Inspection</Button>
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <Logo />
            <p className="mt-3 text-xs text-ink-3">AI-powered predictive infrastructure maintenance. Results are decision support and must be verified by qualified engineers.</p>
          </div>
          <nav className="flex flex-wrap gap-5 text-sm text-ink-2" aria-label="Footer">
            <a href="#capabilities" className="hover:text-ink">Capabilities</a>
            <a href="#security" className="hover:text-ink">Security</a>
            <a href="/api/docs/" className="hover:text-ink">API docs</a>
            <Link to="/login" className="hover:text-ink">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
