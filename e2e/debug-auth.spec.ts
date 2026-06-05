import { test, expect } from "@playwright/test";

const STORAGE_KEY = "sb-rjwbskhokscwmnndpoec-auth-token";

test("debug auth mock", async ({ page }) => {
  const fakeSession = {
    access_token: "fake-access-token",
    refresh_token: "fake-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: "u1",
      email: "test@example.com",
      email_confirmed_at: null,
      confirmed_at: null,
    },
  };

  await page.addInitScript((session, key) => {
    localStorage.setItem(key, JSON.stringify(session));
  }, fakeSession, STORAGE_KEY);

  await page.route(`*/**/auth/v1/user`, async (route) => {
    console.log("Intercepted auth/v1/user");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "u1",
        email: "test@example.com",
        email_confirmed_at: null,
        confirmed_at: null,
      }),
    });
  });

  page.on("request", (req) => {
    console.log("Request:", req.url());
  });

  await page.goto("/messages");
  await page.waitForTimeout(1000);

  const localStorageData = await page.evaluate((key) => {
    const keys = Object.keys(localStorage);
    const values: Record<string, string | null> = {};
    for (const k of keys) {
      values[k] = localStorage.getItem(k);
    }
    return { keys, values, ourKey: localStorage.getItem(key) };
  }, STORAGE_KEY);

  console.log("localStorage keys:", localStorageData.keys);
  console.log("localStorage ourKey:", localStorageData.ourKey);
  console.log("localStorage all:", JSON.stringify(localStorageData.values, null, 2));

  const url = page.url();
  console.log("Current URL:", url);

  const body = await page.content();
  console.log("Page title:", await page.title());
});
