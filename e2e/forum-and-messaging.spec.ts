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

test.describe("messages screen gating", () => {
  const PATH = "/messages";

  test("unauthenticated user is redirected to /auth", async ({ page }) => {
    await mockAuth(page, null);
    await page.goto(PATH);
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByTestId("messages-root")).toHaveCount(0);
    await expect(page.getByTestId("messages-composer")).toHaveCount(0);
  });

  test("unverified user sees verify-email notice and cannot access composer", async ({ page }) => {
    await mockAuth(page, {
      id: "u-unverified",
      email: "unverified@example.com",
    });
    await page.goto(PATH);

    await expect(page).toHaveURL(PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/)
    ).toBeVisible();

    await expect(page.getByTestId("messages-root")).toHaveCount(0);
    await expect(page.getByTestId("messages-composer")).toHaveCount(0);
    await expect(page.getByTestId("message-body")).toHaveCount(0);
    await expect(page.getByTestId("send-button")).toHaveCount(0);
  });

  test("verified user can access full messaging UI", async ({ page }) => {
    await mockAuth(page, {
      id: "u-verified",
      email: "verified@example.com",
      email_confirmed_at: "2024-01-01T00:00:00Z",
      confirmed_at: "2024-01-01T00:00:00Z",
    });
    await page.goto(PATH);

    await expect(page).toHaveURL(PATH);
    await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
    await expect(page.getByTestId("messages-root")).toBeVisible();
    await expect(page.getByTestId("messages-composer")).toBeVisible();
    await expect(page.getByTestId("message-body")).toBeVisible();
    await expect(page.getByTestId("send-button")).toBeVisible();

    await expect(
      page.getByText(/Confirm your email to access messaging/)
    ).not.toBeVisible();
  });
});

test.describe("forum composer screen gating", () => {
  const PATH = "/forum/new";

  test("unauthenticated user is redirected to /auth", async ({ page }) => {
    await mockAuth(page, null);
    await page.goto(PATH);
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByTestId("forum-new-root")).toHaveCount(0);
    await expect(page.getByTestId("forum-composer")).toHaveCount(0);
  });

  test("unverified user sees verify-email notice and cannot access composer", async ({ page }) => {
    await mockAuth(page, {
      id: "u-unverified",
      email: "unverified@example.com",
    });
    await page.goto(PATH);

    await expect(page).toHaveURL(PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/)
    ).toBeVisible();

    await expect(page.getByTestId("forum-new-root")).toHaveCount(0);
    await expect(page.getByTestId("forum-composer")).toHaveCount(0);
    await expect(page.getByTestId("forum-title")).toHaveCount(0);
    await expect(page.getByTestId("forum-body")).toHaveCount(0);
    await expect(page.getByTestId("publish-button")).toHaveCount(0);
  });

  test("verified user can access full forum composer UI", async ({ page }) => {
    await mockAuth(page, {
      id: "u-verified",
      email: "verified@example.com",
      email_confirmed_at: "2024-01-01T00:00:00Z",
      confirmed_at: "2024-01-01T00:00:00Z",
    });
    await page.goto(PATH);

    await expect(page).toHaveURL(PATH);
    await expect(page.getByRole("heading", { name: "Start a discussion" })).toBeVisible();
    await expect(page.getByTestId("forum-new-root")).toBeVisible();
    await expect(page.getByTestId("forum-composer")).toBeVisible();
    await expect(page.getByTestId("forum-title")).toBeVisible();
    await expect(page.getByTestId("forum-body")).toBeVisible();
    await expect(page.getByTestId("publish-button")).toBeVisible();

    await expect(
      page.getByText(/Confirm your email to access messaging/)
    ).not.toBeVisible();
  });
});

test.describe("unblocking after verification", () => {
  test("messages: blocked → verify → reload → composer is accessible", async ({ page }) => {
    await mockAuth(page, {
      id: "u-pending",
      email: "pending@example.com",
    });
    await page.goto("/messages");
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/)
    ).toBeVisible();
    await expect(page.getByTestId("message-body")).toHaveCount(0);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockAuth(page, {
      id: "u-pending",
      email: "pending@example.com",
      email_confirmed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    });
    await page.reload();

    await expect(page.getByTestId("messages-composer")).toBeVisible();
    await expect(page.getByTestId("message-body")).toBeVisible();
    await expect(page.getByTestId("send-button")).toBeVisible();
  });

  test("forum: blocked → verify → reload → composer is accessible", async ({ page }) => {
    await mockAuth(page, {
      id: "u-pending",
      email: "pending@example.com",
    });
    await page.goto("/forum/new");
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/)
    ).toBeVisible();
    await expect(page.getByTestId("forum-body")).toHaveCount(0);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockAuth(page, {
      id: "u-pending",
      email: "pending@example.com",
      email_confirmed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    });
    await page.reload();

    await expect(page.getByTestId("forum-composer")).toBeVisible();
    await expect(page.getByTestId("forum-title")).toBeVisible();
    await expect(page.getByTestId("forum-body")).toBeVisible();
    await expect(page.getByTestId("publish-button")).toBeVisible();
  });
});