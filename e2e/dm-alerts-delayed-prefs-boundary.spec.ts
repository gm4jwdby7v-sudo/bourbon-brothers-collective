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

interface PrefsState {
  row: PrefsRow;
  lastWrite?: PrefsRow;
}

function defaultRow(overrides: Partial<PrefsRow> = {}): PrefsRow {
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

async function mockApis(page: Page, state: PrefsState) {
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
    if (req.method() === "GET") return json(route, 200, [state.row]);
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() ?? "{}");
      const incoming = Array.isArray(body) ? body[0] : body;
      const merged = { ...state.row, ...incoming } as PrefsRow;
      state.row = merged;
      state.lastWrite = merged;
      return json(route, 201, [merged]);
    }
    return route.continue();
  });

  await page.route(`**/rest/v1/profiles*`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    return json(route, 200, [
      { display_name: "Alex Carter", username: "alex" },
    ]);
  });
}

async function injectDm(page: Page, body: string) {
  await page.evaluate((body) => {
    window.dispatchEvent(
      new CustomEvent("dm-alerts:test-inject", {
        detail: {
          id: `msg-${Date.now()}-${Math.random()}`,
          thread_id: "thread-delayed",
          sender_id: "u-other",
          body,
          created_at: new Date().toISOString(),
        },
      }),
    );
  }, body);
}

async function broadcastPrefsUpdate(page: Page, row: PrefsRow) {
  await page.evaluate((row) => {
    window.dispatchEvent(
      new CustomEvent("dm-alerts:test-update-prefs", { detail: row }),
    );
  }, row);
}

async function waitForPrefsGet(page: Page) {
  await page.waitForResponse(
    (r) =>
      r.url().includes("/rest/v1/notification_preferences") &&
      r.request().method() === "GET",
    { timeout: 10_000 },
  );
  await page.waitForTimeout(150);
}

test.describe("Delayed prefs broadcast still honors exact quiet-hour boundaries", () => {
  test("shortened quiet window only takes effect after delayed broadcast, then boundary is exact", async ({
    page,
  }) => {
    // Start inside the original quiet window 10:00–11:00 UTC.
    await page.clock.install({ time: new Date("2025-02-10T10:15:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    // 10:15 — inside original window → suppressed.
    await injectDm(page, "10:15 — old prefs suppress");
    await page.waitForTimeout(400);
    await expect(page.getByText("10:15 — old prefs suppress")).toHaveCount(0);

    // User saves a shortened quiet window 10:00–10:30 on settings page.
    await page.goto("/settings/notifications");
    await expect(page.getByTestId("notif-settings-root")).toBeVisible();
    await page.getByTestId("quiet-end").fill("10:30");
    await page.getByTestId("save-settings").click();
    await expect.poll(() => state.lastWrite?.quiet_end).toBe("10:30");

    // The realtime broadcast is delayed — DmAlerts still holds the old window.
    // Advance to 10:45 UTC: with OLD prefs (10:00–11:00) we'd suppress,
    // with NEW prefs (10:00–10:30) we'd toast. The broadcast has not arrived,
    // so the old window must still apply.
    await page.clock.setFixedTime(new Date("2025-02-10T10:45:00Z"));
    await injectDm(page, "10:45 — pre-broadcast still suppressed");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("10:45 — pre-broadcast still suppressed"),
    ).toHaveCount(0);

    // Delayed broadcast finally arrives with the new window.
    await page.waitForTimeout(800);
    await broadcastPrefsUpdate(page, state.lastWrite!);

    // Still 10:45 UTC, now under NEW prefs (window ended at 10:30) → toast.
    await injectDm(page, "10:45 — post-broadcast toast");
    await expect(page.getByText("10:45 — post-broadcast toast")).toBeVisible({
      timeout: 5_000,
    });

    // Boundary check on the NEW window: exactly 10:30 must already be outside.
    await page.clock.setFixedTime(new Date("2025-02-10T10:30:00Z"));
    await injectDm(page, "10:30 — new end boundary toast");
    await expect(
      page.getByText("10:30 — new end boundary toast"),
    ).toBeVisible({ timeout: 5_000 });

    // And 10:29 must still be inside the new window → suppressed.
    await page.clock.setFixedTime(new Date("2025-02-10T10:29:00Z"));
    await injectDm(page, "10:29 — new window suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("10:29 — new window suppress")).toHaveCount(0);
  });

  test("extended quiet window only suppresses after delayed broadcast, then boundary is exact", async ({
    page,
  }) => {
    // Start just past the original end (11:00). Original window 10:00–11:00 UTC.
    await page.clock.install({ time: new Date("2025-02-10T11:05:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    // 11:05 — outside original window → toast.
    await injectDm(page, "11:05 — old prefs toast");
    await expect(page.getByText("11:05 — old prefs toast")).toBeVisible({
      timeout: 5_000,
    });

    // Extend quiet end to 11:30 via settings.
    await page.goto("/settings/notifications");
    await expect(page.getByTestId("notif-settings-root")).toBeVisible();
    await page.getByTestId("quiet-end").fill("11:30");
    await page.getByTestId("save-settings").click();
    await expect.poll(() => state.lastWrite?.quiet_end).toBe("11:30");

    // Broadcast is delayed: at 11:15, old prefs say "outside" → still toast.
    await page.clock.setFixedTime(new Date("2025-02-10T11:15:00Z"));
    await injectDm(page, "11:15 — pre-broadcast toast");
    await expect(page.getByText("11:15 — pre-broadcast toast")).toBeVisible({
      timeout: 5_000,
    });

    // Delayed broadcast arrives.
    await page.waitForTimeout(800);
    await broadcastPrefsUpdate(page, state.lastWrite!);

    // Same 11:15 UTC, now under NEW window (10:00–11:30) → suppressed.
    await injectDm(page, "11:15 — post-broadcast suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("11:15 — post-broadcast suppress"),
    ).toHaveCount(0);

    // Boundary check on the NEW window: exactly 11:30 is outside → toast.
    await page.clock.setFixedTime(new Date("2025-02-10T11:30:00Z"));
    await injectDm(page, "11:30 — new end boundary toast");
    await expect(
      page.getByText("11:30 — new end boundary toast"),
    ).toBeVisible({ timeout: 5_000 });

    // 11:29 still inside the new window → suppressed.
    await page.clock.setFixedTime(new Date("2025-02-10T11:29:00Z"));
    await injectDm(page, "11:29 — new window suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:29 — new window suppress")).toHaveCount(0);
  });
});
