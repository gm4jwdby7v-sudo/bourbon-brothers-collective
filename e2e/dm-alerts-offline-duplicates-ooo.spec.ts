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
          thread_id: "thread-ooo-duplicates",
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

test.describe("Out-of-order duplicate prefs updates while offline → newest version after reconnect", () => {
  test("v2, v1, v3, v2, v1, v3 delivered out-of-order with duplicates; newest (v3) governs after reconnect", async ({
    page,
  }) => {
    // Baseline: 10:00–11:00 UTC. Start inside old window.
    await page.clock.install({ time: new Date("2025-05-01T10:30:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    // 10:30 — inside old window → suppressed.
    await injectDm(page, "10:30 — baseline suppress");
    await page.waitForTimeout(400);
    await expect(page.getByText("10:30 — baseline suppress")).toHaveCount(0);

    // Go offline before any updates.
    await setOffline(page, true);

    // Three versions, each with an updated_at timestamp so the client can
    // reason about ordering even when delivery is jumbled.
    const v1: PrefsRow = {
      ...state.row,
      quiet_end: "11:15",
      updated_at: "2025-05-01T10:31:00Z",
    };
    const v2: PrefsRow = {
      ...state.row,
      quiet_end: "11:45",
      updated_at: "2025-05-01T10:32:00Z",
    };
    const v3: PrefsRow = {
      ...state.row,
      quiet_end: "12:00",
      updated_at: "2025-05-01T10:33:00Z",
    };

    // Before reconnect, at 11:05 → old prefs outside → toast.
    await page.clock.setFixedTime(new Date("2025-05-01T11:05:00Z"));
    await injectDm(page, "11:05 — offline old prefs toast");
    await expect(page.getByText("11:05 — offline old prefs toast")).toBeVisible({ timeout: 5_000 });

    // While still offline, broadcast updates in a jumbled, duplicated order.
    // The realistic case: a buffered transport replays events in a sequence
    // that does NOT respect creation order, and re-sends some of them.
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v1); // stale, after v2
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v2); // duplicate of stale v2
    await broadcastPrefsUpdate(page, v1); // duplicate of oldest v1
    await broadcastPrefsUpdate(page, v3); // duplicate of latest v3
    await page.waitForTimeout(150);

    // Reconnect. After the dust settles, v3 (12:00) must govern.
    await setOffline(page, false);
    await page.waitForTimeout(200);

    // 11:05 under v3 → suppressed.
    await injectDm(page, "11:05 — newest v3 suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:05 — newest v3 suppress")).toHaveCount(0);

    // 11:30 outside v1 (11:15), inside v2 (11:45) and v3 (12:00) → suppressed.
    await page.clock.setFixedTime(new Date("2025-05-01T11:30:00Z"));
    await injectDm(page, "11:30 — newest v3 suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:30 — newest v3 suppress")).toHaveCount(0);

    // 11:46 outside v1 and v2, inside v3 → suppressed (proves v3 wins, not v2).
    await page.clock.setFixedTime(new Date("2025-05-01T11:46:00Z"));
    await injectDm(page, "11:46 — newest v3 suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:46 — newest v3 suppress")).toHaveCount(0);

    // 11:59 inside v3 → suppressed.
    await page.clock.setFixedTime(new Date("2025-05-01T11:59:00Z"));
    await injectDm(page, "11:59 — newest v3 suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:59 — newest v3 suppress")).toHaveCount(0);

    // 12:00 — v3 end boundary exact → toast.
    await page.clock.setFixedTime(new Date("2025-05-01T12:00:00Z"));
    await injectDm(page, "12:00 — v3 end boundary toast");
    await expect(page.getByText("12:00 — v3 end boundary toast")).toBeVisible({ timeout: 5_000 });
  });

  test("out-of-order duplicates continue arriving after reconnect; newest still wins", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2025-05-01T10:30:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    await injectDm(page, "10:30 — baseline suppress");
    await page.waitForTimeout(400);
    await expect(page.getByText("10:30 — baseline suppress")).toHaveCount(0);

    await setOffline(page, true);

    const v1: PrefsRow = {
      ...state.row,
      quiet_end: "11:15",
      updated_at: "2025-05-01T10:31:00Z",
    };
    const v2: PrefsRow = {
      ...state.row,
      quiet_end: "11:45",
      updated_at: "2025-05-01T10:32:00Z",
    };
    const v3: PrefsRow = {
      ...state.row,
      quiet_end: "12:00",
      updated_at: "2025-05-01T10:33:00Z",
    };

    // Pre-reconnect: nothing dispatched yet. Reconnect and then receive
    // duplicates in fully jumbled order, with newest interleaved arbitrarily.
    await setOffline(page, false);
    await page.waitForTimeout(200);

    await broadcastPrefsUpdate(page, v3); // newest first
    await broadcastPrefsUpdate(page, v1); // stale
    await broadcastPrefsUpdate(page, v2); // stale
    await broadcastPrefsUpdate(page, v3); // duplicate newest
    await broadcastPrefsUpdate(page, v1); // duplicate stale
    await broadcastPrefsUpdate(page, v2); // duplicate stale
    await broadcastPrefsUpdate(page, v3); // duplicate newest again
    await page.waitForTimeout(150);

    // 11:30 must be suppressed: outside v1, inside v2/v3. Latest v3 must win.
    await page.clock.setFixedTime(new Date("2025-05-01T11:30:00Z"));
    await injectDm(page, "11:30 — newest still wins");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:30 — newest still wins")).toHaveCount(0);

    // 11:46 outside v1 and v2 → only v3 can suppress.
    await page.clock.setFixedTime(new Date("2025-05-01T11:46:00Z"));
    await injectDm(page, "11:46 — newest still wins");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:46 — newest still wins")).toHaveCount(0);

    // 12:00 — v3 end boundary exact → toast.
    await page.clock.setFixedTime(new Date("2025-05-01T12:00:00Z"));
    await injectDm(page, "12:00 — v3 end boundary toast");
    await expect(page.getByText("12:00 — v3 end boundary toast")).toBeVisible({ timeout: 5_000 });
  });
});
