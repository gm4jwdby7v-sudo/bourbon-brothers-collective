import { test, expect, Page, Request } from "@playwright/test";

const STORAGE_KEY = "sb-rjwbskhokscwmnndpoec-auth-token";

interface MockUser {
  id: string;
  email: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}

async function mockAuth(page: Page, user: MockUser | null) {
  if (user) {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const session = {
      access_token: "fake-access-token",
      refresh_token: "fake-refresh-token",
      expires_in: 3600,
      expires_at: expiresAt,
      token_type: "bearer",
      user: {
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at ?? null,
        confirmed_at: user.confirmed_at ?? null,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
        role: "authenticated",
        updated_at: new Date().toISOString(),
      },
    };
    await page.addInitScript(
      ({ session, key }: { session: unknown; key: string }) => {
        localStorage.setItem(key, JSON.stringify(session));
      },
      { session, key: STORAGE_KEY }
    );
  } else {
    await page.addInitScript(({ key }: { key: string }) => {
      localStorage.removeItem(key);
    }, { key: STORAGE_KEY });
  }

  await page.route(`*/**/auth/v1/user`, async (route) => {
    if (!user) {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Unauthorized" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at ?? null,
        confirmed_at: user.confirmed_at ?? null,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
        role: "authenticated",
        updated_at: new Date().toISOString(),
      }),
    });
  });

  await page.route(`*/**/auth/v1/token**`, async (route) => {
    if (!user) {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Unauthorized" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "fake-access-token",
        refresh_token: "fake-refresh-token",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: {
          id: user.id,
          email: user.email,
          email_confirmed_at: user.email_confirmed_at ?? null,
          confirmed_at: user.confirmed_at ?? null,
        },
      }),
    });
  });
}

const VERIFIED: MockUser = {
  id: "u-verified",
  email: "verified@example.com",
  email_confirmed_at: "2024-01-01T00:00:00Z",
  confirmed_at: "2024-01-01T00:00:00Z",
};
const UNVERIFIED: MockUser = { id: "u-unverified", email: "unverified@example.com" };

/**
 * Track any request that looks like a message-send attempt against the
 * messages tables / RPC endpoints. If gating is enforced, no such request
 * should ever fire from an unauth or unverified user.
 */
function trackSendAttempts(page: Page): Request[] {
  const attempts: Request[] = [];
  page.on("request", (req) => {
    const url = req.url();
    const method = req.method();
    const isWrite = method === "POST" || method === "PUT" || method === "PATCH";
    if (!isWrite) return;
    if (
      /\/rest\/v1\/(messages|direct_messages|dm_messages|threads|dm_threads)/i.test(url) ||
      /\/rpc\/(send_message|send_dm|create_message|create_dm)/i.test(url) ||
      /\/api\/(messages|dm|direct-messages)/i.test(url)
    ) {
      attempts.push(req);
    }
  });
  return attempts;
}

async function tryKeyboardSubmit(page: Page) {
  // Best-effort: try focusing the body and submitting via keyboard shortcut.
  const body = page.getByTestId("reply-body").or(page.getByTestId("dm-body"));
  if (await body.count()) {
    await body.first().focus().catch(() => {});
    await page.keyboard.type("attempted message body").catch(() => {});
    await page.keyboard.press("Enter").catch(() => {});
    await page.keyboard.press("Meta+Enter").catch(() => {});
    await page.keyboard.press("Control+Enter").catch(() => {});
  }
}

test.describe("DM thread send blocking", () => {
  const THREAD_PATH = "/messages/thread-123";

  test("unauthenticated: send button is unreachable and no send request fires", async ({ page }) => {
    await mockAuth(page, null);
    const attempts = trackSendAttempts(page);
    await page.goto(THREAD_PATH);
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByTestId("reply-send")).toHaveCount(0);
    await tryKeyboardSubmit(page);
    await page.waitForTimeout(300);
    expect(attempts, "unauthenticated user must not trigger any send request").toEqual([]);
  });

  test("unverified: send button is unreachable and no send request fires", async ({ page }) => {
    await mockAuth(page, UNVERIFIED);
    const attempts = trackSendAttempts(page);
    await page.goto(THREAD_PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/)
    ).toBeVisible();
    await expect(page.getByTestId("reply-send")).toHaveCount(0);
    await expect(page.getByTestId("reply-body")).toHaveCount(0);
    await tryKeyboardSubmit(page);
    await page.waitForTimeout(300);
    expect(attempts, "unverified user must not trigger any send request").toEqual([]);
  });

  test("verified: send button is reachable and clickable", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await page.goto(THREAD_PATH);
    await expect(page.getByTestId("reply-send")).toBeVisible();
    await expect(page.getByTestId("reply-send")).toBeEnabled();
    await page.getByTestId("reply-body").fill("Hello there");
    await page.getByTestId("reply-send").click();
    // Click must not throw / navigate away from the thread.
    await expect(page).toHaveURL(THREAD_PATH);
  });
});

test.describe("DM composer send blocking", () => {
  const NEW_PATH = "/messages/new";

  test("unauthenticated: send button is unreachable and no send request fires", async ({ page }) => {
    await mockAuth(page, null);
    const attempts = trackSendAttempts(page);
    await page.goto(NEW_PATH);
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByTestId("dm-send")).toHaveCount(0);
    await tryKeyboardSubmit(page);
    await page.waitForTimeout(300);
    expect(attempts, "unauthenticated user must not trigger any send request").toEqual([]);
  });

  test("unverified: send button is unreachable and no send request fires", async ({ page }) => {
    await mockAuth(page, UNVERIFIED);
    const attempts = trackSendAttempts(page);
    await page.goto(NEW_PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/)
    ).toBeVisible();
    await expect(page.getByTestId("dm-send")).toHaveCount(0);
    await expect(page.getByTestId("dm-body")).toHaveCount(0);
    await expect(page.getByTestId("dm-recipient")).toHaveCount(0);
    await tryKeyboardSubmit(page);
    await page.waitForTimeout(300);
    expect(attempts, "unverified user must not trigger any send request").toEqual([]);
  });

  test("verified: send button is reachable and clickable", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await page.goto(NEW_PATH);
    await expect(page.getByTestId("dm-send")).toBeVisible();
    await expect(page.getByTestId("dm-send")).toBeEnabled();
    await page.getByTestId("dm-recipient").fill("anotheruser");
    await page.getByTestId("dm-body").fill("Hi!");
    await page.getByTestId("dm-send").click();
    await expect(page).toHaveURL(NEW_PATH);
  });
});

test.describe("/messages index composer send blocking", () => {
  const PATH = "/messages";

  test("unauthenticated: send button is unreachable and no send request fires", async ({ page }) => {
    await mockAuth(page, null);
    const attempts = trackSendAttempts(page);
    await page.goto(PATH);
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByTestId("send-button")).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(attempts).toEqual([]);
  });

  test("unverified: send button is unreachable and no send request fires", async ({ page }) => {
    await mockAuth(page, UNVERIFIED);
    const attempts = trackSendAttempts(page);
    await page.goto(PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/)
    ).toBeVisible();
    await expect(page.getByTestId("send-button")).toHaveCount(0);
    await expect(page.getByTestId("message-body")).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(attempts).toEqual([]);
  });
});
