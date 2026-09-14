// ── Shared API client ────────────────────────────────────────────────────────
// The backend originally authenticated purely via an httpOnly cookie
// (ww_token). That breaks on this deployment: the frontend and backend are
// separate Render services under *.onrender.com, which is on the public
// suffix list — browsers won't attach a cookie set by one .onrender.com
// service to requests made to another, so every authenticated GET came back
// 401 even though login itself "succeeded" (its response body doesn't need
// the cookie round-trip to render). The backend now also returns the JWT in
// the login/signup response body; we store it here and send it as a Bearer
// token instead, which isn't subject to cross-site cookie rules.
//
// Stored in sessionStorage (not localStorage): cleared when the tab closes
// rather than lingering indefinitely, while still surviving a page reload.
// This is a step down from an httpOnly cookie (readable by any injected
// script) — the tradeoff Render's split-domain setup forces; a shared
// custom domain would let this go back to httpOnly cookies instead.
const TOKEN_KEY = "ww_auth_token";

export function getAuthToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // sessionStorage unavailable (private browsing, etc.) — auth falls back
    // to cookie-only, which still works for same-site/custom-domain deploys.
  }
}

export function clearAuthToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // no-op
  }
}

const API = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  return fetch(`${API}${path}`, {
    ...init,
    credentials: "include", // still send the cookie when it does work (same-site/custom domain)
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
}
