import type {
  Alert,
  AlertStatus,
  AlertSummary,
  AnalyticsData,
  Asset,
  AssetInput,
  AssetMarker,
  AssetOption,
  DashboardData,
  DefectSummary,
  ExplorerDetection,
  HealthHistoryPoint,
  ImageRecord,
  InspectionDetail,
  InspectionListItem,
  InspectionResults,
  InspectionStatusPayload,
  LoginResponse,
  Meta,
  MLModel,
  Paginated,
  PlatformSettings,
  QueueOverview,
  ReviewStatus,
  RiskAnalysis,
  User,
} from "@/types/api";

import { api } from "./client";

export type Query = Record<string, string | number | boolean | string[] | undefined | null>;

/** Serialise query params; arrays become repeated keys (?severity=HIGH&severity=CRITICAL). */
export function buildParams(query: Query = {}): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.append(key, String(value));
  }
  return params;
}

const get = async <T>(url: string, query?: Query, signal?: AbortSignal) =>
  (await api.get<T>(url, { params: buildParams(query), signal })).data;

export const authApi = {
  login: async (email: string, password: string) => (await api.post<LoginResponse>("/auth/login/", { email, password })).data,
  register: async (payload: { email: string; password: string; first_name: string; last_name: string; organization?: string; job_title?: string }) =>
    (await api.post<LoginResponse>("/auth/register/", payload)).data,
  logout: async (refresh: string) => api.post("/auth/logout/", { refresh }),
  me: (signal?: AbortSignal) => get<User>("/auth/me/", undefined, signal),
  updateMe: async (payload: Partial<User>) => (await api.patch<User>("/auth/me/", payload)).data,
  changePassword: async (current_password: string, new_password: string) =>
    api.post("/auth/change-password/", { current_password, new_password }),
};

export const metaApi = {
  get: (signal?: AbortSignal) => get<Meta>("/meta/", undefined, signal),
};

export const assetsApi = {
  list: (query?: Query, signal?: AbortSignal) => get<Paginated<Asset>>("/assets/", query, signal),
  get: (id: number | string, signal?: AbortSignal) => get<Asset>(`/assets/${id}/`, undefined, signal),
  create: async (payload: AssetInput) => (await api.post<Asset>("/assets/", payload)).data,
  update: async (id: number, payload: Partial<AssetInput>) => (await api.patch<Asset>(`/assets/${id}/`, payload)).data,
  archive: async (id: number) => (await api.post<Asset>(`/assets/${id}/archive/`)).data,
  restore: async (id: number) => (await api.post<Asset>(`/assets/${id}/restore/`)).data,
  remove: async (id: number) => api.delete(`/assets/${id}/`),
  map: (query?: Query, signal?: AbortSignal) => get<AssetMarker[]>("/assets/map/", query, signal),
  options: (signal?: AbortSignal) => get<AssetOption[]>("/assets/options/", undefined, signal),
  healthHistory: (id: number | string, signal?: AbortSignal) => get<HealthHistoryPoint[]>(`/assets/${id}/health-history/`, undefined, signal),
  riskAnalysis: (id: number | string, signal?: AbortSignal) => get<RiskAnalysis>(`/assets/${id}/risk-analysis/`, undefined, signal),
  defectSummary: (id: number | string, signal?: AbortSignal) => get<DefectSummary>(`/assets/${id}/defect-summary/`, undefined, signal),
};

export const inspectionsApi = {
  list: (query?: Query, signal?: AbortSignal) => get<Paginated<InspectionListItem>>("/inspections/", query, signal),
  get: (id: number | string, signal?: AbortSignal) => get<InspectionDetail>(`/inspections/${id}/`, undefined, signal),
  create: async (payload: { structural_asset: number; inspection_type: string; notes?: string }) =>
    (await api.post<InspectionDetail>("/inspections/", payload)).data,
  uploadImage: async (inspectionId: number, file: File, onProgress?: (percent: number) => void, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("inspection", String(inspectionId));
    form.append("file", file);
    return (
      await api.post<ImageRecord>("/images/upload/", form, {
        signal,
        timeout: 300_000,
        onUploadProgress: (event) => {
          if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
        },
      })
    ).data;
  },
  removeImage: async (imageId: number) => api.delete(`/images/${imageId}/`),
  submit: async (id: number) => (await api.post<InspectionStatusPayload>(`/inspections/${id}/submit/`)).data,
  retry: async (id: number) => (await api.post<InspectionStatusPayload>(`/inspections/${id}/retry/`)).data,
  reprocess: async (id: number) => (await api.post<InspectionStatusPayload>(`/inspections/${id}/reprocess/`)).data,
  status: (id: number | string, signal?: AbortSignal) => get<InspectionStatusPayload>(`/inspections/${id}/status/`, undefined, signal),
  results: (id: number | string, signal?: AbortSignal) => get<InspectionResults>(`/inspections/${id}/results/`, undefined, signal),
  queue: (signal?: AbortSignal) => get<QueueOverview>("/inspections/queue/", undefined, signal),
  remove: async (id: number) => api.delete(`/inspections/${id}/`),
};

export const detectionsApi = {
  list: (query?: Query, signal?: AbortSignal) => get<Paginated<ExplorerDetection>>("/detections/", query, signal),
  review: async (id: number, review_status: ReviewStatus) =>
    (await api.patch<ExplorerDetection>(`/detections/${id}/`, { review_status })).data,
};

export const alertsApi = {
  list: (query?: Query, signal?: AbortSignal) => get<Paginated<Alert>>("/alerts/", query, signal),
  summary: (query?: Query, signal?: AbortSignal) => get<AlertSummary>("/alerts/summary/", query, signal),
  update: async (id: number, payload: { status?: AlertStatus; resolution_notes?: string; assigned_to?: number | null }) =>
    (await api.patch<Alert>(`/alerts/${id}/`, payload)).data,
};

export const analyticsApi = {
  dashboard: (signal?: AbortSignal) => get<DashboardData>("/dashboard/", undefined, signal),
  analytics: (query?: Query, signal?: AbortSignal) => get<AnalyticsData>("/analytics/", query, signal),
};

export const modelsApi = {
  list: (signal?: AbortSignal) => get<Paginated<MLModel>>("/models/", { page_size: 50 }, signal),
  active: (signal?: AbortSignal) => get<MLModel | null>("/models/active/", undefined, signal),
  update: async (id: number, payload: Partial<Pick<MLModel, "status" | "description">>) =>
    (await api.patch<MLModel>(`/models/${id}/`, payload)).data,
};

export const usersApi = {
  list: (query?: Query, signal?: AbortSignal) => get<Paginated<User>>("/users/", query, signal),
  create: async (payload: Partial<User> & { password: string }) => (await api.post<User>("/users/", payload)).data,
  update: async (id: number, payload: Partial<User> & { password?: string }) => (await api.patch<User>(`/users/${id}/`, payload)).data,
  deactivate: async (id: number) => api.delete(`/users/${id}/`),
  summary: (signal?: AbortSignal) => get<Record<string, number>>("/users/summary/", undefined, signal),
};

export const settingsApi = {
  get: (signal?: AbortSignal) => get<PlatformSettings>("/settings/", undefined, signal),
  update: async (payload: Partial<PlatformSettings>) => (await api.patch<PlatformSettings>("/settings/", payload)).data,
};

export const healthApi = {
  check: (signal?: AbortSignal) => get<{ status: string; checks: Record<string, boolean>; storage_backend: string }>("/health/", { deep: 1 }, signal),
};
