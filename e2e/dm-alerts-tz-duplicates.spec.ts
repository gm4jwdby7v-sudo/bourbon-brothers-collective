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
          thread_id: "thread-tz-dups",
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

test.describe("Duplicate prefs updates across timezone offsets → latest quiet_end governs exact boundaries", () => {
  test("v1 (UTC), v2 (America/New_York EDT), v3 (Asia/Tokyo) — latest wins at each exact UTC boundary moment", async ({
    page,
  }) => {
    // Baseline UTC 09:00–10:00. Start inside.
    await page.clock.install({ time: new Date("2025-05-01T09:30:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    await injectDm(page, "09:30 — baseline UTC suppress");
    await page.waitForTimeout(400);
    await expect(page.getByText("09:30 — baseline UTC suppress")).toHaveCount(
      0,
    );

    // Three monotonically-newer versions with different timezones, each
    // chosen so the local quiet_end maps to a distinct UTC boundary.
    //
    //   v1: UTC, 09:00–10:00     → ends at UTC 10:00
    //   v2: America/New_York (EDT, UTC−4 in May), 06:00–07:00
    //                              → ends at UTC 11:00
    //   v3: Asia/Tokyo (UTC+9),  19:00–21:00
    //                              → ends at UTC 12:00 (covers UTC 10:00–12:00)
    const v1: PrefsRow = {
      ...state.row,
      timezone: "UTC",
      quiet_start: "09:00",
      quiet_end: "10:00",
      updated_at: "2025-05-01T09:31:00Z",
    };
    const v2: PrefsRow = {
      ...state.row,
      timezone: "America/New_York",
      quiet_start: "06:00",
      quiet_end: "07:00",
      updated_at: "2025-05-01T09:32:00Z",
    };
    const v3: PrefsRow = {
      ...state.row,
      timezone: "Asia/Tokyo",
      quiet_start: "19:00",
      quiet_end: "21:00",
      updated_at: "2025-05-01T09:33:00Z",
    };

    // ── Phase A: v1 duplicates (latest = v1, ends UTC 10:00).
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v1);
    await page.waitForTimeout(50);

    await page.clock.setFixedTime(new Date("2025-05-01T09:59:59Z"));
    await injectDm(page, "UTC 09:59:59 — v1 suppress");
    await page.waitForTimeout(400);
    await expect(page.getByText("UTC 09:59:59 — v1 suppress")).toHaveCount(0);

    await page.clock.setFixedTime(new Date("2025-05-01T10:00:00Z"));
    await injectDm(page, "UTC 10:00 — v1 end boundary toast");
    await expect(
      page.getByText("UTC 10:00 — v1 end boundary toast"),
    ).toBeVisible({ timeout: 5_000 });

    // ── Phase B: v2 duplicates (latest = v2, EDT 06:00–07:00 = UTC 10:00–11:00),
    // interleaved with stale v1 dups.
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v1); // stale dup
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v2);
    await page.waitForTimeout(50);

    // UTC 10:00:00 — now inside v2 (EDT 06:00) → must suppress despite v1 dup.
    await injectDm(page, "UTC 10:00 — v2 latest suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("UTC 10:00 — v2 latest suppress")).toHaveCount(
      0,
    );

    // UTC 10:59:59 — inside v2 → suppress.
    await page.clock.setFixedTime(new Date("2025-05-01T10:59:59Z"));
    await injectDm(page, "UTC 10:59:59 — v2 suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("UTC 10:59:59 — v2 suppress")).toHaveCount(0);

    // UTC 11:00:00 — EDT 07:00 exact end boundary under v2 → toast.
    await page.clock.setFixedTime(new Date("2025-05-01T11:00:00Z"));
    await injectDm(page, "UTC 11:00 — v2 EDT end boundary toast");
    await expect(
      page.getByText("UTC 11:00 — v2 EDT end boundary toast"),
    ).toBeVisible({ timeout: 5_000 });

    // ── Phase C: v3 duplicates (latest = v3, JST 19:00–21:00 = UTC 10:00–12:00),
    // jumbled with stale v1 and v2 dups.
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v3);
    await page.waitForTimeout(50);

    // UTC 11:00 — outside v1 and v2 boundaries, but inside v3 (JST 20:00) → suppress.
    await injectDm(page, "UTC 11:00 — v3 latest suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("UTC 11:00 — v3 latest suppress")).toHaveCount(
      0,
    );

    // UTC 11:59:59 — JST 20:59:59 inside v3 → suppress.
    await page.clock.setFixedTime(new Date("2025-05-01T11:59:59Z"));
    await injectDm(page, "UTC 11:59:59 — v3 suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("UTC 11:59:59 — v3 suppress")).toHaveCount(0);

    // UTC 12:00 — JST 21:00 exact end boundary under v3 → toast.
    await page.clock.setFixedTime(new Date("2025-05-01T12:00:00Z"));
    await injectDm(page, "UTC 12:00 — v3 JST end boundary toast");
    await expect(
      page.getByText("UTC 12:00 — v3 JST end boundary toast"),
    ).toBeVisible({ timeout: 5_000 });

    // Final jumbled flurry — v3 must still govern.
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v3);
    await page.waitForTimeout(100);

    await page.clock.setFixedTime(new Date("2025-05-01T12:00:01Z"));
    await injectDm(page, "UTC 12:00:01 — past v3 end toast");
    await expect(
      page.getByText("UTC 12:00:01 — past v3 end toast"),
    ).toBeVisible({ timeout: 5_000 });
  });
});
