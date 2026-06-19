import { test, expect } from "./fixtures";

test.describe("Cashback / reward calculation", () => {
  test("expense form previews reward earned before submission", async ({ authedPage: page }) => {
    // Fill amount
    await page.locator('input[placeholder*="0.00"], input[type="number"]').first().fill("100");

    // Select Food & Dining (Chase Sapphire gives 3x = 3.75% effective)
    const catSelect = page.locator("select").first();
    await catSelect.selectOption("Food & Dining");

    await page.waitForTimeout(500);

    // Reward preview should show a non-zero value
    const preview = page.getByText(/\d+\.\d+\s*(pts|cashback|miles)/i);
    await expect(preview).toBeVisible({ timeout: 3000 });
  });

  test("switching categories updates the reward preview", async ({ authedPage: page }) => {
    const amountInput = page.locator('input[placeholder*="0.00"], input[type="number"]').first();
    await amountInput.fill("100");

    const catSelect = page.locator("select").first();
    await catSelect.selectOption("Food & Dining");
    await page.waitForTimeout(300);
    const preview1 = await page.getByText(/\d+\.\d+\s*(pts|cashback|miles)/i).first().textContent();

    await catSelect.selectOption("Shopping");
    await page.waitForTimeout(300);
    const preview2 = await page.getByText(/\d+\.\d+\s*(pts|cashback|miles)/i).first().textContent();

    // Food & Dining earns 3x, Shopping earns 1x — previews should differ
    expect(preview1).not.toBe(preview2);
  });

  test("reward type matches selected card", async ({ authedPage: page }) => {
    await page.locator('input[placeholder*="0.00"], input[type="number"]').first().fill("50");
    // Chase Sapphire Preferred is a points card
    await expect(page.getByText(/pts/i).first()).toBeVisible({ timeout: 3000 });
  });
});
