import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";

import { tokenStore } from "./tokens";

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

/** Normalised error thrown by every API call; ``message`` is safe to show users. */
export class ApiError extends Error {
  status: number;
  code: string;
  fieldErrors: Record<string, string[]>;

  constructor(message: string, status = 0, code = "error", fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const api = axios.create({ baseURL: API_BASE_URL, timeout: 30_000 });

type SessionListener = () => void;
let onSessionExpired: SessionListener | null = null;
export function setSessionExpiredHandler(listener: SessionListener | null) {
  onSessionExpired = listener;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.access;
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

// Single-flight refresh: concurrent 401s wait for one refresh request.
let refreshing: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refresh = tokenStore.refresh;
  if (!refresh) throw new ApiError("Your session has expired. Please sign in again.", 401, "session_expired");
  const response = await axios.post(`${API_BASE_URL}/auth/refresh/`, { refresh });
  tokenStore.set(response.data.access, response.data.refresh);
  return response.data.access as string;
}

function flattenFieldErrors(errors: unknown): Record<string, string[]> {
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) return {};
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
    if (Array.isArray(value)) result[key] = value.map(String);
    else if (typeof value === "string") result[key] = [value];
  }
  return result;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) return new ApiError("Request cancelled", 0, "cancelled");
  if (error instanceof AxiosError) {
    if (!error.response) {
      if (error.code === "ECONNABORTED") return new ApiError("The server took too long to respond. Please try again.", 0, "timeout");
      return new ApiError("Network connection lost. Check your connection and try again.", 0, "network_error");
    }
    const { status, data } = error.response;
    const payload = (data ?? {}) as { detail?: string; code?: string; errors?: unknown };
    const fallback =
      status >= 500
        ? "The server encountered an error. Please try again shortly."
        : status === 403
          ? "You do not have permission to perform this action."
          : status === 404
            ? "The requested resource was not found."
            : "The request could not be completed.";
    return new ApiError(payload.detail || fallback, status, payload.code || "error", flattenFieldErrors(payload.errors));
  }
  return new ApiError(error instanceof Error ? error.message : "Unexpected error");
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthCall = original?.url?.includes("/auth/login") || original?.url?.includes("/auth/refresh");
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall && tokenStore.refresh) {
      original._retried = true;
      try {
        refreshing = refreshing ?? refreshAccessToken();
        const token = await refreshing;
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${token}` };
        return api(original);
      } catch {
        tokenStore.clear();
        onSessionExpired?.();
        return Promise.reject(new ApiError("Your session has expired. Please sign in again.", 401, "session_expired"));
      } finally {
        refreshing = null;
      }
    }
    return Promise.reject(toApiError(error));
  },
);
