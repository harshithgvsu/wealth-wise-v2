import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/useAuth";

// ── localStorage mock ──────────────────────────────────────────────────────────
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });
vi.stubGlobal("crypto", { randomUUID: () => "test-uuid-" + Math.random().toString(36).slice(2, 8) });

// ── fetch mock helpers ─────────────────────────────────────────────────────────
function mockFetch(responses: Record<string, { status: number; body: object }>) {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const path = new URL(url).pathname;
    const match = Object.entries(responses).find(([k]) => path.includes(k));
    const { status, body } = match?.[1] ?? { status: 404, body: { success: false } };
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  }));
}

const MOCK_USER = { id: "user-abc", name: "Alex", email: "a@b.com" };
const MOCK_TOKEN = "mock-jwt-token";

describe("useAuth", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    // Default: /auth/me returns 401 (not logged in)
    mockFetch({ "/auth/me": { status: 401, body: { success: false } } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts logged out when no token in localStorage", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("restores session from cached user when token present", () => {
    store["ww_token"] = MOCK_TOKEN;
    store["ww_user"] = JSON.stringify(MOCK_USER);
    mockFetch({ "/auth/me": { status: 200, body: { success: true, user: MOCK_USER } } });

    const { result } = renderHook(() => useAuth());
    // Initial render reads cache synchronously
    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.user?.name).toBe("Alex");
  });

  it("signup calls API and sets logged-in state on success", async () => {
    mockFetch({
      "/auth/me": { status: 401, body: { success: false } },
      "/auth/signup": { status: 201, body: { success: true, token: MOCK_TOKEN, user: MOCK_USER } },
      "/cards": { status: 200, body: { success: true, cards: [] } },
    });
    const { result } = renderHook(() => useAuth());

    let res: { success: boolean; error?: string };
    await act(async () => { res = await result.current.signup("a@b.com", "pass123", "Alex"); });

    expect(res!.success).toBe(true);
    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.user?.name).toBe("Alex");
    expect(store["ww_token"]).toBe(MOCK_TOKEN);
  });

  it("signup returns error when API fails", async () => {
    mockFetch({
      "/auth/me": { status: 401, body: { success: false } },
      "/auth/signup": { status: 409, body: { success: false, error: "Email already registered" } },
    });
    const { result } = renderHook(() => useAuth());

    let res: { success: boolean; error?: string };
    await act(async () => { res = await result.current.signup("a@b.com", "pass123", "Alex"); });

    expect(res!.success).toBe(false);
    expect(res!.error).toContain("already registered");
    expect(result.current.isLoggedIn).toBe(false);
  });

  it("login calls API and sets logged-in state on success", async () => {
    mockFetch({
      "/auth/me": { status: 401, body: { success: false } },
      "/auth/login": { status: 200, body: { success: true, token: MOCK_TOKEN, user: MOCK_USER } },
      "/cards": { status: 200, body: { success: true, cards: [] } },
    });
    const { result } = renderHook(() => useAuth());

    let res: { success: boolean; error?: string };
    await act(async () => { res = await result.current.login("a@b.com", "pass123"); });

    expect(res!.success).toBe(true);
    expect(result.current.isLoggedIn).toBe(true);
  });

  it("login returns error on wrong password", async () => {
    mockFetch({
      "/auth/me": { status: 401, body: { success: false } },
      "/auth/login": { status: 401, body: { success: false, error: "Invalid credentials" } },
    });
    const { result } = renderHook(() => useAuth());

    let res: { success: boolean; error?: string };
    await act(async () => { res = await result.current.login("a@b.com", "wrongpass"); });

    expect(res!.success).toBe(false);
    expect(res!.error).toContain("Invalid");
  });

  it("logout clears token and user from localStorage", async () => {
    store["ww_token"] = MOCK_TOKEN;
    store["ww_user"] = JSON.stringify(MOCK_USER);
    mockFetch({ "/auth/me": { status: 200, body: { success: true, user: MOCK_USER } } });

    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoggedIn).toBe(true);

    act(() => { result.current.logout(); });
    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.user).toBeNull();
    expect(store["ww_token"]).toBeUndefined();
  });

  it("updateProfile merges fields into user state", async () => {
    store["ww_token"] = MOCK_TOKEN;
    store["ww_user"] = JSON.stringify(MOCK_USER);
    mockFetch({
      "/auth/me": { status: 200, body: { success: true, user: MOCK_USER } },
      "/users": { status: 200, body: { success: true, user: { ...MOCK_USER, grossMonthlyIncome: 5000 } } },
    });
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.updateProfile({ grossMonthlyIncome: 5000, netMonthlyIncome: 4000 });
    });

    expect(result.current.user?.grossMonthlyIncome).toBe(5000);
  });
});
