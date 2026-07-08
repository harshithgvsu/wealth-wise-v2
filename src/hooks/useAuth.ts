import { useState, useEffect, useCallback } from "react";

export interface PaycheckRecord {
  id: string;
  amount: number;
  date: string;
}

export interface SavingsAccount {
  id: string;
  name: string;
  amountPerPaycheck: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  grossMonthlyIncome: number;
  netMonthlyIncome: number;
  health401kMonthly: number;
  otherPreTaxBenefits: number;
  rentMortgage: number;
  carPayment: number;
  insurancePremiums: number;
  subscriptions: number;
  otherFixedExpenses: number;
  savingsGoalPercent: number;
  investmentGoal: "retirement" | "property" | "emergency" | "growth" | "other";
  riskTolerance: "conservative" | "moderate" | "aggressive";
  investmentHorizonYears: number;
  onboardingComplete: boolean;
  paychecks: PaycheckRecord[];
  savingsAccounts: SavingsAccount[];
  createdAt: string;
}

export interface AuthState {
  user: UserProfile | null;
  isLoggedIn: boolean;
}

const API = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

// Cookie-based: no token in localStorage. All requests use credentials: 'include'
// so the httpOnly ww_token cookie is sent automatically by the browser.
async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function syncCardsToLocal(userId: string) {
  try {
    const res = await apiFetch("/cards");
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && Array.isArray(data.cards)) {
      localStorage.setItem(`ww_cards_${userId}`, JSON.stringify(data.cards));
    }
  } catch {
    console.warn("Cards sync failed");
  }
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({ user: null, isLoggedIn: false });

  // On mount, validate session via cookie (no localStorage read needed)
  useEffect(() => {
    apiFetch("/auth/me")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.user) {
          setAuthState({ user: data.user, isLoggedIn: true });
          syncCardsToLocal(data.user.id);
        }
      })
      .catch(() => {
        // No valid session — stay logged out
      });
  }, []);

  const signup = useCallback(
    async (email: string, password: string, name: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await apiFetch("/auth/signup", {
          method: "POST",
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json();
        if (!data.success) return { success: false, error: data.error };

        // Cookie is set by the server; just update state
        setAuthState({ user: data.user, isLoggedIn: true });
        syncCardsToLocal(data.user.id);
        return { success: true };
      } catch {
        return { success: false, error: "Network error. Check your connection." };
      }
    },
    []
  );

  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await apiFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!data.success) return { success: false, error: data.error };

        setAuthState({ user: data.user, isLoggedIn: true });
        syncCardsToLocal(data.user.id);
        return { success: true };
      } catch {
        return { success: false, error: "Network error. Check your connection." };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    // Clear the httpOnly cookie server-side
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    // Clear any remaining local data (cards cache only — no financial data stored locally)
    const userId = authState.user?.id;
    if (userId) localStorage.removeItem(`ww_cards_${userId}`);
    setAuthState({ user: null, isLoggedIn: false });
  }, [authState.user?.id]);

  const updateProfile = useCallback(
    async (updates: Partial<Omit<UserProfile, "id" | "email" | "createdAt">>) => {
      setAuthState((prev) => {
        if (!prev.user) return prev;
        return { user: { ...prev.user, ...updates }, isLoggedIn: true };
      });

      setAuthState((prev) => {
        if (!prev.user) return prev;
        const userId = prev.user.id;
        apiFetch(`/users/${userId}`, {
          method: "PATCH",
          body: JSON.stringify(updates),
        })
          .then(async (res) => {
            const data = await res.json();
            if (data.success && data.user) {
              setAuthState({ user: data.user, isLoggedIn: true });
            }
          })
          .catch(() => console.warn("Profile sync failed, will retry on next load"));
        return prev;
      });
    },
    []
  );

  const resetPassword = useCallback(
    async (email: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await apiFetch("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ email, newPassword }),
        });
        const data = await res.json();
        if (!data.success) return { success: false, error: data.error };
        return { success: true };
      } catch {
        return { success: false, error: "Network error. Check your connection." };
      }
    },
    []
  );

  return { ...authState, signup, login, logout, updateProfile, resetPassword };
}
