import { test, expect, type Page, type Route } from "@playwright/test";
import { mockAuth, VERIFIED } from "./dm-helpers";

interface PrefsRow {
  user_id: string;
  dm_push_enabled: boolean;
  dm_inapp_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  timezone: string;
}

function prefs(overrides: Partial<PrefsRow> = {}): PrefsRow {
  return {
    user_id: VERIFIED.id,
    dm_push_enabled: true,
    dm_inapp_enabled: true,
    quiet_hours_enabled: false,
    quiet_start: "22:00",
    quiet_end: "07:00",
    timezone: "UTC",
    ...overrides,
  };
}

/** Mock notification_preferences + profiles GETs used by DmAlerts. */
async function mockAlertsApi(page: Page, row: PrefsRow | null) {
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(body),
    });

  await page.route(`**/rest/v1/notification_preferences*`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }
    if (route.request().method() === "GET") {
      return json(route, 200, row ? [row] : []);
    }
    return route.continue();
  });

  await page.route(`**/rest/v1/profiles*`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }
    return json(route, 200, [{ display_name: "Alex Carter", username: "alex" }]);
  });
}

/** Dispatch the test bridge event to simulate a realtime DM insert. */
async function injectIncomingDm(page: Page, body: string, threadId = "thread-abc") {
  await page.evaluate(
    ({ body, threadId }) => {
      window.dispatchEvent(
        new CustomEvent("dm-alerts:test-inject", {
          detail: {
            id: `msg-${Date.now()}`,
            thread_id: threadId,
            sender_id: "u-other",
            body,
            created_at: new Date().toISOString(),
          },
        }),
      );
    },
    { body, threadId },
  );
}

/** Wait until DmAlerts has loaded prefs so prefsRef no longer holds defaults. */
async function waitForPrefsLoaded(page: Page) {
  await page.waitForResponse(
    (r) => r.url().includes("/rest/v1/notification_preferences") && r.request().method() === "GET",
    { timeout: 10_000 },
  );
  // Allow React to commit the ref update.
  await page.waitForTimeout(150);
}

function pad(n: number) {
  return String((n + 24) % 24).padStart(2, "0") + ":00";
}

test.describe("DM in-app alert toasts", () => {
  test.describe.configure({ mode: "serial" });

  test("shows a toast with sender + preview when in-app alerts are enabled", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await mockAlertsApi(page, prefs({ dm_inapp_enabled: true }));
    await page.goto("/");
    await waitForPrefsLoaded(page);

    await injectIncomingDm(page, "Hey, are you joining the tasting tonight?");

    await expect(page.getByText("Alex Carter")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Hey, are you joining the tasting tonight?")).toBeVisible();
  });

  test("suppresses the toast when in-app alerts are disabled", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await mockAlertsApi(page, prefs({ dm_inapp_enabled: false }));
    await page.goto("/");
    await waitForPrefsLoaded(page);

    await injectIncomingDm(page, "This should not appear as a toast");

    // Give the UI a chance to render any toast, then assert none did.
    await page.waitForTimeout(500);
    await expect(page.getByText("This should not appear as a toast")).toHaveCount(0);
    await expect(page.getByText("Alex Carter")).toHaveCount(0);
  });

  test("suppresses the toast during quiet hours even if in-app alerts are on", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    const h = new Date().getUTCHours();
    // Cross-midnight window that always covers "now" in UTC.
    await mockAlertsApi(
      page,
      prefs({
        dm_inapp_enabled: true,
        quiet_hours_enabled: true,
        quiet_start: pad(h - 1),
        quiet_end: pad(h - 2),
        timezone: "UTC",
      }),
    );
    await page.goto("/");
    await waitForPrefsLoaded(page);

    await injectIncomingDm(page, "Silenced by quiet hours");

    await page.waitForTimeout(500);
    await expect(page.getByText("Silenced by quiet hours")).toHaveCount(0);
  });

  test("shows the toast when quiet hours are enabled but 'now' is outside the window", async ({
    page,
  }) => {
    await mockAuth(page, VERIFIED);
    const h = new Date().getUTCHours();
    // Same-day window that does NOT cover "now".
    await mockAlertsApi(
      page,
      prefs({
        dm_inapp_enabled: true,
        quiet_hours_enabled: true,
        quiet_start: pad(h + 2),
        quiet_end: pad(h + 4),
        timezone: "UTC",
      }),
    );
    await page.goto("/");
    await waitForPrefsLoaded(page);

    await injectIncomingDm(page, "Delivered outside quiet hours");

    await expect(page.getByText("Delivered outside quiet hours")).toBeVisible({
      timeout: 5_000,
    });
  });
});
