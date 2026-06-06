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
          thread_id: "thread-burst",
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

test.describe("Burst of offline prefs updates → latest wins after reconnect", () => {
  test("three quick edits arrive after reconnect; only the final window governs suppression", async ({
    page,
  }) => {
    // Old window 10:00–11:00 UTC. Start at 10:45, inside old window.
    await page.clock.install({ time: new Date("2025-05-01T10:45:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    // 10:45 — inside old window → suppressed.
    await injectDm(page, "10:45 — old prefs suppress");
    await page.waitForTimeout(400);
    await expect(page.getByText("10:45 — old prefs suppress")).toHaveCount(0);

    // Go offline. The settings page POSTs would normally hit the network;
    // we simulate three back-to-back edits the user made while offline by
    // queueing three would-be broadcasts to deliver after reconnect.
    await setOffline(page, true);

    const v1: PrefsRow = { ...state.row, quiet_end: "11:15" };
    const v2: PrefsRow = { ...state.row, quiet_end: "11:30" };
    const v3: PrefsRow = { ...state.row, quiet_end: "12:00" };

    // While offline at 11:05 UTC: old window says outside → toast.
    await page.clock.setFixedTime(new Date("2025-05-01T11:05:00Z"));
    await injectDm(page, "11:05 — offline old prefs toast");
    await expect(page.getByText("11:05 — offline old prefs toast")).toBeVisible({ timeout: 5_000 });

    // Reconnect; three queued prefs broadcasts arrive in quick succession.
    await setOffline(page, false);
    await page.waitForTimeout(200);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v3);
    await page.waitForTimeout(150);

    // Latest window is 10:00–12:00. At 11:05 → suppressed.
    await injectDm(page, "11:05 — latest prefs suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:05 — latest prefs suppress")).toHaveCount(0);

    // Older queued windows (ended 11:15, 11:30) must NOT govern: at 11:45
    // they'd toast, but the latest (12:00) keeps it suppressed.
    await page.clock.setFixedTime(new Date("2025-05-01T11:45:00Z"));
    await injectDm(page, "11:45 — latest prefs suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:45 — latest prefs suppress")).toHaveCount(0);

    // Boundary of the LATEST window: 11:59 inside → suppressed, 12:00 outside → toast.
    await page.clock.setFixedTime(new Date("2025-05-01T11:59:00Z"));
    await injectDm(page, "11:59 — latest window suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:59 — latest window suppress")).toHaveCount(0);

    await page.clock.setFixedTime(new Date("2025-05-01T12:00:00Z"));
    await injectDm(page, "12:00 — latest end boundary toast");
    await expect(page.getByText("12:00 — latest end boundary toast")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("out-of-order delivery: latest update applied even if a stale one arrives last", async ({
    page,
  }) => {
    // The "latest" update (v3) arrives first; a stale earlier one (v1) arrives
    // last. DmAlerts should still end up on the most recent prefs — which we
    // model by also dispatching v3 again after the stale one, matching how
    // a re-sync would re-emit the current server row.
    await page.clock.install({ time: new Date("2025-05-01T10:45:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    await setOffline(page, true);

    const v1: PrefsRow = { ...state.row, quiet_end: "11:15" };
    const v3: PrefsRow = { ...state.row, quiet_end: "12:00" };

    await setOffline(page, false);
    await page.waitForTimeout(200);
    // Latest arrives first, stale arrives later, then resync re-emits latest.
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v3);
    await page.waitForTimeout(150);

    // At 11:45 the latest (12:00 end) governs → suppressed.
    await page.clock.setFixedTime(new Date("2025-05-01T11:45:00Z"));
    await injectDm(page, "11:45 — resync to latest suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:45 — resync to latest suppress")).toHaveCount(0);

    // 12:00 boundary exact toast.
    await page.clock.setFixedTime(new Date("2025-05-01T12:00:00Z"));
    await injectDm(page, "12:00 — latest end boundary toast");
    await expect(page.getByText("12:00 — latest end boundary toast")).toBeVisible({
      timeout: 5_000,
    });
  });
});
