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

/** Mocks the REST endpoint backing the notification settings page. */
async function mockPrefsApi(page: Page, state: PrefsState) {
  const handle = async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const json = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(body),
      });

    if (method === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    if (url.pathname.endsWith("/rest/v1/notification_preferences")) {
      if (method === "GET") {
        return json(200, state.row ? [state.row] : []);
      }
      if (method === "POST") {
        const raw = req.postData() ?? "{}";
        const body = JSON.parse(raw);
        const row = Array.isArray(body) ? body[0] : body;
        const merged = { ...defaultRow(), ...row } as PrefsRow;
        state.row = merged;
        state.lastWrite = merged;
        return json(201, [merged]);
      }
    }
    return route.continue();
  };
  await page.route(`**/rest/v1/notification_preferences*`, handle);
}

/** Time helpers — quiet hours are evaluated against UTC when timezone="UTC". */
function pad(n: number) {
  return String((n + 24) % 24).padStart(2, "0") + ":00";
}
function nowUtcHour(): number {
  return new Date().getUTCHours();
}

test.describe("Notification settings page", () => {
  test.describe.configure({ mode: "serial" });

  test("loads default values when no row exists yet", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await mockPrefsApi(page, { row: null });
    await page.goto("/settings/notifications");

    await expect(page.getByTestId("notif-settings-root")).toBeVisible();
    await expect(page.getByTestId("toggle-dm-push")).toHaveAttribute("data-state", "checked");
    await expect(page.getByTestId("toggle-dm-inapp")).toHaveAttribute("data-state", "checked");
    await expect(page.getByTestId("toggle-quiet")).toHaveAttribute("data-state", "unchecked");
    // Time inputs are hidden while quiet hours are disabled.
    await expect(page.getByTestId("quiet-start")).toHaveCount(0);
  });

  test("loads existing prefs from server and reflects them in toggles", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await mockPrefsApi(page, {
      row: defaultRow({
        dm_push_enabled: false,
        dm_inapp_enabled: true,
        quiet_hours_enabled: true,
        quiet_start: "23:00",
        quiet_end: "06:00",
        timezone: "UTC",
      }),
    });
    await page.goto("/settings/notifications");

    await expect(page.getByTestId("toggle-dm-push")).toHaveAttribute("data-state", "unchecked");
    await expect(page.getByTestId("toggle-dm-inapp")).toHaveAttribute("data-state", "checked");
    await expect(page.getByTestId("toggle-quiet")).toHaveAttribute("data-state", "checked");
    await expect(page.getByTestId("quiet-start")).toHaveValue("23:00");
    await expect(page.getByTestId("quiet-end")).toHaveValue("06:00");
  });

  test("toggling quiet hours reveals the time/timezone inputs", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await mockPrefsApi(page, { row: null });
    await page.goto("/settings/notifications");

    await expect(page.getByTestId("quiet-start")).toHaveCount(0);
    await page.getByTestId("toggle-quiet").click();
    await expect(page.getByTestId("quiet-start")).toBeVisible();
    await expect(page.getByTestId("quiet-end")).toBeVisible();
    await expect(page.getByTestId("quiet-tz")).toBeVisible();
    await expect(page.getByTestId("quiet-status")).toBeVisible();
  });

  test("quiet-hours hint says 'currently in quiet hours' when now is inside the window", async ({
    page,
  }) => {
    await mockAuth(page, VERIFIED);
    const h = nowUtcHour();
    await mockPrefsApi(page, {
      row: defaultRow({
        quiet_hours_enabled: true,
        quiet_start: pad(h - 1),
        quiet_end: pad(h + 2),
        timezone: "UTC",
      }),
    });
    await page.goto("/settings/notifications");

    await expect(page.getByTestId("quiet-status")).toContainText(/currently in quiet hours/i);
  });

  test("quiet-hours hint says 'outside quiet hours' when now is outside the window", async ({
    page,
  }) => {
    await mockAuth(page, VERIFIED);
    const h = nowUtcHour();
    await mockPrefsApi(page, {
      row: defaultRow({
        quiet_hours_enabled: true,
        quiet_start: pad(h + 3),
        quiet_end: pad(h + 5),
        timezone: "UTC",
      }),
    });
    await page.goto("/settings/notifications");

    await expect(page.getByTestId("quiet-status")).toContainText(/outside quiet hours/i);
  });

  test("cross-midnight quiet window covering now is treated as in-quiet", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    const h = nowUtcHour();
    // start = h-1, end = h-2 → start > end → window wraps midnight and covers now.
    await mockPrefsApi(page, {
      row: defaultRow({
        quiet_hours_enabled: true,
        quiet_start: pad(h - 1),
        quiet_end: pad(h - 2),
        timezone: "UTC",
      }),
    });
    await page.goto("/settings/notifications");

    await expect(page.getByTestId("quiet-status")).toContainText(/currently in quiet hours/i);
  });

  test("saving persists all toggle states (push off, in-app off, quiet on)", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    const state: PrefsState = { row: null };
    await mockPrefsApi(page, state);
    await page.goto("/settings/notifications");

    // Flip everything from defaults.
    await page.getByTestId("toggle-dm-push").click(); // on -> off
    await page.getByTestId("toggle-dm-inapp").click(); // on -> off
    await page.getByTestId("toggle-quiet").click(); // off -> on
    await page.getByTestId("quiet-start").fill("21:30");
    await page.getByTestId("quiet-end").fill("06:15");

    await page.getByTestId("save-settings").click();

    await expect.poll(() => state.lastWrite).toBeTruthy();
    expect(state.lastWrite).toMatchObject({
      user_id: VERIFIED.id,
      dm_push_enabled: false,
      dm_inapp_enabled: false,
      quiet_hours_enabled: true,
      quiet_start: "21:30",
      quiet_end: "06:15",
    });
  });

  test("disabling quiet hours after enabling collapses the inputs again", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await mockPrefsApi(page, {
      row: defaultRow({ quiet_hours_enabled: true }),
    });
    await page.goto("/settings/notifications");

    await expect(page.getByTestId("quiet-start")).toBeVisible();
    await page.getByTestId("toggle-quiet").click();
    await expect(page.getByTestId("quiet-start")).toHaveCount(0);
  });
});
