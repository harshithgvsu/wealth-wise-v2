import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/apiClient";

export type Category =
  | "Food & Dining"
  | "Transport"
  | "Shopping"
  | "Health"
  | "Entertainment"
  | "Bills & Utilities"
  | "Education"
  | "Other";

export type RewardType = "points" | "miles" | "cashback";

export interface CardOption {
  id: string;
  label: string;
  rewardType: RewardType;
  baseRate: number;
  categoryRates?: Partial<Record<Category, number>>;
  cardType?: "credit" | "debit";
}

export interface Expense {
  id: string;
  amount: number;
  category: Category;
  description: string;
  date: string;
  createdAt: number;
  cardId?: string;
  cardLabel?: string;
  rewardRate?: number;
  rewardsEarned?: number;
  rewardType?: RewardType;
}

interface HubCard {
  id: string;
  name: string;
  issuer?: string;
  rewardType?: RewardType;
  baseReward?: number;
  rewards?: Record<string, unknown>;
  cardType?: "credit" | "debit";
}

export const CATEGORIES: Category[] = [
  "Food & Dining",
  "Transport",
  "Shopping",
  "Health",
  "Entertainment",
  "Bills & Utilities",
  "Education",
  "Other",
];

export const DEFAULT_CARD_OPTION: CardOption = {
  id: "no-rewards",
  label: "Cash / Debit (No rewards)",
  rewardType: "cashback",
  baseRate: 0,
};

export const CATEGORY_COLORS: Record<Category, string> = {
  "Food & Dining": "hsl(152 76% 40%)",
  Transport: "hsl(210 80% 55%)",
  Shopping: "hsl(280 70% 55%)",
  Health: "hsl(0 72% 55%)",
  Entertainment: "hsl(45 90% 55%)",
  "Bills & Utilities": "hsl(200 80% 50%)",
  Education: "hsl(170 70% 45%)",
  Other: "hsl(215 20% 55%)",
};

// ── Config ─────────────────────────────────────────────────────────────────
const CARDS_KEY = (userId?: string) => `ww_cards_${userId || "anon"}`;

// ── Category normalization (same as before) ────────────────────────────────
const CATEGORY_NORMALIZATION: Record<string, Category> = {
  food: "Food & Dining", dining: "Food & Dining", restaurant: "Food & Dining",
  restaurants: "Food & Dining", groceries: "Food & Dining", grocery: "Food & Dining",
  transport: "Transport", travel: "Transport", transit: "Transport", gas: "Transport",
  shopping: "Shopping", retail: "Shopping",
  health: "Health", medical: "Health",
  entertainment: "Entertainment",
  bills: "Bills & Utilities", utilities: "Bills & Utilities",
  education: "Education",
};

function normalizeCategoryKey(key: string): Category | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const direct = CATEGORIES.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (direct) return direct;
  const cleaned = trimmed.toLowerCase().replace(/[^a-z& ]/g, "").trim();
  return CATEGORY_NORMALIZATION[cleaned] || null;
}

// ── Card helpers ─────────────────────────────────────────────────────────────
// Cards themselves are stored on the backend (see /cards); this reads a local
// mirror of that data that CreditCardHub.tsx keeps in sync on every fetch/add/
// remove, so reward calculation here can stay synchronous. Source of truth is
// the API, not this key — see CreditCardHub.tsx's cacheCards().
export function getExpenseCardOptions(userId?: string): CardOption[] {
  try {
    const cards = JSON.parse(localStorage.getItem(CARDS_KEY(userId)) || "[]") as HubCard[];
    if (!Array.isArray(cards) || cards.length === 0) return [DEFAULT_CARD_OPTION];

    const mapped: CardOption[] = cards
      .filter((c) => typeof c?.id === "string" && typeof c?.name === "string")
      .map((card) => {
        const categoryRates: Partial<Record<Category, number>> = {};
        for (const [key, rawValue] of Object.entries(card.rewards || {})) {
          const norm = normalizeCategoryKey(key);
          const val = typeof rawValue === "number" ? rawValue : Number(rawValue);
          if (norm && Number.isFinite(val)) categoryRates[norm] = val;
        }
        return {
          id: card.id,
          label: card.issuer ? `${card.name} (${card.issuer})` : card.name,
          rewardType: card.rewardType || "points",
          baseRate: card.cardType === "debit" ? 0 : (Number.isFinite(card.baseReward) ? Number(card.baseReward) : 1),
          categoryRates: card.cardType === "debit" ? {} : categoryRates,
          cardType: card.cardType,
        };
      });

    return mapped.length ? [DEFAULT_CARD_OPTION, ...mapped] : [DEFAULT_CARD_OPTION];
  } catch {
    return [DEFAULT_CARD_OPTION];
  }
}

