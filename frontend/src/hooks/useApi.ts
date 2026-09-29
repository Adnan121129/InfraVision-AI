import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, toApiError } from "@/api/client";

interface ApiState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  /** true while refetching with previous data still on screen */
  refreshing: boolean;
}

/**
 * Minimal data-fetching hook: cancels stale requests, keeps the previous data
 * visible while refetching (no layout jump) and exposes ``refetch``.
 */
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: unknown[], options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<ApiState<T>>({ data: undefined, error: null, loading: enabled, refreshing: false });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((s) => ({ ...s, loading: s.data === undefined, refreshing: s.data !== undefined, error: null }));
    try {
      const data = await fetcherRef.current(controller.signal);
      if (!controller.signal.aborted) setState({ data, error: null, loading: false, refreshing: false });
    } catch (err) {
      const error = toApiError(err);
      if (controller.signal.aborted || error.code === "cancelled") return;
      setState((s) => ({ ...s, error, loading: false, refreshing: false }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void run();
    return () => controllerRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  const setData = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setState((s) => ({ ...s, data: typeof updater === "function" ? (updater as (p: T | undefined) => T)(s.data) : updater }));
  }, []);

  return { ...state, refetch: run, setData };
}
