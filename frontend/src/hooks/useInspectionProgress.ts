import { useCallback, useEffect, useRef, useState } from "react";

import { inspectionsApi } from "@/api/endpoints";
import { useRealtime, useRealtimeEvents } from "@/contexts/RealtimeContext";
import type { InspectionStatusPayload, ProcessingStage } from "@/types/api";

import { useInterval } from "./useInterval";

const TERMINAL = new Set(["COMPLETED", "FAILED"]);

/**
 * Live processing status for one inspection: WebSocket events when connected,
 * with efficient polling as a fallback (and a slow safety poll otherwise).
 */
export function useInspectionProgress(id: number | null, enabled = true) {
  const { state } = useRealtime();
  const [status, setStatus] = useState<InspectionStatusPayload | null>(null);
  const [detail, setDetail] = useState<string | undefined>();
  const [lastActiveStage, setLastActiveStage] = useState<ProcessingStage | undefined>();
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (!id || inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await inspectionsApi.status(id);
      setStatus(next);
      if (!TERMINAL.has(next.processing_stage)) setLastActiveStage(next.processing_stage);
    } catch {
      /* transient network errors are retried on the next tick */
    } finally {
      inFlight.current = false;
    }
  }, [id]);

  useEffect(() => {
    if (id && enabled) void poll();
  }, [id, enabled, poll]);

  useRealtimeEvents((event) => {
    if (event.type !== "inspection.update" || event.inspection.id !== id) return;
    const match = /\(([^)]+)\)\.?$/.exec(event.message);
    setDetail(match?.[1]);
    if (!TERMINAL.has(event.inspection.processing_stage)) setLastActiveStage(event.inspection.processing_stage);
    setStatus((prev) => ({
      ...(prev ?? ({} as InspectionStatusPayload)),
      id: event.inspection.id,
      reference: event.inspection.reference,
      status: event.inspection.status,
      processing_stage: event.inspection.processing_stage,
      defect_count: event.inspection.defect_count,
      overall_health_score: event.inspection.overall_health_score,
      max_severity: event.inspection.max_severity,
      error_message: event.inspection.error_message,
      inference_mode: event.inspection.inference_mode,
      updated_at: event.inspection.updated_at ?? new Date().toISOString(),
    }));
    if (TERMINAL.has(event.inspection.status)) void poll();
  });

  const active = enabled && Boolean(id) && (!status || !TERMINAL.has(status.status));
  useInterval(() => void poll(), active ? (state === "open" ? 15_000 : 2_500) : null);

  return { status, detail, lastActiveStage, refresh: poll };
}
