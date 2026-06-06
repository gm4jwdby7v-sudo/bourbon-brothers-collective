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
          thread_id: "thread-boundary-dups",
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

test.describe("Duplicate prefs updates with boundary quiet_end values → latest version governs at exact moments", () => {
  test("duplicates of v1 (10:00), v2 (12:00), v3 (12:00:00.000) — latest wins at each exact boundary", async ({
    page,
  }) => {
    // Baseline quiet window 09:00–10:00 UTC. Start inside.
    await page.clock.install({ time: new Date("2025-05-01T09:30:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    // 09:30 inside baseline → suppress.
    await injectDm(page, "09:30 — baseline suppress");
    await page.waitForTimeout(400);
    await expect(page.getByText("09:30 — baseline suppress")).toHaveCount(0);

    // Three versions, each with a boundary-like quiet_end value.
    // v1 ends at 10:00 (the baseline end).
    // v2 ends at 12:00.
    // v3 ends at 12:00:00.000 — same instant as v2 but a different serialized form.
    const v1: PrefsRow = {
      ...state.row,
      quiet_end: "10:00",
      updated_at: "2025-05-01T09:31:00Z",
    };
    const v2: PrefsRow = {
      ...state.row,
      quiet_end: "12:00",
      updated_at: "2025-05-01T09:32:00Z",
    };
    const v3: PrefsRow = {
      ...state.row,
      quiet_end: "12:00:00.000",
      updated_at: "2025-05-01T09:33:00Z",
    };

    // ── Phase A: only v1 duplicates have arrived (latest = v1, end 10:00).
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v1);
    await page.waitForTimeout(50);

    // 09:59:59 inside v1 → suppress.
    await page.clock.setFixedTime(new Date("2025-05-01T09:59:59Z"));
    await injectDm(page, "09:59:59 — v1 suppress");
    await page.waitForTimeout(400);
    await expect(page.getByText("09:59:59 — v1 suppress")).toHaveCount(0);

    // 10:00:00 exact end boundary under v1 → toast (end is exclusive).
    await page.clock.setFixedTime(new Date("2025-05-01T10:00:00Z"));
    await injectDm(page, "10:00 — v1 end boundary toast");
    await expect(
      page.getByText("10:00 — v1 end boundary toast"),
    ).toBeVisible({ timeout: 5_000 });

    // ── Phase B: v2 duplicates arrive (latest = v2, end 12:00), interleaved with stale v1 dups.
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v1); // stale duplicate
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v2);
    await page.waitForTimeout(50);

    // 10:00:00 now inside v2 (09:00–12:00) → must suppress despite stale v1 dup.
    await injectDm(page, "10:00 — v2 latest suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("10:00 — v2 latest suppress")).toHaveCount(0);

    // 11:59:59 inside v2 → suppress.
    await page.clock.setFixedTime(new Date("2025-05-01T11:59:59Z"));
    await injectDm(page, "11:59:59 — v2 suppress");
    await page.waitForTimeout(500);
    await expect(page.getByText("11:59:59 — v2 suppress")).toHaveCount(0);

    // ── Phase C: v3 duplicates arrive (latest = v3, end 12:00:00.000 — same instant as v2),
    // interleaved with stale v1/v2 dups.
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v3);
    await page.waitForTimeout(50);

    // 11:59:59.999 still inside v3 → suppress.
    await page.clock.setFixedTime(new Date("2025-05-01T11:59:59.999Z"));
    await injectDm(page, "11:59:59.999 — v3 suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("11:59:59.999 — v3 suppress"),
    ).toHaveCount(0);

    // 12:00:00.000 exact end boundary under v3 → toast.
    await page.clock.setFixedTime(new Date("2025-05-01T12:00:00.000Z"));
    await injectDm(page, "12:00:00.000 — v3 end boundary toast");
    await expect(
      page.getByText("12:00:00.000 — v3 end boundary toast"),
    ).toBeVisible({ timeout: 5_000 });

    // Final jumbled flurry of duplicates — v3 must still be the latest.
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v3);
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v3);
    await page.waitForTimeout(100);

    // 12:00:01 outside v3 → toast.
    await page.clock.setFixedTime(new Date("2025-05-01T12:00:01Z"));
    await injectDm(page, "12:00:01 — past v3 end toast");
    await expect(
      page.getByText("12:00:01 — past v3 end toast"),
    ).toBeVisible({ timeout: 5_000 });
  });
});
