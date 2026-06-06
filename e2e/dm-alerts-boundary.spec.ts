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

function row(overrides: Partial<PrefsRow> = {}): PrefsRow {
  return {
    user_id: VERIFIED.id,
    dm_push_enabled: true,
    dm_inapp_enabled: true,
    quiet_hours_enabled: true,
    quiet_start: "10:00",
    quiet_end: "11:00",
    timezone: "UTC",
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
          thread_id: "thread-boundary",
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

test.describe("DmAlerts switches suppression exactly at quiet-hour boundaries (no refresh)", () => {
  test("toggles suppression ON at quiet_start and OFF at quiet_end", async ({ page }) => {
    // Quiet window 10:00–11:00 UTC (does not cross midnight).
    await page.clock.install({ time: new Date("2025-01-15T09:59:00Z") });

    await mockAuth(page, VERIFIED);
    await mockApis(page, row());

    await page.goto("/");
    await waitForPrefsGet(page);

    // 09:59 UTC → outside quiet window → toast should appear.
    await injectDm(page, "09:59 — should toast");
    await expect(page.getByText("09:59 — should toast")).toBeVisible({
      timeout: 5_000,
    });

    // Advance to exactly 10:00 UTC (boundary, inside window).
    await page.clock.setFixedTime(new Date("2025-01-15T10:00:00Z"));
    await injectDm(page, "10:00 — suppressed");
    await page.waitForTimeout(500);
    await expect(page.getByText("10:00 — suppressed")).toHaveCount(0);

    // 10:30 UTC → still inside window.
    await page.clock.setFixedTime(new Date("2025-01-15T10:30:00Z"));
    await injectDm(page, "10:30 — suppressed");
    await page.waitForTimeout(500);
    await expect(page.getByText("10:30 — suppressed")).toHaveCount(0);

    // Advance to exactly 11:00 UTC (boundary, outside window).
    await page.clock.setFixedTime(new Date("2025-01-15T11:00:00Z"));
    await injectDm(page, "11:00 — should toast");
    await expect(page.getByText("11:00 — should toast")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("cross-midnight window toggles suppression ON at start and OFF at end", async ({ page }) => {
    // Quiet window 22:00–07:00 UTC (crosses midnight).
    // We start at 21:59, cross to 22:00 (ON), then 06:59 (still ON),
    // then 07:00 (OFF).
    await page.clock.install({ time: new Date("2025-01-15T21:59:00Z") });

    await mockAuth(page, VERIFIED);
    await mockApis(page, row({ quiet_start: "22:00", quiet_end: "07:00" }));

    await page.goto("/");
    await waitForPrefsGet(page);

    // 21:59 UTC → outside cross-midnight window → toast.
    await injectDm(page, "21:59 — should toast");
    await expect(page.getByText("21:59 — should toast")).toBeVisible({
      timeout: 5_000,
    });

    // 22:00 UTC → exactly at start of cross-midnight window → suppressed.
    await page.clock.setFixedTime(new Date("2025-01-15T22:00:00Z"));
    await injectDm(page, "22:00 — suppressed");
    await page.waitForTimeout(500);
    await expect(page.getByText("22:00 — suppressed")).toHaveCount(0);

    // 06:59 UTC next day → still inside cross-midnight window → suppressed.
    await page.clock.setFixedTime(new Date("2025-01-16T06:59:00Z"));
    await injectDm(page, "06:59 — suppressed");
    await page.waitForTimeout(500);
    await expect(page.getByText("06:59 — suppressed")).toHaveCount(0);

    // 07:00 UTC → exactly at end of cross-midnight window → toast.
    await page.clock.setFixedTime(new Date("2025-01-16T07:00:00Z"));
    await injectDm(page, "07:00 — should toast");
    await expect(page.getByText("07:00 — should toast")).toBeVisible({
      timeout: 5_000,
    });
  });
});
