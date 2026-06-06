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
  updated_at?: string;
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
          thread_id: "thread-flapping",
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

test.describe("Flapping connection with out-of-order duplicate prefs updates → newest window wins", () => {
  test("repeated offline/online cycles with jumbled duplicate broadcasts; latest v4 governs at end", async ({
    page,
  }) => {
    // Baseline 10:00–11:00 UTC. Start inside the old window.
    await page.clock.install({ time: new Date("2025-05-01T10:30:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    await injectDm(page, "10:30 — baseline suppress");
    await page.waitForTimeout(400);
    await expect(page.getByText("10:30 — baseline suppress")).toHaveCount(0);

    // Four monotonically-newer versions, but they will be delivered jumbled
    // and duplicated across several offline/online cycles.
    const v1: PrefsRow = {
      ...state.row,
      quiet_end: "11:15",
      updated_at: "2025-05-01T10:31:00Z",
    };
    const v2: PrefsRow = {
      ...state.row,
      quiet_end: "11:30",
      updated_at: "2025-05-01T10:32:00Z",
    };
    const v3: PrefsRow = {
      ...state.row,
      quiet_end: "11:45",
      updated_at: "2025-05-01T10:33:00Z",
    };
    const v4: PrefsRow = {
      ...state.row,
      quiet_end: "12:30",
      updated_at: "2025-05-01T10:34:00Z",
    };

    // ── Cycle 1: go offline, cross old boundary under OLD prefs → toast.
    await setOffline(page, true);

    await page.clock.setFixedTime(new Date("2025-05-01T11:05:00Z"));
    await injectDm(page, "11:05 — cycle1 offline old prefs toast");
    await expect(page.getByText("11:05 — cycle1 offline old prefs toast")).toBeVisible({
      timeout: 5_000,
    });

    // Now deliver jumbled duplicates while still offline: v2, v1 (stale), v2 dup.
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v2);
    await page.waitForTimeout(50);

    // ── Reconnect briefly.
    await setOffline(page, false);
    await page.waitForTimeout(150);

    // After reconnect, replay duplicate stale v1.
    await broadcastPrefsUpdate(page, v1);
    await page.waitForTimeout(50);

    // ── Cycle 2: offline again, push v3 then duplicate v2 (stale) then v3 dup.
    await setOffline(page, true);
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v3);
    await page.waitForTimeout(50);

    // At 11:20 still offline. Under stale v1 (11:15) we'd toast; under v3 (11:45)
    // we suppress. v3 is the newest seen so far → must suppress.
    await page.clock.setFixedTime(new Date("2025-05-01T11:20:00Z"));
    await injectDm(page, "11:20 — cycle2 newest v3 suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:20 — cycle2 newest v3 suppress")).toHaveCount(0);

    // ── Reconnect.
    await setOffline(page, false);
    await page.waitForTimeout(150);

    // Out-of-order duplicates after reconnect: v1 (stale), v3 (dup newest so far).
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v3);
    await page.waitForTimeout(50);

    // ── Cycle 3: offline, deliver v4 (newest) then a flurry of stale duplicates.
    await setOffline(page, true);
    await broadcastPrefsUpdate(page, v4);
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v4); // duplicate newest
    await broadcastPrefsUpdate(page, v2); // stale dup
    await page.waitForTimeout(50);

    // ── Final reconnect.
    await setOffline(page, false);
    await page.waitForTimeout(150);

    // One more jumbled flurry after reconnect for good measure.
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v4);
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v4);
    await page.waitForTimeout(150);

    // From here on, v4 (10:00–12:30) MUST govern.

    // 11:50 outside v1/v2/v3, inside v4 → suppress.
    await page.clock.setFixedTime(new Date("2025-05-01T11:50:00Z"));
    await injectDm(page, "11:50 — final v4 suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:50 — final v4 suppress")).toHaveCount(0);

    // 12:29 inside v4 → suppress.
    await page.clock.setFixedTime(new Date("2025-05-01T12:29:00Z"));
    await injectDm(page, "12:29 — final v4 suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("12:29 — final v4 suppress")).toHaveCount(0);

    // 12:30 — v4 end boundary exact → toast.
    await page.clock.setFixedTime(new Date("2025-05-01T12:30:00Z"));
    await injectDm(page, "12:30 — v4 end boundary toast");
    await expect(page.getByText("12:30 — v4 end boundary toast")).toBeVisible({ timeout: 5_000 });
  });
});
