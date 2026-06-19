import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useExpenses, Expense } from "@/hooks/useExpenses";

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });
vi.stubGlobal("crypto", { randomUUID: () => "exp-" + Math.random().toString(36).slice(2, 8) });

describe("useExpenses", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("starts with empty expenses for new user", () => {
    const { result } = renderHook(() => useExpenses("user1"));
    expect(result.current.expenses).toEqual([]);
  });

  it("addExpense creates and returns expense", () => {
    const { result } = renderHook(() => useExpenses("user1"));
    let newExp: Expense;
    act(() => {
      newExp = result.current.addExpense({ amount: 25, category: "Food & Dining", description: "Lunch", date: "2026-02-20" });
    });
    expect(newExp!.amount).toBe(25);
    expect(result.current.expenses).toHaveLength(1);
    expect(result.current.expenses[0].description).toBe("Lunch");
  });

  it("deleteExpense removes specific expense", () => {
    const { result } = renderHook(() => useExpenses("user1"));
    let e1: Expense, e2: Expense;
    act(() => { e1 = result.current.addExpense({ amount: 10, category: "Transport", description: "Bus", date: "2026-02-20" }); });
    act(() => { e2 = result.current.addExpense({ amount: 20, category: "Shopping", description: "Shoes", date: "2026-02-20" }); });
    expect(result.current.expenses).toHaveLength(2);
    act(() => { result.current.deleteExpense(e1!.id); });
    expect(result.current.expenses).toHaveLength(1);
    expect(result.current.expenses[0].id).toBe(e2!.id);
  });

  it("resetExpenses clears all expenses", () => {
    const { result } = renderHook(() => useExpenses("user1"));
    act(() => { result.current.addExpense({ amount: 10, category: "Other", description: "Test", date: "2026-02-20" }); });
    act(() => { result.current.addExpense({ amount: 20, category: "Other", description: "Test2", date: "2026-02-20" }); });
    expect(result.current.expenses).toHaveLength(2);
    act(() => { result.current.resetExpenses(); });
    expect(result.current.expenses).toEqual([]);
  });

  it("getMonthExpenses filters by year and month", () => {
    const { result } = renderHook(() => useExpenses("user1"));
    act(() => { result.current.addExpense({ amount: 10, category: "Other", description: "Feb", date: "2026-02-15" }); });
    act(() => { result.current.addExpense({ amount: 20, category: "Other", description: "Jan", date: "2026-01-10" }); });
    const febExpenses = result.current.getMonthExpenses(2026, 2);
    expect(febExpenses).toHaveLength(1);
    expect(febExpenses[0].description).toBe("Feb");
  });

  it("getTotalByCategory groups correctly", () => {
    const { result } = renderHook(() => useExpenses("user1"));
    act(() => { result.current.addExpense({ amount: 10, category: "Food & Dining", description: "A", date: "2026-02-01" }); });
    act(() => { result.current.addExpense({ amount: 20, category: "Food & Dining", description: "B", date: "2026-02-02" }); });
    act(() => { result.current.addExpense({ amount: 5, category: "Transport", description: "C", date: "2026-02-03" }); });
    const totals = result.current.getTotalByCategory(result.current.expenses);
    expect(totals["Food & Dining"]).toBe(30);
    expect(totals["Transport"]).toBe(5);
  });

  it("expenses are scoped per userId", () => {
    const { result: r1 } = renderHook(() => useExpenses("user1"));
    act(() => { r1.current.addExpense({ amount: 100, category: "Other", description: "User1 exp", date: "2026-02-20" }); });
    const { result: r2 } = renderHook(() => useExpenses("user2"));
    expect(r2.current.expenses).toEqual([]);
  });

  it("persists to localStorage", () => {
    const { result } = renderHook(() => useExpenses("user1"));
    act(() => { result.current.addExpense({ amount: 50, category: "Health", description: "Meds", date: "2026-02-20" }); });
    // Check localStorage was called with the right key
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "ww_expenses_user1",
      expect.stringContaining("Meds")
    );
  });
});
