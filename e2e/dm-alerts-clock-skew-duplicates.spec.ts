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
          thread_id: "thread-clock-skew",
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

/**
 * Real wall-clock time used as the reference. The device clock will be set
 * to (real time + CLOCK_SKEW_MINUTES) to simulate a skewed device clock.
 *
 * Quiet-hours evaluation reads the device clock, so the boundary moment in
 * device-time corresponds to a different real-time instant.
 */
const CLOCK_SKEW_MINUTES = 45;
const skew = (realIso: string) =>
  new Date(new Date(realIso).getTime() + CLOCK_SKEW_MINUTES * 60_000);

test.describe("Device clock skew + duplicate prefs updates → latest quiet_end governs at correct boundary", () => {
  test("device clock +45min ahead of real time; v1/v2/v3 dups delivered; boundaries fire on device wall", async ({
    page,
  }) => {
    // Real time 09:00 UTC → device clock 09:45 UTC (45 min ahead).
    // Baseline quiet 09:00–10:00 (device time). At device 09:45 → inside.
    await page.clock.install({ time: skew("2025-05-01T09:00:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    await injectDm(page, "real 09:00 (device 09:45) — baseline suppress");
    await page.waitForTimeout(400);
    await expect(
      page.getByText("real 09:00 (device 09:45) — baseline suppress"),
    ).toHaveCount(0);

    // Three monotonically-newer versions, each with a different quiet_end.
    // The boundary fires when DEVICE time hits quiet_end. Because the device
    // clock is +45min ahead, the boundary occurs at real = quiet_end − 0:45.
    const v1: PrefsRow = {
      ...state.row,
      quiet_end: "10:00",
      updated_at: "2025-05-01T09:01:00Z",
    };
    const v2: PrefsRow = {
      ...state.row,
      quiet_end: "11:00",
      updated_at: "2025-05-01T09:02:00Z",
    };
    const v3: PrefsRow = {
      ...state.row,
      quiet_end: "12:00",
      updated_at: "2025-05-01T09:03:00Z",
    };

    // ── Phase A: v1 dups. Boundary device 10:00 ↔ real 09:15.
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v1);
    await page.waitForTimeout(50);

    // Real 09:14:59 → device 09:59:59 → inside v1 → suppress.
    await page.clock.setFixedTime(skew("2025-05-01T09:14:59Z"));
    await injectDm(page, "real 09:14:59 (device 09:59:59) — v1 suppress");
    await page.waitForTimeout(400);
    await expect(
      page.getByText("real 09:14:59 (device 09:59:59) — v1 suppress"),
    ).toHaveCount(0);

    // Real 09:15:00 → device 10:00:00 → v1 end boundary exact → toast.
    await page.clock.setFixedTime(skew("2025-05-01T09:15:00Z"));
    await injectDm(page, "real 09:15 (device 10:00) — v1 end toast");
    await expect(
      page.getByText("real 09:15 (device 10:00) — v1 end toast"),
    ).toBeVisible({ timeout: 5_000 });

    // ── Phase B: v2 dups interleaved with stale v1 dup. Boundary device 11:00 ↔ real 10:15.
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v1); // stale
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v2);
    await page.waitForTimeout(50);

    // Same real 09:15 (device 10:00) — now under v2 (ends 11:00) → suppress despite v1 dup.
    await injectDm(page, "real 09:15 (device 10:00) — v2 latest suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("real 09:15 (device 10:00) — v2 latest suppress"),
    ).toHaveCount(0);

    // Real 10:14:59 → device 10:59:59 → inside v2 → suppress.
    await page.clock.setFixedTime(skew("2025-05-01T10:14:59Z"));
    await injectDm(page, "real 10:14:59 (device 10:59:59) — v2 suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("real 10:14:59 (device 10:59:59) — v2 suppress"),
    ).toHaveCount(0);

    // Real 10:15:00 → device 11:00:00 → v2 end boundary exact → toast.
    await page.clock.setFixedTime(skew("2025-05-01T10:15:00Z"));
    await injectDm(page, "real 10:15 (device 11:00) — v2 end toast");
    await expect(
      page.getByText("real 10:15 (device 11:00) — v2 end toast"),
    ).toBeVisible({ timeout: 5_000 });

    // ── Phase C: v3 dups jumbled with stale v1/v2. Boundary device 12:00 ↔ real 11:15.
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v3);
    await page.waitForTimeout(50);

    // Same real 10:15 (device 11:00) — under v3 (ends 12:00) → suppress.
    await injectDm(page, "real 10:15 (device 11:00) — v3 latest suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("real 10:15 (device 11:00) — v3 latest suppress"),
    ).toHaveCount(0);

    // Real 11:14:59 → device 11:59:59 → inside v3 → suppress.
    await page.clock.setFixedTime(skew("2025-05-01T11:14:59Z"));
    await injectDm(page, "real 11:14:59 (device 11:59:59) — v3 suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("real 11:14:59 (device 11:59:59) — v3 suppress"),
    ).toHaveCount(0);

    // Real 11:15:00 → device 12:00:00 → v3 end boundary exact → toast.
    await page.clock.setFixedTime(skew("2025-05-01T11:15:00Z"));
    await injectDm(page, "real 11:15 (device 12:00) — v3 end toast");
    await expect(
      page.getByText("real 11:15 (device 12:00) — v3 end toast"),
    ).toBeVisible({ timeout: 5_000 });

    // Final jumbled flurry — v3 still governs.
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v3);
    await page.waitForTimeout(100);

    // Real 11:15:01 → device 12:00:01 → past v3 end → toast.
    await page.clock.setFixedTime(skew("2025-05-01T11:15:01Z"));
    await injectDm(page, "real 11:15:01 (device 12:00:01) — past v3 toast");
    await expect(
      page.getByText("real 11:15:01 (device 12:00:01) — past v3 toast"),
    ).toBeVisible({ timeout: 5_000 });
  });
});
