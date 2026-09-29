import { Boxes, Database, HardDrive, Layers, MonitorSmartphone, Server, Workflow, Zap } from "lucide-react";
import { useState, type ReactNode } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Badge";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { cn } from "@/utils/cn";

type NodeId = "react" | "django" | "celery" | "postgres" | "storage" | "worker";

interface NodeSpec {
  id: NodeId;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  icon: ReactNode;
  highlight?: boolean;
  tech: string[];
  duties: string[];
  code: string;
}

const W = 230;
const H = 84;

const NODES: NodeSpec[] = [
  {
    id: "react",
    title: "React Dashboard",
    subtitle: "Web frontend / UI",
    x: 30,
    y: 70,
    icon: <MonitorSmartphone className="size-4" />,
    tech: ["React 19", "TypeScript", "Tailwind CSS", "Recharts", "Leaflet"],
    duties: ["Drag-and-drop uploads with per-file progress", "Live processing timeline via WebSocket (polling fallback)", "Dashboards, analytics, asset intelligence"],
    code: "frontend/src",
  },
  {
    id: "django",
    title: "Django REST API",
    subtitle: "Core controller",
    x: 385,
    y: 70,
    icon: <Server className="size-4" />,
    highlight: true,
    tech: ["Django 5.2", "DRF", "SimpleJWT", "Channels", "drf-spectacular"],
    duties: ["JWT auth & role-based permissions", "Validates uploads, stores imagery, creates InspectionLog", "Publishes Celery tasks; never runs inference in-request"],
    code: "backend/apps",
  },
  {
    id: "celery",
    title: "Celery Queue",
    subtitle: "Redis / task dispatcher",
    x: 740,
    y: 70,
    icon: <Workflow className="size-4" />,
    tech: ["Celery 5", "Redis 7", "celery-beat"],
    duties: ["`inference` queue → ML worker", "`default` queue → thumbnails, alerts", "Beat: stalled-task recovery, overdue inspections"],
    code: "backend/config/celery.py",
  },
  {
    id: "postgres",
    title: "PostgreSQL",
    subtitle: "Relational store",
    x: 30,
    y: 330,
    icon: <Database className="size-4" />,
    tech: ["PostgreSQL 16", "Django ORM", "Migrations"],
    duties: ["Assets, inspections, images, detections", "Alerts, model registry, users & roles", "Analytics aggregations (GROUP BY month)"],
    code: "backend/apps/*/models.py",
  },
  {
    id: "storage",
    title: "S3 / MinIO Storage",
    subtitle: "Unstructured blob store",
    x: 385,
    y: 330,
    icon: <HardDrive className="size-4" />,
    tech: ["MinIO (local)", "AWS S3 (prod)", "django-storages", "SigV4 presigned URLs"],
    duties: ["Original uploads (never sent back unnecessarily)", "Thumbnails & 1600px previews", "Annotated result images"],
    code: "backend/apps/core/storage.py",
  },
  {
    id: "worker",
    title: "TF / PyTorch Worker",
    subtitle: "CNN inference model",
    x: 740,
    y: 330,
    icon: <Boxes className="size-4" />,
    tech: ["PyTorch", "torchvision ResNet-50", "OpenCV", "infravision_ml"],
    duties: ["Loads model once per process; registers it in the model registry", "OpenCV preprocessing → CNN → severity & health scoring", "Writes predictions to PostgreSQL"],
    code: "ml-worker/infravision_ml",
  },
];

const center = (id: NodeId) => {
  const n = NODES.find((node) => node.id === id)!;
  return { cx: n.x + W / 2, cy: n.y + H / 2, top: n.y, bottom: n.y + H, left: n.x, right: n.x + W };
};

interface EdgeSpec {
  id: string;
  d: string;
  label: string;
  lx: number;
  ly: number;
  accent?: boolean;
  nodes: NodeId[];
}

const r = center("react");
const dj = center("django");
const ce = center("celery");
const pg = center("postgres");
const st = center("storage");
const wk = center("worker");

