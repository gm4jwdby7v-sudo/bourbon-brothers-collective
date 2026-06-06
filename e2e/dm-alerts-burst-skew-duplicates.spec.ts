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
    return json(route, 200, [{ display_name: "Alex Carter", username: "alex" }]);
  });
}

async function injectDm(page: Page, body: string) {
  await page.evaluate((body) => {
    window.dispatchEvent(
      new CustomEvent("dm-alerts:test-inject", {
        detail: {
          id: `msg-${Date.now()}-${Math.random()}`,
          thread_id: "thread-burst-skew",
          sender_id: "u-other",
          body,
          created_at: new Date().toISOString(),
        },
      }),
    );
  }, body);
}

async function broadcastBurst(page: Page, rows: PrefsRow[]) {
  // Deliver the whole burst in a single evaluate() call so they fire
  // synchronously, as quickly as possible — modeling a backlog flushed
  // in one tick after reconnect.
  await page.evaluate((rows) => {
    for (const row of rows) {
      window.dispatchEvent(new CustomEvent("dm-alerts:test-update-prefs", { detail: row }));
    }
  }, rows);
}

async function waitForPrefsGet(page: Page) {
  await page.waitForResponse(
    (r) => r.url().includes("/rest/v1/notification_preferences") && r.request().method() === "GET",
    { timeout: 10_000 },
  );
  await page.waitForTimeout(150);
}

// Device clock runs +30 minutes ahead of "real" reference time.
const CLOCK_SKEW_MINUTES = 30;
const skew = (realIso: string) =>
  new Date(new Date(realIso).getTime() + CLOCK_SKEW_MINUTES * 60_000);

test.describe("Burst of duplicate prefs updates under clock skew → final latest version governs at transition", () => {
  test("synchronous burst with mixed quiet_end values; final v5 governs the boundary on the skewed device clock", async ({
    page,
  }) => {
    // Real 09:00 UTC → device 09:30 UTC. Baseline quiet 09:00–10:00 (device).
    await page.clock.install({ time: skew("2025-05-01T09:00:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    await injectDm(page, "real 09:00 (device 09:30) — baseline suppress");
    await page.waitForTimeout(400);
    await expect(page.getByText("real 09:00 (device 09:30) — baseline suppress")).toHaveCount(0);

    // Five monotonically-newer versions; the final v5 must govern.
    // Boundary fires when DEVICE wall hits quiet_end. With +30m skew,
    // v5 (12:30) end ↔ real 12:00.
    const v1: PrefsRow = {
      ...state.row,
      quiet_end: "10:15",
      updated_at: "2025-05-01T09:01:00Z",
    };
    const v2: PrefsRow = {
      ...state.row,
      quiet_end: "11:00",
      updated_at: "2025-05-01T09:02:00Z",
    };
    const v3: PrefsRow = {
      ...state.row,
      quiet_end: "11:30",
      updated_at: "2025-05-01T09:03:00Z",
    };
    const v4: PrefsRow = {
      ...state.row,
      quiet_end: "12:00",
      updated_at: "2025-05-01T09:04:00Z",
    };
    const v5: PrefsRow = {
      ...state.row,
      quiet_end: "12:30",
      updated_at: "2025-05-01T09:05:00Z",
    };

    // Synchronous burst with jumbled mix; v5 is the FINAL event in the burst.
    await broadcastBurst(page, [
      v2,
      v1,
      v4,
      v2,
      v3,
      v1,
      v4,
      v3,
      v2,
      v1,
      v3,
      v4,
      v2,
      v5, // ← final latest in this burst
    ]);
    await page.waitForTimeout(50);

    // Real 09:45 (device 10:15) — past v1's end but inside v5 → suppress.
    await page.clock.setFixedTime(skew("2025-05-01T09:45:00Z"));
    await injectDm(page, "real 09:45 (device 10:15) — v5 suppress past v1 end");
    await page.waitForTimeout(500);
    await expect(page.getByText("real 09:45 (device 10:15) — v5 suppress past v1 end")).toHaveCount(
      0,
    );

    // Real 11:00 (device 11:30) — past v2 and v3 ends, inside v5 → suppress.
    await page.clock.setFixedTime(skew("2025-05-01T11:00:00Z"));
    await injectDm(page, "real 11:00 (device 11:30) — v5 suppress past v3 end");
    await page.waitForTimeout(500);
    await expect(page.getByText("real 11:00 (device 11:30) — v5 suppress past v3 end")).toHaveCount(
      0,
    );

    // A second burst arrives later with v5 reissued last, sandwiched
    // by every stale version repeatedly. v5 must remain the latest.
    await broadcastBurst(page, [
      v4,
      v3,
      v2,
      v1,
      v4,
      v3,
      v2,
      v1,
      v4,
      v3,
      v5,
      v4,
      v3,
      v2,
      v1,
      v5, // ← final latest again
    ]);
    await page.waitForTimeout(50);

    // Real 11:30 (device 12:00) — past v4's end, inside v5 → suppress.
    await page.clock.setFixedTime(skew("2025-05-01T11:30:00Z"));
    await injectDm(page, "real 11:30 (device 12:00) — v5 suppress past v4 end");
    await page.waitForTimeout(500);
    await expect(page.getByText("real 11:30 (device 12:00) — v5 suppress past v4 end")).toHaveCount(
      0,
    );

    // Real 11:59:59 (device 12:29:59) — inside v5 → suppress.
    await page.clock.setFixedTime(skew("2025-05-01T11:59:59Z"));
    await injectDm(page, "real 11:59:59 (device 12:29:59) — v5 suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("real 11:59:59 (device 12:29:59) — v5 suppress")).toHaveCount(0);

    // Real 12:00:00 (device 12:30:00) — exact v5 end boundary → toast.
    await page.clock.setFixedTime(skew("2025-05-01T12:00:00Z"));
    await injectDm(page, "real 12:00 (device 12:30) — v5 end transition toast");
    await expect(page.getByText("real 12:00 (device 12:30) — v5 end transition toast")).toBeVisible(
      { timeout: 5_000 },
    );

    // One more jumbled burst after the boundary; v5 still last → still outside.
    await broadcastBurst(page, [v1, v2, v3, v4, v5, v4, v3, v2, v1, v5]);
    await page.waitForTimeout(50);

    await page.clock.setFixedTime(skew("2025-05-01T12:00:01Z"));
    await injectDm(page, "real 12:00:01 (device 12:30:01) — past v5 end toast");
    await expect(page.getByText("real 12:00:01 (device 12:30:01) — past v5 end toast")).toBeVisible(
      { timeout: 5_000 },
    );
  });
});
