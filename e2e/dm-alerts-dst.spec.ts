import { test, expect, type Page, type Route } from "@playwright/test";
import { mockAuth, VERIFIED } from "./dm-helpers";

/**
 * Verifies that DmAlerts quiet-hours suppression correctly tracks a
 * daylight-saving-time transition while the page is still mounted — no
 * refresh, no re-mount. We pin the browser clock with `page.clock`, then
 * advance it across the US spring-forward boundary (America/New_York,
 * 2025-03-09 02:00 EST → 03:00 EDT) and check toast behavior on either side.
 */

interface PrefsRow {
  user_id: string;
  dm_push_enabled: boolean;
  dm_inapp_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  timezone: string;
}

function row(overrides: Partial<PrefsRow> = {}): PrefsRow {
  return {
    user_id: VERIFIED.id,
    dm_push_enabled: true,
    dm_inapp_enabled: true,
    quiet_hours_enabled: true,
    quiet_start: "03:00",
    quiet_end: "04:00",
    timezone: "America/New_York",
    ...overrides,
  };
}

async function mockApis(page: Page, prefs: PrefsRow) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(body),
    });

  await page.route(`**/rest/v1/notification_preferences*`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    if (req.method() === "GET") return json(route, 200, [prefs]);
    return route.continue();
  });

  await page.route(`**/rest/v1/profiles*`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    return json(route, 200, [{ display_name: "Alex Carter", username: "alex" }]);
  });
}

async function injectDm(page: Page, body: string) {
  await page.evaluate((body) => {
    window.dispatchEvent(
      new CustomEvent("dm-alerts:test-inject", {
        detail: {
          id: `msg-${Date.now()}-${Math.random()}`,
          thread_id: "thread-dst",
          sender_id: "u-other",
          body,
          created_at: new Date().toISOString(),
        },
      }),
    );
  }, body);
}

async function waitForPrefsGet(page: Page) {
  await page.waitForResponse(
    (r) => r.url().includes("/rest/v1/notification_preferences") && r.request().method() === "GET",
    { timeout: 10_000 },
  );
  await page.waitForTimeout(150);
}

test.describe("DmAlerts quiet hours across a DST transition (no refresh)", () => {
  test("spring-forward correctly re-evaluates quiet window for the same mount", async ({
    page,
  }) => {
    // Pin the clock to 2025-03-09 06:30 UTC = 01:30 EST (before US DST jump).
    // Quiet window is 03:00–04:00 America/New_York, so this is OUTSIDE quiet.
    await page.clock.install({ time: new Date("2025-03-09T06:30:00Z") });

    await mockAuth(page, VERIFIED);
    await mockApis(page, row());

    await page.goto("/");
    await waitForPrefsGet(page);

    // 01:30 EST → outside quiet → toast should appear.
    await injectDm(page, "Before DST — should toast");
    await expect(page.getByText("Before DST — should toast")).toBeVisible({
      timeout: 5_000,
    });

    // Advance the clock past the DST boundary without unmounting:
    // 2025-03-09 07:30 UTC = 03:30 EDT (after spring-forward), which now sits
    // INSIDE the 03:00–04:00 local quiet window.
    await page.clock.setFixedTime(new Date("2025-03-09T07:30:00Z"));

    await injectDm(page, "After DST — suppressed");
    await page.waitForTimeout(500);
    await expect(page.getByText("After DST — suppressed")).toHaveCount(0);
  });

  test("fall-back correctly re-evaluates quiet window for the same mount", async ({ page }) => {
    // US fall-back: 2025-11-02, 02:00 EDT → 01:00 EST.
    // Quiet window 01:30–02:30 America/New_York.
    //
    // 2025-11-02 05:45 UTC → 01:45 EDT (UTC-4) → INSIDE quiet → suppressed.
    await page.clock.install({ time: new Date("2025-11-02T05:45:00Z") });

    await mockAuth(page, VERIFIED);
    await mockApis(page, row({ quiet_start: "01:30", quiet_end: "02:30" }));

    await page.goto("/");
    await waitForPrefsGet(page);

    await injectDm(page, "Before fall-back — suppressed");
    await page.waitForTimeout(500);
    await expect(page.getByText("Before fall-back — suppressed")).toHaveCount(0);

    // 2025-11-02 06:45 UTC → 01:45 EST (UTC-5) after fall-back. The wall
    // clock has actually moved BACK, but the window still covers 01:45 local,
    // so suppression must remain — unless we shift further:
    // 2025-11-02 07:45 UTC → 02:45 EST → OUTSIDE quiet → toast appears.
    await page.clock.setFixedTime(new Date("2025-11-02T07:45:00Z"));

    await injectDm(page, "After fall-back — should toast");
    await expect(page.getByText("After fall-back — should toast")).toBeVisible({ timeout: 5_000 });
  });
});
