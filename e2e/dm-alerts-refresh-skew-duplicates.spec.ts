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
    quiet_start: "09:00",
    quiet_end: "10:00",
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
          thread_id: "thread-refresh-skew",
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

// Device wall clock is +60 minutes ahead of the real reference.
const CLOCK_SKEW_MINUTES = 60;
const skew = (realIso: string) =>
  new Date(new Date(realIso).getTime() + CLOCK_SKEW_MINUTES * 60_000);

test.describe("Duplicate prefs updates under clock skew → refresh → latest quiet_end still governs", () => {
  test("burst duplicates, persist latest v3 server-side, reload page, verify boundary on skewed device clock", async ({
    page,
  }) => {
    // Real 09:00 UTC → device 10:00 UTC. Baseline quiet 09:00–10:00 (device).
    // At device 10:00 baseline ends, but quickly bumped past via prefs updates.
    await page.clock.install({ time: skew("2025-05-01T08:30:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    // Real 08:30 (device 09:30) — inside baseline → suppress.
    await injectDm(page, "real 08:30 (device 09:30) — baseline suppress");
    await page.waitForTimeout(400);
    await expect(
      page.getByText("real 08:30 (device 09:30) — baseline suppress"),
    ).toHaveCount(0);

    // Three monotonically-newer versions; v3 is the latest.
    const v1: PrefsRow = {
      ...state.row,
      quiet_end: "10:30",
      updated_at: "2025-05-01T08:31:00Z",
    };
    const v2: PrefsRow = {
      ...state.row,
      quiet_end: "11:30",
      updated_at: "2025-05-01T08:32:00Z",
    };
    const v3: PrefsRow = {
      ...state.row,
      quiet_end: "13:00",
      updated_at: "2025-05-01T08:33:00Z",
    };

    // Burst of duplicates in jumbled order — final dispatch is v3.
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v3);
    await page.waitForTimeout(50);

    // Sanity: under the in-memory latest (v3, ends 13:00 device), real 09:30 (device 10:30) is inside.
    await page.clock.setFixedTime(skew("2025-05-01T09:30:00Z"));
    await injectDm(page, "real 09:30 (device 10:30) — pre-reload v3 suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("real 09:30 (device 10:30) — pre-reload v3 suppress"),
    ).toHaveCount(0);

    // Persist the latest v3 server-side so that after refresh, the
    // initial GET returns the same latest version that the burst settled on.
    state.row = { ...state.row, ...v3 };

    // ── Refresh the app. New page load triggers a fresh prefs GET.
    await page.reload();
    await waitForPrefsGet(page);

    // Real 10:30 (device 11:30) — outside v1 and v2 ends, inside v3 → suppress.
    await page.clock.setFixedTime(skew("2025-05-01T10:30:00Z"));
    await injectDm(page, "real 10:30 (device 11:30) — post-reload v3 suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("real 10:30 (device 11:30) — post-reload v3 suppress"),
    ).toHaveCount(0);

    // Real 11:59:59 (device 12:59:59) — still inside v3 → suppress.
    await page.clock.setFixedTime(skew("2025-05-01T11:59:59Z"));
    await injectDm(page, "real 11:59:59 (device 12:59:59) — v3 suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("real 11:59:59 (device 12:59:59) — v3 suppress"),
    ).toHaveCount(0);

    // Real 12:00:00 (device 13:00:00) — exact v3 end on skewed device → toast.
    await page.clock.setFixedTime(skew("2025-05-01T12:00:00Z"));
    await injectDm(page, "real 12:00 (device 13:00) — v3 end transition toast");
    await expect(
      page.getByText("real 12:00 (device 13:00) — v3 end transition toast"),
    ).toBeVisible({ timeout: 5_000 });

    // Just past the boundary — still toasts.
    await page.clock.setFixedTime(skew("2025-05-01T12:00:01Z"));
    await injectDm(page, "real 12:00:01 (device 13:00:01) — past v3 toast");
    await expect(
      page.getByText("real 12:00:01 (device 13:00:01) — past v3 toast"),
    ).toBeVisible({ timeout: 5_000 });
  });
});
