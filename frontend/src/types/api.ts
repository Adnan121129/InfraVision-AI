// Types mirroring the Django REST API payloads.

export type Role = "ADMINISTRATOR" | "ENGINEER" | "INSPECTOR" | "VIEWER";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskLevel = Severity;
export type HealthStatus = "HEALTHY" | "WARNING" | "CRITICAL";
export type InspectionStatus = "PENDING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
export type ProcessingStage =
  | "UPLOADING"
  | "STORED"
  | "QUEUED"
  | "PREPROCESSING"
  | "INFERENCE"
  | "ANALYZING"
  | "COMPLETED"
  | "FAILED";
export type InferenceMode = "demo" | "production" | "";
export type AlertStatus = "OPEN" | "INVESTIGATING" | "RESOLVED";
export type ReviewStatus = "UNREVIEWED" | "CONFIRMED" | "REJECTED";

export interface Paginated<T> {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface User {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
  role_display: string;
  job_title: string;
  organization: string;
  phone: string;
  is_active: boolean;
  date_joined: string;
  last_login: string | null;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginResponse extends AuthTokens {
  user: User;
}

export interface Choice {
  value: string;
  label: string;
}

export interface Meta {
  asset_types: Choice[];
  material_types: Choice[];
  risk_levels: Choice[];
  health_statuses: Choice[];
  severities: Choice[];
  inspection_types: Choice[];
  inspection_statuses: Choice[];
  processing_stages: Choice[];
  defect_types: Choice[];
  review_statuses: Choice[];
  alert_statuses: Choice[];
  alert_types: Choice[];
  roles: Choice[];
  upload_limits: { max_file_mb: number; max_images: number; extensions: string[] };
}

export interface Asset {
  id: number;
  asset_code: string;
  asset_name: string;
  asset_type: string;
  asset_type_display: string;
  material_type: string;
  material_type_display: string;
  description: string;
  latitude: string | null;
  longitude: string | null;
  location: string;
  region: string;
  installation_date: string | null;
  age_years: number | null;
  structural_system: string;
  dimensions: string;
  operator: string;
  inspection_interval_days: number;
  current_health_score: number | null;
  health_status: HealthStatus | null;
  risk_level: RiskLevel;
  last_inspection_at: string | null;
  is_archived: boolean;
  open_alerts_count: number;
  inspections_count: number;
  created_at: string;
  updated_at: string;
}

export type AssetInput = Pick<
  Asset,
  | "asset_name"
  | "asset_type"
  | "material_type"
  | "description"
  | "location"
  | "region"
  | "structural_system"
  | "dimensions"
  | "operator"
  | "inspection_interval_days"
> & {
  latitude: string | null;
  longitude: string | null;
  installation_date: string | null;
};

export interface AssetMarker {
  id: number;
  asset_code: string;
  asset_name: string;
  asset_type: string;
  asset_type_display: string;
  latitude: string;
  longitude: string;
  location: string;
  current_health_score: number | null;
  health_status: HealthStatus | null;
  risk_level: RiskLevel;
  last_inspection_at: string | null;
  open_alerts_count: number;
}

export interface AssetOption {
  id: number;
  asset_code: string;
  asset_name: string;
  asset_type: string;
  location: string;
}

export interface HealthHistoryPoint {
  id: number;
  reference: string;
  inspection_date: string;
  overall_health_score: number;
  defect_count: number;
  max_severity: Severity | null;
}

export interface RiskFactor {
  label: string;
  detail: string;
  contribution: number;
  impact: "high" | "medium" | "low";
}

export interface RiskAnalysis {
  generated_by: "system";
  method: string;
  generated_at: string;
  has_data: boolean;
  risk_score: number | null;
  priority: { code: string; label: string } | null;
  summary: string;
  factors: RiskFactor[];
  recommendations: string[];
  recommended_next_inspection: string;
  trend_per_month: number | null;
  projected_score_90d: number | null;
  disclaimer: string;
}

export interface DefectSummary {
  by_type: { defect_type: string; count: number }[];
  by_severity: { severity: Severity; count: number }[];
  total: number;
}

export interface ImageRecord {
  id: number;
  inspection: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  image_width: number;
  image_height: number;
  health_score: number | null;
  thumbnail_url: string | null;
  preview_url: string | null;
  annotated_url: string | null;
  original_url: string | null;
  detections_count: number | null;
  uploaded_at: string;
}

export interface Detection {
  id: number;
  inspection: number;
  image_record: number;
  defect_type: string;
  defect_type_display: string;
  severity: Severity;
  confidence_score: number;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  area_ratio: number;
  description: string;
  review_status: ReviewStatus;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ExplorerDetection extends Detection {
  inspection_reference: string;
  inspection_date: string;
  inference_mode: InferenceMode;
  asset_id: number;
  asset_name: string;
  image_width: number;
  image_height: number;
  image_url: string | null;
}

export interface StageReport {
  name: string;
  label: string;
  status: "completed" | "skipped" | "failed";
  duration_ms: number;
  details: Record<string, unknown>;
}

export interface InspectionListItem {
  id: number;
  reference: string;
  structural_asset: number;
  asset_name: string;
  asset_code: string;
  asset_type: string;
  inspection_date: string;
  inspection_type: string;
  inspection_type_display: string;
  status: InspectionStatus;
  processing_stage: ProcessingStage;
  health_status: HealthStatus | null;
  overall_health_score: number | null;
  defect_count: number;
  max_severity: Severity | null;
  inspector_name: string | null;
  model_version: string;
  inference_mode: InferenceMode;
  processing_time: number | null;
  images_count: number;
  thumbnail_url: string | null;
  error_message: string;
  created_at: string;
  completed_at: string | null;
}

export interface InspectionDetail extends InspectionListItem {
  notes: string;
  celery_task_id: string;
  attempts: number;
  queued_at: string | null;
  started_at: string | null;
  updated_at: string;
  summary: Record<string, unknown>;
  preprocessing_report: StageReport[];
  images: ImageRecord[];
  ml_model_detail: {
    id: number;
    model_name: string;
    version: string;
    framework: string;
    architecture: string;
    is_demo: boolean;
    accuracy: number | null;
  } | null;
}

export interface InspectionStatusPayload {
  id: number;
  reference: string;
  status: InspectionStatus;
  processing_stage: ProcessingStage;
  overall_health_score: number | null;
  defect_count: number;
  max_severity: Severity | null;
  error_message: string;
  inference_mode: InferenceMode;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface InspectionResults {
  inspection: InspectionDetail;
  images: (ImageRecord & { detections: Detection[] })[];
  summary: {
    overall_health_score: number | null;
    health_status: HealthStatus | null;
    defect_count: number;
    rejected_count: number;
    severity_counts: Record<Severity, number>;
    type_counts: Record<string, number>;
    avg_confidence: number | null;
    max_severity: Severity | null;
  };
  confidence_distribution: { range: string; count: number }[];
  preprocessing_report: StageReport[];
  timings: Record<string, number>;
  model: { name: string | null; version: string; framework: string | null; architecture: string | null; is_demo: boolean };
  inference_mode: InferenceMode;
  processing_time: number | null;
}

export interface QueueOverview {
  window_days: number;
  counts: { uploading: number; queued: number; processing: number; completed: number; failed: number };
  items: InspectionListItem[];
}

export interface Alert {
  id: number;
  reference: string;
  structural_asset: number;
  asset_name: string;
  asset_code: string;
  asset_type: string;
  inspection: number | null;
  inspection_reference: string | null;
  alert_type: string;
  alert_type_display: string;
  defect_type: string;
  defect_type_display: string | null;
  title: string;
  description: string;
  severity: Severity;
  status: AlertStatus;
  assigned_to: number | null;
  assigned_to_detail: { id: number; full_name: string; email: string; role: Role } | null;
  resolution_notes: string;
  resolved_by_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface AlertSummary {
  total: number;
  open: number;
  investigating: number;
  resolved: number;
  critical_active: number;
  high_active: number;
}

export interface MLModel {
  id: number;
  model_name: string;
  version: string;
  framework: string;
  framework_display: string;
  architecture: string;
  task: string;
  description: string;
  is_demo: boolean;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1_score: number | null;
  training_dataset: string;
  classes: string[];
  input_size: number | null;
  artifact_uri: string;
  status: "ACTIVE" | "STAGING" | "INACTIVE" | "RETIRED";
  deployed_at: string | null;
  last_heartbeat_at: string | null;
  created_at: string;
  inspections_processed: number;
  failed_inspections: number;
  avg_processing_time: number | null;
  avg_confidence: number | null;
  detections_count: number;
  last_used_at: string | null;
}

export interface TrendPoint {
  month: string;
  avg_health: number | null;
  assets_scored?: number;
  inspections: number;
  critical_inspections: number;
}

export interface DashboardData {
  generated_at: string;
  kpis: {
    total_assets: number;
    new_assets_this_month: number;
    healthy_assets: number;
    at_risk_assets: number;
    critical_assets: number;
    uninspected_assets: number;
    average_health: number | null;
    average_health_delta: number | null;
    inspections_this_month: number;
    inspections_last_month: number;
    inspections_change_pct: number | null;
    active_alerts: number;
    alerts_new_7d: number;
    alerts_change_pct: number | null;
  };
  health_distribution: { status: HealthStatus; label: string; count: number }[];
  risk_distribution: Record<RiskLevel, number>;
  health_trend: TrendPoint[];
  recent_inspections: {
    id: number;
    reference: string;
    asset_id: number;
    asset_name: string;
    asset_type: string;
    inspection_date: string;
    overall_health_score: number | null;
    health_status: HealthStatus | null;
    defect_count: number;
    max_severity: Severity | null;
    status: InspectionStatus;
    processing_stage: ProcessingStage;
    inference_mode: InferenceMode;
  }[];
  critical_alerts: {
    id: number;
    reference: string;
    title: string;
    severity: Severity;
    status: AlertStatus;
    created_at: string;
    defect_type: string;
    asset_id: number;
    asset_name: string;
    inspection_reference: string | null;
  }[];
  processing_queue: QueueOverview["counts"];
  model_status: {
    id: number;
    model_name: string;
    version: string;
    framework: string;
    architecture: string;
    accuracy: number | null;
    is_demo: boolean;
    status: string;
    inspections_processed: number;
    avg_inference_time: number | null;
    last_used_at: string | null;
    last_heartbeat_at: string | null;
  } | null;
  demo_data: { completed_inspections: number; demo_inspections: number };
}

export interface AnalyticsData {
  filters: Record<string, unknown>;
  range: { date_from: string; date_to: string };
  totals: {
    inspections: number;
    completed_inspections: number;
    demo_inspections: number;
    detections: number;
    avg_confidence: number | null;
    avg_processing_time: number | null;
    alerts_opened: number;
    alerts_resolved: number;
    mean_time_to_resolve_hours: number | null;
  };
  health_trend: TrendPoint[];
  defects_by_type: { defect_type: string; label: string; count: number; avg_confidence: number }[];
  defects_by_severity: { severity: Severity; count: number }[];
  inspections_per_month: { month: string; total: number; completed: number; failed: number }[];
  critical_incidents: { month: string; critical: number; high: number }[];
  risk_distribution: { risk_level: RiskLevel; count: number }[];
  confidence_trend: { month: string; avg_confidence: number | null }[];
  processing_time: { month: string; avg_seconds: number | null }[];
  maintenance_trend: { month: string; opened: number; resolved: number }[];
  health_by_asset_type: { asset_type: string; avg_health: number | null; count: number }[];
  top_risk_assets: { id: number; asset_code: string; asset_name: string; asset_type: string; current_health_score: number; risk_level: RiskLevel }[];
}

export interface PlatformSettings {
  organization_name: string;
  healthy_threshold: number;
  critical_threshold: number;
  alert_min_severity: "MEDIUM" | "HIGH" | "CRITICAL";
  alert_min_confidence: number;
  health_drop_alert_points: number;
  default_inspection_interval_days: number;
  auto_alerts_enabled: boolean;
  updated_at: string;
  updated_by_name: string | null;
}

export interface RealtimeInspectionEvent {
  type: "inspection.update";
  kind: "queued" | "started" | "stage" | "completed" | "failed";
  inspection: {
    id: number;
    reference: string;
    status: InspectionStatus;
    processing_stage: ProcessingStage;
    asset_id: number;
    asset_name: string;
    defect_count: number;
    overall_health_score: number | null;
    max_severity: Severity | null;
    inference_mode: InferenceMode;
    error_message: string;
    updated_at: string | null;
  };
  message: string;
  level: "info" | "success" | "warning" | "error";
}

export interface RealtimeAlertEvent {
  type: "alert.created";
  alert: { id: number; reference: string; title: string; severity: Severity; asset_id: number };
  message: string;
  level: "info" | "success" | "warning" | "error";
}

export type RealtimeEvent = RealtimeInspectionEvent | RealtimeAlertEvent;
