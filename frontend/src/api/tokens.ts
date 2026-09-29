// Token persistence. The access token is short-lived (15 min); the refresh
// token is rotated on every refresh and blacklisted on logout server-side.
const ACCESS_KEY = "iv.access";
const REFRESH_KEY = "iv.refresh";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) - tokens stay in memory only */
  }
}

let accessToken: string | null = safeGet(ACCESS_KEY);
let refreshToken: string | null = safeGet(REFRESH_KEY);

export const tokenStore = {
  get access() {
    return accessToken;
  },
  get refresh() {
    return refreshToken;
  },
  set(access: string, refresh?: string) {
    accessToken = access;
    safeSet(ACCESS_KEY, access);
    if (refresh) {
      refreshToken = refresh;
      safeSet(REFRESH_KEY, refresh);
    }
  },
  clear() {
    accessToken = null;
    refreshToken = null;
    safeSet(ACCESS_KEY, null);
    safeSet(REFRESH_KEY, null);
  },
};
