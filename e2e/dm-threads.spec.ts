import { test, expect, Page } from "@playwright/test";

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

const THREAD_PATH = "/messages/thread-123";
const NEW_PATH = "/messages/new";

const threadTestIds = ["thread-root", "thread-messages", "thread-reply", "reply-body", "reply-send"];
const dmTestIds = ["dm-composer-root", "dm-composer", "dm-recipient", "dm-body", "dm-send"];

test.describe("existing DM thread gating", () => {
  test("unauthenticated user is redirected to /auth", async ({ page }) => {
    await mockAuth(page, null);
    await page.goto(THREAD_PATH);
    await expect(page).toHaveURL(/\/auth/);
    for (const id of threadTestIds) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });

  test("unverified user sees verify-email notice and cannot view thread", async ({ page }) => {
    await mockAuth(page, UNVERIFIED);
    await page.goto(THREAD_PATH);
    await expect(page).toHaveURL(THREAD_PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/)
    ).toBeVisible();
    for (const id of threadTestIds) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });

  test("verified user can view the existing thread", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await page.goto(THREAD_PATH);
    await expect(page).toHaveURL(THREAD_PATH);
    await expect(page.getByRole("heading", { name: "Conversation" })).toBeVisible();
    await expect(page.getByTestId("thread-id")).toHaveText(/thread-123/);
    for (const id of threadTestIds) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(
      page.getByText(/Confirm your email to access messaging/)
    ).not.toBeVisible();
  });
});

test.describe("DM composer gating", () => {
  test("unauthenticated user is redirected to /auth", async ({ page }) => {
    await mockAuth(page, null);
    await page.goto(NEW_PATH);
    await expect(page).toHaveURL(/\/auth/);
    for (const id of dmTestIds) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });

  test("unverified user sees verify-email notice and cannot open composer", async ({ page }) => {
    await mockAuth(page, UNVERIFIED);
    await page.goto(NEW_PATH);
    await expect(page).toHaveURL(NEW_PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/)
    ).toBeVisible();
    for (const id of dmTestIds) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });

  test("verified user can open the DM composer", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await page.goto(NEW_PATH);
    await expect(page).toHaveURL(NEW_PATH);
    await expect(page.getByRole("heading", { name: "New direct message" })).toBeVisible();
    for (const id of dmTestIds) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(
      page.getByText(/Confirm your email to access messaging/)
    ).not.toBeVisible();
  });
});

test.describe("DM unblocking after verification", () => {
  test("thread: blocked → verify → reload → thread visible", async ({ page }) => {
    await mockAuth(page, { id: "u-pending", email: "pending@example.com" });
    await page.goto(THREAD_PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/)
    ).toBeVisible();
    await expect(page.getByTestId("thread-root")).toHaveCount(0);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockAuth(page, {
      id: "u-pending",
      email: "pending@example.com",
      email_confirmed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    });
    await page.reload();

    await expect(page.getByTestId("thread-root")).toBeVisible();
    await expect(page.getByTestId("thread-messages")).toBeVisible();
    await expect(page.getByTestId("reply-send")).toBeVisible();
  });

  test("dm composer: blocked → verify → reload → composer visible", async ({ page }) => {
    await mockAuth(page, { id: "u-pending", email: "pending@example.com" });
    await page.goto(NEW_PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/)
    ).toBeVisible();
    await expect(page.getByTestId("dm-composer")).toHaveCount(0);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockAuth(page, {
      id: "u-pending",
      email: "pending@example.com",
      email_confirmed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    });
    await page.reload();

    await expect(page.getByTestId("dm-composer")).toBeVisible();
    await expect(page.getByTestId("dm-recipient")).toBeVisible();
    await expect(page.getByTestId("dm-send")).toBeVisible();
  });
});
