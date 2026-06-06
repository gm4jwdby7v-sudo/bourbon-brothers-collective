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
  row: PrefsRow | null;
  lastWrite?: PrefsRow;
}

function defaultRow(overrides: Partial<PrefsRow> = {}): PrefsRow {
  return {
    user_id: VERIFIED.id,
    dm_push_enabled: true,
    dm_inapp_enabled: true,
    quiet_hours_enabled: false,
    quiet_start: "22:00",
    quiet_end: "07:00",
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
    if (req.method() === "GET") {
      return json(route, 200, state.row ? [state.row] : []);
    }
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() ?? "{}");
      const row = Array.isArray(body) ? body[0] : body;
      const merged = { ...defaultRow(), ...row } as PrefsRow;
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
          thread_id: "thread-live",
          sender_id: "u-other",
          body,
          created_at: new Date().toISOString(),
        },
      }),
    );
  }, body);
}

/**
 * Simulate the realtime prefs-update callback fired when notification_preferences
 * changes. In production this is the Supabase postgres_changes channel; the
 * settings page write triggers the same payload that updates `prefsRef` live.
 */
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

function pad(n: number) {
  return String((n + 24) % 24).padStart(2, "0") + ":00";
}

test.describe("Live notification settings → DmAlerts (no refresh)", () => {
  test.describe.configure({ mode: "serial" });

  test("toggling in-app alerts off on settings page immediately suppresses toasts", async ({
    page,
  }) => {
    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow({ dm_inapp_enabled: true }) };
    await mockApis(page, state);

    // Start on home; DmAlerts mounts in __root.
    await page.goto("/");
    await waitForPrefsGet(page);

    // Sanity: with in-app ON, a DM toast appears.
    await injectDm(page, "First message — should toast");
    await expect(page.getByText("First message — should toast")).toBeVisible({
      timeout: 5_000,
    });

    // Navigate to settings (DmAlerts persists, lives in __root).
    await page.goto("/settings/notifications");
    await expect(page.getByTestId("notif-settings-root")).toBeVisible();

    // Toggle in-app off and save.
    await page.getByTestId("toggle-dm-inapp").click();
    await page.getByTestId("save-settings").click();
    await expect.poll(() => state.lastWrite?.dm_inapp_enabled).toBe(false);

    // Simulate the realtime broadcast that the live channel would deliver
    // to DmAlerts after the row was updated.
    await broadcastPrefsUpdate(page, state.lastWrite!);

    // Stay on settings page (no refresh, no navigation away).
    await injectDm(page, "Second message — should NOT toast");
    await page.waitForTimeout(500);
    await expect(
      page.getByText("Second message — should NOT toast"),
    ).toHaveCount(0);
  });

  test("turning in-app alerts back on immediately re-enables toasts", async ({
    page,
  }) => {
    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow({ dm_inapp_enabled: false }) };
    await mockApis(page, state);

    await page.goto("/settings/notifications");
    await waitForPrefsGet(page);

    // Initially off — DM should be suppressed.
    await injectDm(page, "While off — suppressed");
    await page.waitForTimeout(400);
    await expect(page.getByText("While off — suppressed")).toHaveCount(0);

    // Toggle in-app back on and save.
    await page.getByTestId("toggle-dm-inapp").click();
    await page.getByTestId("save-settings").click();
    await expect.poll(() => state.lastWrite?.dm_inapp_enabled).toBe(true);

    await broadcastPrefsUpdate(page, state.lastWrite!);

    await injectDm(page, "After re-enable — should toast");
    await expect(
      page.getByText("After re-enable — should toast"),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("enabling quiet hours covering now immediately suppresses toasts", async ({
    page,
  }) => {
    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: defaultRow({ dm_inapp_enabled: true }) };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    // Pre-quiet: toast appears.
    await injectDm(page, "Pre-quiet hours toast");
    await expect(page.getByText("Pre-quiet hours toast")).toBeVisible({
      timeout: 5_000,
    });

    // Go enable quiet hours covering now (cross-midnight window in UTC).
    await page.goto("/settings/notifications");
    await expect(page.getByTestId("notif-settings-root")).toBeVisible();
    await page.getByTestId("toggle-quiet").click();
    const h = new Date().getUTCHours();
    await page.getByTestId("quiet-start").fill(pad(h - 1));
    await page.getByTestId("quiet-end").fill(pad(h - 2));
    await page.getByTestId("save-settings").click();
    await expect.poll(() => state.lastWrite?.quiet_hours_enabled).toBe(true);

    await broadcastPrefsUpdate(page, {
      ...state.lastWrite!,
      timezone: "UTC",
      quiet_start: pad(h - 1),
      quiet_end: pad(h - 2),
    });

    await injectDm(page, "Mid-quiet hours — suppressed");
    await page.waitForTimeout(500);
    await expect(page.getByText("Mid-quiet hours — suppressed")).toHaveCount(
      0,
    );
  });
});