const EDGES: EdgeSpec[] = [
  { id: "https", d: `M${r.right},${r.cy} H${dj.left}`, label: "HTTPS", lx: (r.right + dj.left) / 2, ly: r.cy - 10, nodes: ["react", "django"] },
  { id: "async", d: `M${dj.right},${dj.cy} H${ce.left}`, label: "Async", lx: (dj.right + ce.left) / 2, ly: dj.cy - 10, nodes: ["django", "celery"] },
  { id: "meta", d: `M${dj.cx - 40},${dj.bottom} V${250} H${pg.cx} V${pg.top}`, label: "Metadata", lx: (pg.cx + dj.cx - 40) / 2, ly: 242, nodes: ["django", "postgres"] },
  { id: "raw", d: `M${dj.cx + 20},${dj.bottom} V${st.top}`, label: "Raw visuals", lx: dj.cx + 70, ly: 285, nodes: ["django", "storage"] },
  { id: "infer", d: `M${ce.cx},${ce.bottom} V${wk.top}`, label: "Inference", lx: ce.cx + 46, ly: 250, nodes: ["celery", "worker"] },
  { id: "fetch", d: `M${wk.left},${wk.cy} H${st.right}`, label: "Fetch imagery", lx: (wk.left + st.right) / 2, ly: wk.cy - 10, nodes: ["worker", "storage"] },
  { id: "write", d: `M${wk.cx},${wk.bottom} V${480} H${pg.cx} V${pg.bottom}`, label: "Write predictions", lx: (wk.cx + pg.cx) / 2, ly: 472, nodes: ["worker", "postgres"] },
  { id: "ws", d: `M${ce.cx},${ce.top} V${30} H${r.cx} V${r.top}`, label: "Realtime events · Django Channels (WebSocket)", lx: (ce.cx + r.cx) / 2, ly: 22, accent: true, nodes: ["celery", "react"] },
];

const LIFECYCLE = [
  "User uploads structural imagery from the React dashboard",
  "React sends multipart requests to the Django REST API (JWT-authenticated)",
  "Django validates type, size, dimensions and decodes the header with Pillow",
  "Images are stored in S3 / MinIO; thumbnails and previews are generated asynchronously",
  "Django creates the InspectionLog and ImageRecords in PostgreSQL",
  "Django queues `inspections.run_inference` through Redis and stores the Celery task ID",
  "The ML worker (inference queue) retrieves the images from object storage",
  "OpenCV preprocessing normalises, denoises, balances and enhances each image",
  "The CNN (or demo detector) runs inference — sliding-window patches for ResNet models",
  "Detections are merged, de-duplicated and mapped back to original pixel coordinates",
  "Severity, confidence, bounding boxes, processing time and model version are stored",
  "Inspection status, asset health and maintenance alerts are updated in PostgreSQL",
  "A Channels event is pushed to every connected dashboard (polling if offline)",
  "The dashboard renders the completed inspection with annotated imagery",
];

const PREPROCESSING = ["Image loading", "Resolution normalization", "Noise reduction", "Color normalization", "Lighting correction", "Contrast enhancement", "Edge enhancement", "Image resizing", "Tensor conversion", "CNN inference"];

