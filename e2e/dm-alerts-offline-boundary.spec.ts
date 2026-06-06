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
    return json(route, 200, [{ display_name: "Alex Carter", username: "alex" }]);
  });
}

async function injectDm(page: Page, body: string) {
  await page.evaluate((body) => {
    window.dispatchEvent(
      new CustomEvent("dm-alerts:test-inject", {
        detail: {
          id: `msg-${Date.now()}-${Math.random()}`,
          thread_id: "thread-offline",
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
    window.dispatchEvent(new CustomEvent("dm-alerts:test-update-prefs", { detail: row }));
  }, row);
}

async function waitForPrefsGet(page: Page) {
  await page.waitForResponse(
    (r) => r.url().includes("/rest/v1/notification_preferences") && r.request().method() === "GET",
    { timeout: 10_000 },
  );
  await page.waitForTimeout(150);
}

async function setOffline(page: Page, offline: boolean) {
  await page.context().setOffline(offline);
  await page.evaluate((isOffline) => {
    window.dispatchEvent(new Event(isOffline ? "offline" : "online"));
  }, offline);
}

test.describe("Offline during quiet-hours boundary with delayed prefs update", () => {
  test("client stays on old prefs while offline across the boundary, then reconnect delivers new prefs", async ({
    page,
  }) => {
    // Old window: 10:00–11:00 UTC. Start just before the end boundary.
    await page.clock.install({ time: new Date("2025-04-01T10:55:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    // 10:55 — inside old window → suppressed.
    await injectDm(page, "10:55 — old prefs suppress");
    await page.waitForTimeout(400);
    await expect(page.getByText("10:55 — old prefs suppress")).toHaveCount(0);

    // User extends quiet end to 11:30 on settings page (server commits).
    await page.goto("/settings/notifications");
    await expect(page.getByTestId("notif-settings-root")).toBeVisible();
    await page.getByTestId("quiet-end").fill("11:30");
    await page.getByTestId("save-settings").click();
    await expect.poll(() => state.lastWrite?.quiet_end).toBe("11:30");

    // Go offline before the boundary. Realtime broadcast cannot reach client.
    await setOffline(page, true);

    // Cross the old boundary while offline.
    // 11:00 UTC — old window says "outside" → would toast under old prefs;
    // new prefs (10:00–11:30) would suppress, but we haven't received them.
    await page.clock.setFixedTime(new Date("2025-04-01T11:00:00Z"));
    await injectDm(page, "11:00 — offline, old end boundary toasts");
    await expect(page.getByText("11:00 — offline, old end boundary toasts")).toBeVisible({
      timeout: 5_000,
    });

    // 11:15 UTC still offline — old prefs say outside → toast.
    await page.clock.setFixedTime(new Date("2025-04-01T11:15:00Z"));
    await injectDm(page, "11:15 — offline still toasts");
    await expect(page.getByText("11:15 — offline still toasts")).toBeVisible({
      timeout: 5_000,
    });

    // Reconnect; realtime channel re-delivers the missed prefs update.
    await setOffline(page, false);
    await page.waitForTimeout(300);
    await broadcastPrefsUpdate(page, state.lastWrite!);

    // Same 11:15 UTC, now under NEW prefs (10:00–11:30) → suppressed.
    await injectDm(page, "11:15 — post-reconnect suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:15 — post-reconnect suppress")).toHaveCount(0);

    // New end boundary is exact: 11:29 suppressed, 11:30 toasts.
    await page.clock.setFixedTime(new Date("2025-04-01T11:29:00Z"));
    await injectDm(page, "11:29 — new window suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:29 — new window suppress")).toHaveCount(0);

    await page.clock.setFixedTime(new Date("2025-04-01T11:30:00Z"));
    await injectDm(page, "11:30 — new end boundary toast");
    await expect(page.getByText("11:30 — new end boundary toast")).toBeVisible({ timeout: 5_000 });
  });
});
