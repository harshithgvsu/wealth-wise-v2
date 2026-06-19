import { test, expect } from "@playwright/test";
import { setupApiMocks } from "./fixtures";

const API_BASE = "https://specifically-harbour-previously-technical.trycloudflare.com";

test.describe("Auth flows", () => {
  test.beforeEach(async ({ page }) => {
    // mock signup/login for auth tests
    await page.route(`${API_BASE}/auth/signup`, (route) =>
      route.fulfill({ status: 201, contentType: "application/json",
        body: JSON.stringify({ success: true, token: "fake-token", user: { id: "new-user", name: "New User", email: "new@test.com" } }) })
    );
    await page.route(`${API_BASE}/auth/login`, (route) => {
      const body = route.request().postDataJSON();
      if (body.password === "wrongpassword") {
        return route.fulfill({ status: 401, contentType: "application/json",
          body: JSON.stringify({ success: false, error: "Invalid credentials" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ success: true, token: "fake-token", user: { id: "user-1", name: "Test User", email: body.email } }) });
    });
    await page.route(`${API_BASE}/cards/presets`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ success: true, presets: [] }) })
    );
    await page.route(`${API_BASE}/**`, (route) => route.continue());
  });

  test("shows sign-in form on first load", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Sign In")).toBeVisible();
    await expect(page.getByPlaceholder(/you@example.com/i)).toBeVisible();
  });

  test("can switch between Sign In and Create Account tabs", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByPlaceholder(/Alex Johnson/i)).toBeVisible();
    await page.getByRole("button", { name: "Sign In" }).first().click();
    await expect(page.getByPlaceholder(/Alex Johnson/i)).not.toBeVisible();
  });

  test("shows error on wrong password", async ({ page }) => {
    await page.goto("/");
    await page.fill('input[type="email"]', "test@test.com");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.getByRole("button", { name: /^Sign In$/i }).last().click();
    await expect(page.getByText(/Invalid credentials/i)).toBeVisible({ timeout: 5000 });
  });

  test("navigates to dashboard after successful login", async ({ page }) => {
    await setupApiMocks(page);
    await page.goto("/");
    await page.fill('input[type="email"]', "test@test.com");
    await page.fill('input[type="password"]', "password123");
    await page.getByRole("button", { name: /^Sign In$/i }).last().click();
    await expect(page.getByText(/Dashboard/i)).toBeVisible({ timeout: 5000 });
  });
});