export default function ArchitecturePage() {
  useDocumentTitle("System architecture");
  const [active, setActive] = useState<NodeId>("django");
  const node = NODES.find((n) => n.id === active)!;

  return (
    <>
      <PageHeader
        eyebrow="Platform design"
        title="System architecture"
        subtitle="End-to-end data pipeline from raw visual upload to deep-learning inference. Select a component to see its responsibilities and where it lives in the codebase."
      />
      <div className="grid gap-5 2xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <CardHeader title="Predictive maintenance system architecture" subtitle="Animated connectors show the direction of data flow" />
          <div className="grid-backdrop overflow-x-auto px-4 pb-4">
            <svg viewBox="0 0 1000 510" className="mx-auto min-w-[720px]" role="img" aria-labelledby="arch-title arch-desc">
              <title id="arch-title">InfraVision AI system architecture</title>
              <desc id="arch-desc">
                React dashboard talks HTTPS to the Django REST API. Django stores metadata in PostgreSQL, raw visuals in S3/MinIO and dispatches asynchronous tasks through Celery and Redis. The PyTorch worker runs inference, fetching imagery and writing predictions to PostgreSQL; realtime events flow back to the dashboard over WebSockets.
              </desc>
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#74829a" />
                </marker>
                <marker id="arrow-accent" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#38bdf8" />
                </marker>
                <linearGradient id="node-hl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#1d3a72" />
                  <stop offset="1" stopColor="#15294f" />
                </linearGradient>
              </defs>
              {EDGES.map((edge) => {
                const lit = edge.nodes.includes(active);
                const stroke = edge.accent ? "#38bdf8" : lit ? "#a7b3c7" : "#3b4a63";
                return (
                  <g key={edge.id}>
                    <path d={edge.d} fill="none" stroke={stroke} strokeWidth={lit ? 1.8 : 1.3} strokeDasharray="3 5" strokeLinecap="round" className="animate-flow" markerEnd={edge.accent ? "url(#arrow-accent)" : "url(#arrow)"} opacity={edge.accent ? 0.85 : 1} />
                    <g transform={`translate(${edge.lx},${edge.ly})`}>
                      <rect x={-(edge.label.length * 3.6 + 10)} y={-11} width={edge.label.length * 7.2 + 20} height={20} rx={5} fill="#0b1220" stroke={lit || edge.accent ? "#2b3850" : "#1e2a3f"} />
                      <text textAnchor="middle" dy={3.5} fontSize={11} fontFamily="JetBrains Mono, monospace" fill={edge.accent ? "#38bdf8" : lit ? "#e8eef8" : "#a7b3c7"}>
                        {edge.label}
                      </text>
                    </g>
                  </g>
                );
              })}
              {NODES.map((n) => {
                const selected = n.id === active;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    onClick={() => setActive(n.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActive(n.id)}
                    tabIndex={0}
                    role="button"
                    aria-pressed={selected}
                    aria-label={`${n.title}: ${n.subtitle}`}
                    className="cursor-pointer outline-none"
                  >
                    <rect width={W} height={H} rx={42} fill={n.highlight ? "url(#node-hl)" : "#111a2b"} stroke={selected ? "#38bdf8" : n.highlight ? "#3987e5" : "#2b3850"} strokeWidth={selected ? 2 : 1.2} />
                    {selected && <rect width={W} height={H} rx={42} fill="none" stroke="#38bdf8" strokeOpacity={0.25} strokeWidth={8} />}
                    <text x={W / 2} y={36} textAnchor="middle" fontSize={17} fontWeight={600} fill="#e8eef8" fontFamily="Inter, system-ui, sans-serif">
                      {n.title}
                    </text>
                    <text x={W / 2} y={58} textAnchor="middle" fontSize={12} fontStyle="italic" fill="#a7b3c7" fontFamily="JetBrains Mono, monospace">
                      {n.subtitle}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </Card>
        <Card className="h-fit">
          <CardHeader icon={node.icon} title={node.title} subtitle={node.subtitle} />
          <div className="space-y-4 px-5 pb-5">
            <div className="flex flex-wrap gap-1.5">
              {node.tech.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
            <ul className="space-y-2">
              {node.duties.map((d) => (
                <li key={d} className="flex gap-2 text-sm text-ink-2">
                  <Zap className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                  {d}
                </li>
              ))}
            </ul>
            <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink-2">{node.code}</p>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader icon={<Workflow className="size-4" />} title="Inspection request lifecycle" subtitle="Heavy ML work never runs inside an HTTP request" />
          <ol className="space-y-2 px-5 pb-5">
            {LIFECYCLE.map((step, i) => (
              <li key={step} className="flex gap-3 text-sm">
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold", i < 6 ? "border-brand/50 text-brand" : i < 12 ? "border-accent/50 text-accent" : "border-good/50 text-good-ink")}>{i + 1}</span>
                <span className="pt-0.5 text-ink-2">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader icon={<Layers className="size-4" />} title="Modular OpenCV + CNN pipeline" subtitle="Configured via PREPROCESSING_STAGES; stages are pluggable classes" />
            <div className="flex flex-wrap items-center gap-1.5 px-5 pb-5">
              {PREPROCESSING.map((stage, i) => (
                <span key={stage} className="flex items-center gap-1.5">
                  <span className={cn("rounded-md border px-2 py-1 text-xs", i === PREPROCESSING.length - 1 ? "border-accent/50 bg-accent/10 text-accent" : "border-line bg-surface-2 text-ink-2")}>{stage}</span>
                  {i < PREPROCESSING.length - 1 && <span className="text-ink-3" aria-hidden>→</span>}
                </span>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader icon={<Boxes className="size-4" />} title="Swappable model layer" subtitle="Django depends only on PredictionService — never on a framework" />
            <div className="grid gap-2 px-5 pb-5 text-xs sm:grid-cols-3">
              {[
                ["PreprocessingService", "Runs the OpenCV stage pipeline and builds tensors for the model's InputSpec"],
                ["ModelService", "Loads, caches and describes the model selected by INFERENCE_MODE"],
                ["PredictionService", "Orchestrates inference, NMS, severity, health score and annotation"],
              ].map(([name, text]) => (
                <div key={name} className="rounded-lg border border-line bg-surface-2/60 p-3">
                  <p className="font-mono text-[11px] text-accent">{name}</p>
                  <p className="mt-1 text-ink-2">{text}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader icon={<Server className="size-4" />} title="Deployment topology" subtitle="docker compose up" />
            <div className="flex flex-wrap gap-1.5 px-5 pb-5">
              {["frontend (nginx)", "backend (uvicorn/ASGI)", "celery-worker", "celery-beat", "ml-worker", "postgres", "redis", "minio", "minio-init"].map((s) => (
                <Tag key={s}>{s}</Tag>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
