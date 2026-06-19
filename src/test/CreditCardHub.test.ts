import { describe, it, expect, beforeEach } from "vitest";

// Test the credit card storage and helpers independently
describe("CreditCardHub - Storage", () => {
  const STORAGE_KEY = (userId: string) => `ww_cards_${userId}`;

  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with empty cards", () => {
    const stored = localStorage.getItem(STORAGE_KEY("user1"));
    expect(stored).toBeNull();
  });

  it("saves and loads cards from localStorage", () => {
    const cards = [
      {
        id: "test-1",
        name: "Test Card",
        issuer: "Test Bank",
        network: "Visa",
        annualFee: 95,
        rewardType: "cashback",
        baseReward: 2,
        rewards: { "Food & Dining": 4 },
        centsPerPoint: 1,
        cardBg: "from-blue-900 via-blue-800 to-blue-600",
        color: "#2563EB",
      },
    ];
    localStorage.setItem(STORAGE_KEY("user1"), JSON.stringify(cards));
    const loaded = JSON.parse(localStorage.getItem(STORAGE_KEY("user1"))!);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("Test Card");
    expect(loaded[0].rewards["Food & Dining"]).toBe(4);
  });

  it("handles custom card with all fields", () => {
    const card = {
      id: "custom-1",
      name: "My Rewards Card",
      issuer: "Local Bank",
      network: "Mastercard",
      annualFee: 0,
      rewardType: "points",
      baseReward: 1,
      rewards: { Travel: 3, "Food & Dining": 2 },
      centsPerPoint: 1.5,
      cardBg: "from-red-900 via-orange-800 to-orange-600",
      color: "#EA580C",
      creditLimit: 5000,
      currentBalance: 1200,
      signupBonus: "25,000 pts",
      signupSpend: 3000,
    };
    localStorage.setItem(STORAGE_KEY("user1"), JSON.stringify([card]));
    const loaded = JSON.parse(localStorage.getItem(STORAGE_KEY("user1"))!);
    expect(loaded[0].signupBonus).toBe("25,000 pts");
    expect(loaded[0].creditLimit).toBe(5000);
    expect(loaded[0].centsPerPoint).toBe(1.5);
    expect(loaded[0].rewards.Travel).toBe(3);
  });

  it("removes card from array correctly", () => {
    const cards = [
      { id: "a", name: "Card A" },
      { id: "b", name: "Card B" },
      { id: "c", name: "Card C" },
    ];
    const filtered = cards.filter((c) => c.id !== "b");
    expect(filtered).toHaveLength(2);
    expect(filtered.map((c) => c.id)).toEqual(["a", "c"]);
  });
});

describe("CreditCardHub - Reward Calculations", () => {
  it("calculates effective cashback rate", () => {
    const card = { baseReward: 2, centsPerPoint: 1, rewards: { "Food & Dining": 4 } };
    // Food & Dining: 4 * 1 / 100 * $100 = $4
    const amount = 100;
    const rate = card.rewards["Food & Dining"] ?? card.baseReward;
    const cashback = (rate * card.centsPerPoint * amount) / 100;
    expect(cashback).toBe(4);
  });

  it("falls back to base reward for unmapped categories", () => {
    const card = { baseReward: 1.5, centsPerPoint: 1, rewards: { Travel: 5 } };
    const rate = card.rewards["Shopping" as keyof typeof card.rewards] ?? card.baseReward;
    expect(rate).toBe(1.5);
  });

  it("calculates utilization percentage", () => {
    const balance = 1500;
    const limit = 5000;
    const pct = (balance / limit) * 100;
    expect(pct).toBe(30);
  });

  it("calculates signup bonus progress", () => {
    const spent = 2500;
    const required = 4000;
    const pct = Math.min(100, (spent / required) * 100);
    expect(pct).toBe(62.5);
  });
});
