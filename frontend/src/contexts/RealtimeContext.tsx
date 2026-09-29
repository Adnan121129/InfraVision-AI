import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { tokenStore } from "@/api/tokens";
import type { RealtimeEvent } from "@/types/api";

import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

export type ConnectionState = "connecting" | "open" | "closed";
type Listener = (event: RealtimeEvent) => void;

interface RealtimeContextValue {
  state: ConnectionState;
  subscribe: (listener: Listener) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

function socketUrl(token: string): string {
  const base = import.meta.env.VITE_WS_URL ?? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
  return `${base.replace(/\/$/, "")}/ws/inspections/?token=${encodeURIComponent(token)}`;
}

/**
 * WebSocket connection for inspection lifecycle events. Reconnects with
 * exponential backoff; while disconnected, pages fall back to polling.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [state, setState] = useState<ConnectionState>("closed");
  const listeners = useRef(new Set<Listener>());
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    if (!user) return;
    let socket: WebSocket | null = null;
    let attempts = 0;
    let retryTimer: number | undefined;
    let pingTimer: number | undefined;
    let stopped = false;

    const connect = () => {
      const token = tokenStore.access;
      if (!token || stopped) return;
      setState("connecting");
      socket = new WebSocket(socketUrl(token));
      socket.onopen = () => {
        attempts = 0;
        setState("open");
        pingTimer = window.setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "ping" })), 25_000);
      };
      socket.onmessage = (message) => {
        let event: RealtimeEvent;
        try {
          event = JSON.parse(message.data as string);
        } catch {
          return;
        }
        if (event.type !== "inspection.update" && event.type !== "alert.created") return;
        listeners.current.forEach((listener) => listener(event));
        const important =
          event.type === "alert.created"
            ? event.alert.severity === "CRITICAL"
            : event.kind === "started" || event.kind === "completed" || event.kind === "failed";
        if (important) notifyRef.current(event.message, { level: event.level });
      };
      socket.onclose = () => {
        window.clearInterval(pingTimer);
        setState("closed");
        if (stopped) return;
        attempts += 1;
        retryTimer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5)));
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      socket?.close();
      setState("closed");
    };
  }, [user]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo(() => ({ state, subscribe }), [state, subscribe]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used within RealtimeProvider");
  return ctx;
}

/** Subscribe to realtime events for the lifetime of the component. */
export function useRealtimeEvents(listener: Listener) {
  const { subscribe } = useRealtime();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => subscribe((event) => ref.current(event)), [subscribe]);
}
