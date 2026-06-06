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
    return json(route, 200, [{ display_name: "Alex Carter", username: "alex" }]);
  });
}

async function injectDm(page: Page, body: string) {
  await page.evaluate((body) => {
    window.dispatchEvent(
      new CustomEvent("dm-alerts:test-inject", {
        detail: {
          id: `msg-${Date.now()}-${Math.random()}`,
          thread_id: "thread-tz",
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

function pad(n: number) {
  return String((n + 24) % 24).padStart(2, "0") + ":00";
}

test.describe("Live timezone change → DmAlerts quiet hours (no refresh)", () => {
  test.describe.configure({ mode: "serial" });

  test("changing timezone immediately moves 'now' out of the quiet window", async ({ page }) => {
    await mockAuth(page, VERIFIED);

    // Build a tight quiet window in UTC that brackets the current UTC hour,
    // so with timezone=UTC we are inside quiet hours.
    const h = new Date().getUTCHours();
    const quietStart = pad(h - 1);
    const quietEnd = pad(h + 1);

    const state: PrefsState = {
      row: defaultRow({
        dm_inapp_enabled: true,
        quiet_hours_enabled: true,
        quiet_start: quietStart,
        quiet_end: quietEnd,
        timezone: "UTC",
      }),
    };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    // In UTC, "now" sits inside the window → toast suppressed.
    await injectDm(page, "UTC mid-quiet — suppressed");
    await page.waitForTimeout(400);
    await expect(page.getByText("UTC mid-quiet — suppressed")).toHaveCount(0);

    // Open settings and change time zone via the Select (no refresh).
    await page.goto("/settings/notifications");
    await expect(page.getByTestId("notif-settings-root")).toBeVisible();

    // Pick a zone whose local hour is ~12h away from UTC so the same
    // [h-1, h+1] window definitely does NOT cover "now".
    await page.getByTestId("quiet-tz").click();
    await page.getByRole("option", { name: "Pacific/Auckland" }).click();

    await page.getByTestId("save-settings").click();
    await expect.poll(() => state.lastWrite?.timezone).toBe("Pacific/Auckland");

    // Simulate the realtime broadcast that updates DmAlerts' live prefs.
    await broadcastPrefsUpdate(page, state.lastWrite!);

    // Same quiet window, new tz → "now" is outside → toast appears.
    await injectDm(page, "After tz change — should toast");
    await expect(page.getByText("After tz change — should toast")).toBeVisible({ timeout: 5_000 });
  });

  test("changing timezone immediately moves 'now' into the quiet window", async ({ page }) => {
    await mockAuth(page, VERIFIED);

    // Quiet window centered on current Auckland hour. In UTC that won't
    // cover "now" (offsets are 12–13h apart), so we start outside quiet.
    const aucklandHour =
      Number(
        new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          hour12: false,
          timeZone: "Pacific/Auckland",
        })
          .formatToParts(new Date())
          .find((p) => p.type === "hour")?.value ?? "0",
      ) % 24;
    const quietStart = pad(aucklandHour - 1);
    const quietEnd = pad(aucklandHour + 1);

    const state: PrefsState = {
      row: defaultRow({
        dm_inapp_enabled: true,
        quiet_hours_enabled: true,
        quiet_start: quietStart,
        quiet_end: quietEnd,
        timezone: "UTC",
      }),
    };
    await mockApis(page, state);

    await page.goto("/");
    await waitForPrefsGet(page);

    // In UTC, "now" is outside window → toast shows.
    await injectDm(page, "UTC outside — should toast");
    await expect(page.getByText("UTC outside — should toast")).toBeVisible({
      timeout: 5_000,
    });

    // Switch to Pacific/Auckland on settings page.
    await page.goto("/settings/notifications");
    await expect(page.getByTestId("notif-settings-root")).toBeVisible();
    await page.getByTestId("quiet-tz").click();
    await page.getByRole("option", { name: "Pacific/Auckland" }).click();
    await page.getByTestId("save-settings").click();
    await expect.poll(() => state.lastWrite?.timezone).toBe("Pacific/Auckland");

    await broadcastPrefsUpdate(page, state.lastWrite!);

    // Now Auckland local time sits inside the window → suppressed.
    await injectDm(page, "After tz → into quiet — suppressed");
    await page.waitForTimeout(500);
    await expect(page.getByText("After tz → into quiet — suppressed")).toHaveCount(0);
  });
});
