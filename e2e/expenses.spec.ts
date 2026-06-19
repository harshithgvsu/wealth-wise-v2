import { test, expect } from "./fixtures";

test.describe("Expense management", () => {
  test("dashboard loads after auth", async ({ authedPage: page }) => {
    await expect(page.getByText(/Hey,/i)).toBeVisible({ timeout: 5000 });
  });

  test("can add an expense via the form", async ({ authedPage: page }) => {
    // Fill amount
    const amountInput = page.locator('input[placeholder*="0.00"], input[type="number"]').first();
    await amountInput.fill("42.50");

    // Select category
    const categorySelect = page.locator("select").first();
    await categorySelect.selectOption("Food & Dining");

    // Fill description
    const descInput = page.locator('input[placeholder*="describe"]').first();
    await descInput.fill("Lunch at cafe");

    // Submit
    await page.getByRole("button", { name: /Add|Save|Log/i }).first().click();
    await page.waitForTimeout(1000);

    // Expense should appear in the list
    await expect(page.getByText("Lunch at cafe")).toBeVisible({ timeout: 5000 });
  });

  test("expense form shows card selector", async ({ authedPage: page }) => {
    // The card dropdown should show the seeded card
    const cardSelect = page.locator("select, [role='combobox']").filter({ hasText: /card|Chase|cash/i });
    await expect(cardSelect.first()).toBeVisible();
  });

  test("expense form shows reward preview", async ({ authedPage: page }) => {
    const amountInput = page.locator('input[placeholder*="0.00"], input[type="number"]').first();
    await amountInput.fill("100");
    // Reward preview label should appear
    await expect(page.getByText(/earned|reward|pts|cashback/i).first()).toBeVisible({ timeout: 3000 });
  });
});
