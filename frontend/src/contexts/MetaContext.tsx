import { createContext, useContext, useMemo, type ReactNode } from "react";

import { metaApi } from "@/api/endpoints";
import { useApi } from "@/hooks/useApi";
import type { Choice, Meta } from "@/types/api";

import { useAuth } from "./AuthContext";

interface MetaContextValue {
  meta: Meta | undefined;
  label: (group: keyof Omit<Meta, "upload_limits">, value: string | null | undefined) => string;
}

const MetaContext = createContext<MetaContextValue | null>(null);

export function MetaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data } = useApi((signal) => metaApi.get(signal), [user?.id], { enabled: Boolean(user) });

  const value = useMemo<MetaContextValue>(() => {
    const lookup = new Map<string, Map<string, string>>();
    if (data) {
      for (const [group, choices] of Object.entries(data)) {
        if (Array.isArray(choices)) lookup.set(group, new Map((choices as Choice[]).map((c) => [c.value, c.label])));
      }
    }
    return {
      meta: data,
      label: (group, value) => (value ? lookup.get(group)?.get(value) ?? value : "—"),
    };
  }, [data]);

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta(): MetaContextValue {
  const ctx = useContext(MetaContext);
  if (!ctx) throw new Error("useMeta must be used within MetaProvider");
  return ctx;
}
