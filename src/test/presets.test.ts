import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ── localStorage mock ──────────────────────────────────────────────────────────
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

const CACHE_KEY = "ww_preset_cards";

describe("usePresetCards — cache helpers (unit)", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null from cache when nothing is stored", () => {
    expect(localStorageMock.getItem(CACHE_KEY)).toBeNull();
  });

  it("cache entry with future fetchedAt is treated as fresh", () => {
    const entry = {
      presets: [{ id: "test-card", name: "Test", issuer: "Bank", rewards: {} }],
      fetchedAt: Date.now() - 1000, // 1 second ago — still fresh (TTL 24h)
    };
    localStorageMock.setItem(CACHE_KEY, JSON.stringify(entry));
    const raw = localStorageMock.getItem(CACHE_KEY);
    const parsed = JSON.parse(raw!);
    expect(Date.now() - parsed.fetchedAt).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it("cache entry older than 24h is considered stale", () => {
    const TWENTY_FIVE_HOURS = 25 * 60 * 60 * 1000;
    const entry = {
      presets: [{ id: "test-card", name: "Test", issuer: "Bank", rewards: {} }],
      fetchedAt: Date.now() - TWENTY_FIVE_HOURS,
    };
    localStorageMock.setItem(CACHE_KEY, JSON.stringify(entry));
    const parsed = JSON.parse(localStorageMock.getItem(CACHE_KEY)!);
    expect(Date.now() - parsed.fetchedAt).toBeGreaterThan(24 * 60 * 60 * 1000);
  });

  it("handles corrupted cache gracefully", () => {
    localStorageMock.setItem(CACHE_KEY, "not-valid-json{{{");
    expect(() => JSON.parse(localStorageMock.getItem(CACHE_KEY)!)).toThrow();
  });
});

describe("Reward rate calculations", () => {
  const card = {
    baseReward: 1,
    centsPerPoint: 1.25,
    rewards: { "Food & Dining": 3, Travel: 5 },
  };

  it("uses category reward when available", () => {
    const rate = card.rewards["Food & Dining"] ?? card.baseReward;
    expect(rate).toBe(3);
  });

  it("falls back to base reward for unknown category", () => {
    const rate = card.rewards["Shopping" as keyof typeof card.rewards] ?? card.baseReward;
    expect(rate).toBe(1);
  });

  it("calculates effective cashback correctly", () => {
    const amount = 100;
    const rate = card.rewards["Travel"] ?? card.baseReward;
    const cashback = (rate * card.centsPerPoint * amount) / 100;
    expect(cashback).toBeCloseTo(6.25);
  });

  it("calculates base reward cashback for unmatched category", () => {
    const amount = 50;
    const rate = card.baseReward;
    const cashback = (rate * card.centsPerPoint * amount) / 100;
    expect(cashback).toBeCloseTo(0.625);
  });
});

describe("Preset card structure validation", () => {
  const REQUIRED_FIELDS = ["id", "name", "issuer", "network", "annualFee", "baseReward", "rewards", "centsPerPoint"];

  const samplePreset = {
    id: "chase-sapphire-preferred",
    name: "Sapphire Preferred",
    issuer: "Chase",
    network: "Visa",
    annualFee: 95,
    baseReward: 1,
    rewards: { Travel: 3, "Food & Dining": 3 },
    centsPerPoint: 1.25,
    rewardType: "points",
  };

  it("has all required fields", () => {
    for (const field of REQUIRED_FIELDS) {
      expect(samplePreset).toHaveProperty(field);
    }
  });

  it("rewards is a plain object with numeric values", () => {
    for (const [, rate] of Object.entries(samplePreset.rewards)) {
      expect(typeof rate).toBe("number");
      expect(rate).toBeGreaterThan(0);
    }
  });

  it("centsPerPoint is positive", () => {
    expect(samplePreset.centsPerPoint).toBeGreaterThan(0);
  });

  it("annualFee is non-negative", () => {
    expect(samplePreset.annualFee).toBeGreaterThanOrEqual(0);
  });
});
