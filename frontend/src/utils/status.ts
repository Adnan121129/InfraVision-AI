import type { AlertStatus, HealthStatus, InspectionStatus, ProcessingStage, RiskLevel, Severity } from "@/types/api";

/** Fixed status palette (always shown with a label or icon, never colour alone). */
export const STATUS_COLORS = {
  good: "#0ca30c",
  warn: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  neutral: "#74829a",
  accent: "#38bdf8",
} as const;

export const SEVERITY_ORDER: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const SEVERITY_META: Record<Severity, { label: string; color: string }> = {
  LOW: { label: "Low", color: STATUS_COLORS.good },
  MEDIUM: { label: "Medium", color: STATUS_COLORS.warn },
  HIGH: { label: "High", color: STATUS_COLORS.serious },
  CRITICAL: { label: "Critical", color: STATUS_COLORS.critical },
};

export const RISK_META: Record<RiskLevel, { label: string; color: string }> = {
  LOW: { label: "Low risk", color: STATUS_COLORS.good },
  MEDIUM: { label: "Medium risk", color: STATUS_COLORS.warn },
  HIGH: { label: "High risk", color: STATUS_COLORS.serious },
  CRITICAL: { label: "Critical risk", color: STATUS_COLORS.critical },
};

export const HEALTH_META: Record<HealthStatus, { label: string; color: string }> = {
  HEALTHY: { label: "Healthy", color: STATUS_COLORS.good },
  WARNING: { label: "Warning", color: STATUS_COLORS.warn },
  CRITICAL: { label: "Critical", color: STATUS_COLORS.critical },
};

export const INSPECTION_STATUS_META: Record<InspectionStatus, { label: string; color: string }> = {
  PENDING: { label: "Uploading", color: STATUS_COLORS.neutral },
  QUEUED: { label: "Queued", color: "#3987e5" },
  PROCESSING: { label: "Processing", color: STATUS_COLORS.accent },
  COMPLETED: { label: "Completed", color: STATUS_COLORS.good },
  FAILED: { label: "Failed", color: STATUS_COLORS.critical },
};

export const ALERT_STATUS_META: Record<AlertStatus, { label: string; color: string }> = {
  OPEN: { label: "Open", color: STATUS_COLORS.critical },
  INVESTIGATING: { label: "Investigating", color: STATUS_COLORS.warn },
  RESOLVED: { label: "Resolved", color: STATUS_COLORS.good },
};

export const PIPELINE_STAGES: { stage: ProcessingStage; label: string; description: string }[] = [
  { stage: "UPLOADING", label: "Uploading", description: "Transferring imagery to the API" },
  { stage: "STORED", label: "Stored", description: "Persisted to S3 / MinIO object storage" },
  { stage: "QUEUED", label: "Queued", description: "Task published to Redis for the ML worker" },
  { stage: "PREPROCESSING", label: "Preprocessing", description: "OpenCV normalisation & enhancement" },
  { stage: "INFERENCE", label: "AI inference", description: "Model predicts defect regions" },
  { stage: "ANALYZING", label: "Analyzing defects", description: "Severity scoring & health index" },
  { stage: "COMPLETED", label: "Completed", description: "Predictions written to PostgreSQL" },
];

export function stageIndex(stage: ProcessingStage): number {
  return PIPELINE_STAGES.findIndex((s) => s.stage === stage);
}

export function healthColor(score: number | null | undefined, healthy = 75, critical = 50): string {
  if (score === null || score === undefined) return STATUS_COLORS.neutral;
  if (score >= healthy) return STATUS_COLORS.good;
  if (score >= critical) return STATUS_COLORS.warn;
  return STATUS_COLORS.critical;
}

export const DEFECT_LABELS: Record<string, string> = {
  CRACK: "Concrete crack",
  SPALLING: "Spalling",
  CORROSION: "Corrosion",
  RUST: "Rust staining",
  EXPOSED_REBAR: "Exposed rebar",
  EFFLORESCENCE: "Efflorescence",
  SURFACE_DAMAGE: "Surface damage",
  DEFORMATION: "Deformation",
  OTHER: "Other",
};

export const ASSET_TYPE_LABELS: Record<string, string> = {
  BRIDGE: "Bridge",
  ROAD: "Road",
  BUILDING: "Building",
  TUNNEL: "Tunnel",
  TOWER: "Tower",
  DAM: "Dam",
  INDUSTRIAL: "Industrial",
  OTHER: "Other",
};
