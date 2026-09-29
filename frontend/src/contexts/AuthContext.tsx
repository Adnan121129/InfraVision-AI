import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { setSessionExpiredHandler } from "@/api/client";
import { authApi } from "@/api/endpoints";
import { tokenStore } from "@/api/tokens";
import type { Role, User } from "@/types/api";

const ROLE_RANK: Record<Role, number> = { VIEWER: 1, INSPECTOR: 2, ENGINEER: 3, ADMINISTRATOR: 4 };

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: { email: string; password: string; first_name: string; last_name: string; organization?: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasRole: (role: Role) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(Boolean(tokenStore.access || tokenStore.refresh));
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setSessionExpired(true);
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    if (!tokenStore.access && !tokenStore.refresh) return;
    const controller = new AbortController();
    authApi
      .me(controller.signal)
      .then(setUser)
      .catch(() => {
        if (!controller.signal.aborted) tokenStore.clear();
      })
      .finally(() => {
        if (!controller.signal.aborted) setInitializing(false);
      });
    return () => controller.abort();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    tokenStore.set(data.access, data.refresh);
    setSessionExpired(false);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload: Parameters<AuthContextValue["register"]>[0]) => {
    const data = await authApi.register(payload);
    tokenStore.set(data.access, data.refresh);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const refresh = tokenStore.refresh;
    try {
      if (refresh) await authApi.logout(refresh);
    } catch {
      /* the token may already be invalid; local sign-out still proceeds */
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await authApi.me());
  }, []);

  const hasRole = useCallback((role: Role) => (user ? ROLE_RANK[user.role] >= ROLE_RANK[role] : false), [user]);

  const value = useMemo(
    () => ({ user, initializing, sessionExpired, login, register, logout, refreshUser, hasRole }),
    [user, initializing, sessionExpired, login, register, logout, refreshUser, hasRole],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
