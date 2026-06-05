import { test, expect, Page } from "@playwright/test";

const STORAGE_KEY = "sb-rjwbskhokscwmnndpoec-auth-token";

interface MockUser {
  id: string;
  email: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}

async function mockAuth(page: Page, user: MockUser) {
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
  await page.route(`*/**/auth/v1/user`, async (route) => {
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

const THREAD_PATH = "/messages/thread-123";

test.describe("verified user sending a DM in an open thread", () => {
  test("sent message appears immediately in the thread", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await page.goto(THREAD_PATH);

    const messages = page.getByTestId("thread-message");
    await expect(messages).toHaveCount(2);

    const body = "Looking forward to it! 🥃";
    await page.getByTestId("reply-body").fill(body);

    const sendBtn = page.getByTestId("reply-send");
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    await expect(messages).toHaveCount(3);
    const last = messages.last();
    await expect(last).toBeVisible();
    await expect(last).toHaveText(body);
    await expect(last).toHaveAttribute("data-mine", "true");

    // Composer resets and disables again
    await expect(page.getByTestId("reply-body")).toHaveValue("");
    await expect(sendBtn).toBeDisabled();
    await expect(page).toHaveURL(THREAD_PATH);
  });

  test("multiple sends append in order and persist on screen", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await page.goto(THREAD_PATH);

    const messages = page.getByTestId("thread-message");
    await expect(messages).toHaveCount(2);

    const bodies = ["First reply", "Second reply", "Third reply"];
    for (const body of bodies) {
      await page.getByTestId("reply-body").fill(body);
      await page.getByTestId("reply-send").click();
    }

    await expect(messages).toHaveCount(2 + bodies.length);
    for (let i = 0; i < bodies.length; i++) {
      const msg = messages.nth(2 + i);
      await expect(msg).toHaveText(bodies[i]);
      await expect(msg).toHaveAttribute("data-mine", "true");
    }
  });

  test("empty/whitespace draft cannot be sent", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await page.goto(THREAD_PATH);

    const messages = page.getByTestId("thread-message");
    await expect(messages).toHaveCount(2);

    const sendBtn = page.getByTestId("reply-send");
    await expect(sendBtn).toBeDisabled();

    await page.getByTestId("reply-body").fill("   ");
    await expect(sendBtn).toBeDisabled();

    // Attempt to click anyway — should be a no-op
    await sendBtn.click({ force: true }).catch(() => {});
    await expect(messages).toHaveCount(2);
  });
});
