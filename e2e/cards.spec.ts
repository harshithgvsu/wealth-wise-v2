import { test, expect } from "./fixtures";

test.describe("Credit Card Hub", () => {
  async function goToCards(page: Parameters<typeof test>[1]["authedPage"]) {
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      btns.find((b) => b.textContent?.trim() === "Cards")?.click();
    });
    await page.waitForTimeout(1000);
  }

  test("Cards section shows user cards", async ({ authedPage: page }) => {
    await goToCards(page);
    await expect(page.getByText("Sapphire Preferred")).toBeVisible({ timeout: 5000 });
  });

  test("Cards section shows issuer and network", async ({ authedPage: page }) => {
    await goToCards(page);
    await expect(page.getByText("Chase")).toBeVisible();
    await expect(page.getByText("Visa")).toBeVisible();
  });

  test("Add Card sheet opens with preset list from API", async ({ authedPage: page }) => {
    await goToCards(page);
    await page.getByRole("button", { name: /Add Card/i }).click();
    await page.waitForTimeout(500);
    // Presets from mock API should appear
    await expect(page.getByText("Sapphire Preferred")).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Gold Card")).toBeVisible({ timeout: 3000 });
  });

  test("stale indicator is hidden when API responds", async ({ authedPage: page }) => {
    await goToCards(page);
    // The mock API responds successfully, so stale banner should not show
    await expect(page.getByText(/cached card benefits/i)).not.toBeVisible();
  });

  test("reward summary stats are visible", async ({ authedPage: page }) => {
    await goToCards(page);
    await expect(page.getByText(/Annual Fees|Est. Rewards|Net Value/i).first()).toBeVisible({ timeout: 3000 });
  });
});
