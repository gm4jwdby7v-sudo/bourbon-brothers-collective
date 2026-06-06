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
          thread_id: "thread-duplicates",
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

async function setOffline(page: Page, offline: boolean) {
  await page.context().setOffline(offline);
  await page.evaluate((isOffline) => {
    window.dispatchEvent(new Event(isOffline ? "offline" : "online"));
  }, offline);
}

test.describe("Duplicate prefs updates while offline → newest version after reconnect", () => {
  test("same newer version broadcast multiple times while offline; suppression uses newest window after reconnect", async ({
    page,
  }) => {
    // Old window: 10:00–11:00 UTC. Start inside old window.
    await page.clock.install({ time: new Date("2025-05-01T10:30:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    // 10:30 — inside old window → suppressed.
    await injectDm(page, "10:30 — old prefs suppress");
    await page.waitForTimeout(400);
    await expect(page.getByText("10:30 — old prefs suppress")).toHaveCount(0);

    // User extends quiet end to 12:00 on settings page.
    await page.goto("/settings/notifications");
    await expect(page.getByTestId("notif-settings-root")).toBeVisible();
    await page.getByTestId("quiet-end").fill("12:00");
    await page.getByTestId("save-settings").click();
    await expect.poll(() => state.lastWrite?.quiet_end).toBe("12:00");

    // Go offline before the old boundary; realtime cannot deliver the update.
    await setOffline(page, true);

    // Cross old boundary while offline: 11:00 → old prefs say outside, toast.
    await page.clock.setFixedTime(new Date("2025-05-01T11:00:00Z"));
    await injectDm(page, "11:00 — offline old end boundary toasts");
    await expect(
      page.getByText("11:00 — offline old end boundary toasts"),
    ).toBeVisible({ timeout: 5_000 });

    // 11:15 still offline → old prefs still say outside, toast.
    await page.clock.setFixedTime(new Date("2025-05-01T11:15:00Z"));
    await injectDm(page, "11:15 — offline still toasts");
    await expect(
      page.getByText("11:15 — offline still toasts"),
    ).toBeVisible({ timeout: 5_000 });

    // Reconnect. The missed update is delivered multiple times (duplicates).
    await setOffline(page, false);
    await page.waitForTimeout(200);

    const newRow = state.lastWrite!;

    // Deliver the same new prefs row three times in a row.
    await broadcastPrefsUpdate(page, newRow);
    await broadcastPrefsUpdate(page, newRow);
    await broadcastPrefsUpdate(page, newRow);
    await page.waitForTimeout(150);

    // Same 11:15 UTC, now under new prefs (10:00–12:00) → suppressed.
    await injectDm(page, "11:15 — post-reconnect latest suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("11:15 — post-reconnect latest suppress"),
    ).toHaveCount(0);

    // New boundary: 11:59 inside → suppressed, 12:00 outside → toast.
    await page.clock.setFixedTime(new Date("2025-05-01T11:59:00Z"));
    await injectDm(page, "11:59 — latest window suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("11:59 — latest window suppress"),
    ).toHaveCount(0);

    await page.clock.setFixedTime(new Date("2025-05-01T12:00:00Z"));
    await injectDm(page, "12:00 — latest end boundary toast");
    await expect(
      page.getByText("12:00 — latest end boundary toast"),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("duplicate old version then latest version while offline; newest wins after reconnect", async ({
    page,
  }) => {
    // The client receives duplicates of an older window (10:00–11:15),
    // then finally the latest (10:00–12:00). The final version must govern.
    await page.clock.install({ time: new Date("2025-05-01T10:30:00Z") });

    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow() };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    // 10:30 — inside old window → suppressed.
    await injectDm(page, "10:30 — old prefs suppress");
    await page.waitForTimeout(400);
    await expect(page.getByText("10:30 — old prefs suppress")).toHaveCount(0);

    // Go offline before making edits.
    await setOffline(page, true);

    // Simulate: user first changed end to 11:15 (v1), then to 11:45 (v2),
    // then to 12:00 (v3). All three are queued as would-be broadcasts.
    const v1: PrefsRow = { ...state.row, quiet_end: "11:15" };
    const v2: PrefsRow = { ...state.row, quiet_end: "11:45" };
    const v3: PrefsRow = { ...state.row, quiet_end: "12:00" };

    // While offline at 11:05 → old prefs outside → toast.
    await page.clock.setFixedTime(new Date("2025-05-01T11:05:00Z"));
    await injectDm(page, "11:05 — offline old prefs toast");
    await expect(
      page.getByText("11:05 — offline old prefs toast"),
    ).toBeVisible({ timeout: 5_000 });

    // Reconnect. Deliver duplicates of v1, then v2, then v3 — all after reconnect.
    await setOffline(page, false);
    await page.waitForTimeout(200);
    await broadcastPrefsUpdate(page, v1);
    await broadcastPrefsUpdate(page, v1); // duplicate of v1
    await broadcastPrefsUpdate(page, v2);
    await broadcastPrefsUpdate(page, v2); // duplicate of v2
    await broadcastPrefsUpdate(page, v3);
    await page.waitForTimeout(150);

    // 11:05 under latest v3 (10:00–12:00) → suppressed.
    await injectDm(page, "11:05 — latest v3 suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("11:05 — latest v3 suppress"),
    ).toHaveCount(0);

    // 11:30 is outside v1 (11:15) and v2 (11:45), but inside v3 (12:00)
    // → must be suppressed by the latest version.
    await page.clock.setFixedTime(new Date("2025-05-01T11:30:00Z"));
    await injectDm(page, "11:30 — latest v3 suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("11:30 — latest v3 suppress"),
    ).toHaveCount(0);

    // 11:44 is outside v1/v2 but inside v3 → suppressed.
    await page.clock.setFixedTime(new Date("2025-05-01T11:44:00Z"));
    await injectDm(page, "11:44 — latest v3 suppress");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("11:44 — latest v3 suppress"),
    ).toHaveCount(0);

    // New end boundary exact: 12:00 → toast.
    await page.clock.setFixedTime(new Date("2025-05-01T12:00:00Z"));
    await injectDm(page, "12:00 — v3 end boundary toast");
    await expect(
      page.getByText("12:00 — v3 end boundary toast"),
    ).toBeVisible({ timeout: 5_000 });
  });
});
