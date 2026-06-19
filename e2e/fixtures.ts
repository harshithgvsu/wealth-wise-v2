import { test as base, type Page } from "@playwright/test";

const API_BASE = "https://specifically-harbour-previously-technical.trycloudflare.com";

export const USER_ID = "e2e-test-user-42";

export const MOCK_USER = { id: USER_ID, name: "E2E Tester", email: "e2e@test.com" };

export const MOCK_CARDS = [
  {
    id: "e2e-card-1",
    clientId: "e2e-card-1",
    name: "Sapphire Preferred",
    issuer: "Chase",
    network: "Visa",
    annualFee: 95,
    rewardType: "points",
    baseReward: 1,
    rewards: { Travel: 3, "Food & Dining": 3 },
    centsPerPoint: 1.25,
    cardBg: "from-blue-900 via-blue-800 to-blue-600",
    color: "#2A6FBF",
  },
];

export const MOCK_PRESETS = [
  { id: "chase-sapphire-preferred", name: "Sapphire Preferred", issuer: "Chase", network: "Visa", annualFee: 95, baseReward: 1, rewardType: "points", rewards: { Travel: 3, "Food & Dining": 3 }, centsPerPoint: 1.25, cardBg: "from-blue-900 to-blue-600", color: "#2A6FBF", signupBonus: "60,000 pts" },
  { id: "amex-gold", name: "Gold Card", issuer: "Amex", network: "Amex", annualFee: 250, baseReward: 1, rewardType: "points", rewards: { "Food & Dining": 4, Groceries: 4 }, centsPerPoint: 1.0, cardBg: "from-yellow-700 to-yellow-400", color: "#D4A843" },
];

// Mocks all backend calls so tests run without a real server
export async function setupApiMocks(page: Page, overrides: Record<string, unknown> = {}) {
  await page.route(`${API_BASE}/auth/me`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ success: true, user: MOCK_USER, ...overrides }) })
  );
  await page.route(`${API_BASE}/expenses`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ success: true, expenses: [] }) })
  );
  await page.route(`${API_BASE}/expenses/**`, (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({ status: 201, contentType: "application/json",
        body: JSON.stringify({ success: true, expense: { id: "exp-1", ...route.request().postDataJSON() } }) });
    if (route.request().method() === "DELETE")
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ success: true }) });
    route.continue();
  });
  await page.route(`${API_BASE}/cards/presets`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ success: true, presets: MOCK_PRESETS }) })
  );
  await page.route(`${API_BASE}/cards/bulk`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ success: true }) })
  );
  await page.route(`${API_BASE}/cards`, (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ success: true, cards: MOCK_CARDS }) });
    if (route.request().method() === "POST")
      return route.fulfill({ status: 201, contentType: "application/json",
        body: JSON.stringify({ success: true, card: route.request().postDataJSON() }) });
    route.continue();
  });
  await page.route(`${API_BASE}/users/**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ success: true }) })
  );
  await page.route(`${API_BASE}/ai/**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ success: true, message: "AI response" }) })
  );
}

// Seeds localStorage with auth state + cards before the page initializes
export async function seedAuth(page: Page) {
  await page.addInitScript(({ userId, user, cards }) => {
    localStorage.setItem("ww_token", "e2e-fake-token");
    localStorage.setItem("ww_user", JSON.stringify(user));
    localStorage.setItem(`ww_cards_${userId}`, JSON.stringify(cards));
  }, { userId: USER_ID, user: MOCK_USER, cards: MOCK_CARDS });
}

// Fixture that provides an authenticated page with mocked API
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await setupApiMocks(page);
    await seedAuth(page);
    await page.goto("/");
    await page.waitForTimeout(1500);
    await use(page);
  },
});

export { expect } from "@playwright/test";