export function calculateRewards(
  amount: number,
  cardId: string | undefined,
  category: Category,
  userId?: string
): { rate: number; rewardType: RewardType; rewardsEarned: number } {
  const options = getExpenseCardOptions(userId);
  const card = options.find((c) => c.id === cardId) || DEFAULT_CARD_OPTION;
  if (card.cardType === "debit") {
    return { rate: 0, rewardType: card.rewardType, rewardsEarned: 0 };
  }
  const rate = card.categoryRates?.[category] ?? card.baseRate;
  return {
    rate,
    rewardType: card.rewardType,
    rewardsEarned: Number((amount * rate).toFixed(2)),
  };
}

// ── Date helpers (timezone-safe) ───────────────────────────────────────────
export function localDateString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Parse YYYY-MM-DD string into a local Date (avoids UTC midnight → day-off bug)
export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useExpenses(userId?: string) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [syncing, setSyncing] = useState(false);
  const prevUserId = useRef(userId);

  // When userId changes (login/logout) clear in-memory state
  useEffect(() => {
    if (prevUserId.current !== userId) {
      prevUserId.current = userId;
      setExpenses([]);
    }
  }, [userId]);

  // On mount (or userId change) — fetch from server
  useEffect(() => {
    if (!userId) return;

    setSyncing(true);
    apiFetch("/expenses")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.expenses)) {
          setExpenses(data.expenses);
        }
      })
      .catch(() => console.warn("Expenses fetch failed"))
      .finally(() => setSyncing(false));
  }, [userId]);

  const addExpense = useCallback(
    (expense: Omit<Expense, "id" | "createdAt">) => {
      const cardOptions = getExpenseCardOptions(userId);
      const cardId = expense.cardId || DEFAULT_CARD_OPTION.id;
      const selectedCard = cardOptions.find((c) => c.id === cardId) || DEFAULT_CARD_OPTION;
      const rewards = calculateRewards(Math.abs(expense.amount), cardId, expense.category, userId);
      if (expense.amount < 0) rewards.rewardsEarned = -rewards.rewardsEarned;

      const newExpense: Expense = {
        ...expense,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        cardId,
        cardLabel: expense.cardLabel || selectedCard.label,
        rewardRate: rewards.rate,
        rewardType: rewards.rewardType,
        rewardsEarned: rewards.rewardsEarned,
      };

      // Optimistic update
      setExpenses((prev) => [newExpense, ...prev]);

      // Sync to server
      apiFetch("/expenses", {
        method: "POST",
        body: JSON.stringify({ expense: newExpense }),
      }).catch(() => console.warn("Expense sync failed — saved locally"));

      return newExpense;
    },
    [userId]
  );

  const deleteExpense = useCallback(
    (id: string) => {
      setExpenses((prev) => prev.filter((e) => e.id !== id));

      apiFetch(`/expenses/${id}`, { method: "DELETE" }).catch(() =>
        console.warn("Delete sync failed")
      );
    },
    []
  );

  const resetExpenses = useCallback(() => {
    setExpenses([]);
    apiFetch("/expenses", { method: "DELETE" }).catch(() =>
      console.warn("Reset sync failed")
    );
  }, [userId]);

  const getMonthExpenses = useCallback(
    (year: number, month: number) =>
      expenses.filter((e) => {
        // Parse YYYY-MM-DD safely without UTC conversion
        const [y, m] = e.date.split("-").map(Number);
        return y === year && m === month;
      }),
    [expenses]
  );

  const getTotalByCategory = useCallback((exps: Expense[]) => {
    const map: Partial<Record<Category, number>> = {};
    for (const e of exps) map[e.category] = (map[e.category] || 0) + e.amount;
    return map;
  }, []);

  const getDailyTotals = useCallback((exps: Expense[]) => {
    const map: Record<string, number> = {};
    for (const e of exps) map[e.date] = (map[e.date] || 0) + e.amount;
    return map;
  }, []);

  // Note: the pre-backend "bulk sync locally-saved expenses on login" path
  // used to live here as syncLocalToServer(), but it called an undefined
  // readLocal() (dead code — never actually reachable) and nothing imported
  // it. That job is handled by src/utils/migrateLocalData.ts instead, which
  // already does the one-time push via /expenses/bulk on first login.

  return {
    expenses,
    syncing,
    addExpense,
    deleteExpense,
    resetExpenses,
    getMonthExpenses,
    getTotalByCategory,
    getDailyTotals,
  };
}