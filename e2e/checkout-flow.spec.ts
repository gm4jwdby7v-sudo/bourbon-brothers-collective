import { test, expect, Page } from "@playwright/test";

const STORAGE_KEY = "sb-rjwbskhokscwmnndpoec-auth-token";
const EVENT_PATH = "/events/evt_999/checkout";

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
      { session, key: STORAGE_KEY },
    );
  } else {
    await page.addInitScript(
      ({ key }: { key: string }) => {
        localStorage.removeItem(key);
      },
      { key: STORAGE_KEY },
    );
  }

  await page.route(`*/**/auth/v1/user`, async (route) => {
    if (!user) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Unauthorized" }),
      });
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
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Unauthorized" }),
      });
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

test.describe("event checkout flow — verified user", () => {
  test("walks through review → attendee → payment → confirmation", async ({ page }) => {
    await mockAuth(page, {
      id: "u-verified",
      email: "verified@example.com",
      email_confirmed_at: "2024-01-01T00:00:00Z",
      confirmed_at: "2024-01-01T00:00:00Z",
    });
    await page.goto(EVENT_PATH);

    // Step 1: Review
    await expect(page.getByRole("heading", { name: "Reserve your seat" })).toBeVisible();
    await expect(page.getByTestId("step-panel-review")).toBeVisible();
    await expect(page.getByTestId("step-indicator-review")).toHaveAttribute("data-active", "true");
    await page.getByTestId("next-button").click();

    // Step 2: Attendee
    await expect(page.getByTestId("step-panel-attendee")).toBeVisible();
    await expect(page.getByTestId("step-indicator-attendee")).toHaveAttribute(
      "data-active",
      "true",
    );

    // Cannot advance without name
    await expect(page.getByTestId("next-button")).toBeDisabled();
    await page.getByTestId("attendee-name").fill("Ada Lovelace");
    await expect(page.getByTestId("next-button")).toBeEnabled();
    await page.getByTestId("next-button").click();

    // Step 3: Payment
    await expect(page.getByTestId("step-panel-payment")).toBeVisible();
    await expect(page.getByTestId("pay-button")).toBeDisabled();
    await page.getByTestId("card-number").fill("4242424242424242");
    await expect(page.getByTestId("pay-button")).toBeEnabled();
    await page.getByTestId("pay-button").click();

    // Step 4: Confirmation
    await expect(page.getByTestId("confirmation-heading")).toBeVisible();
    await expect(
      page.getByText(/Your seat for event evt_999 is confirmed, Ada Lovelace/),
    ).toBeVisible();
  });

  test("back button returns to previous step", async ({ page }) => {
    await mockAuth(page, {
      id: "u-verified",
      email: "verified@example.com",
      email_confirmed_at: "2024-01-01T00:00:00Z",
      confirmed_at: "2024-01-01T00:00:00Z",
    });
    await page.goto(EVENT_PATH);
    await page.getByTestId("next-button").click();
    await expect(page.getByTestId("step-panel-attendee")).toBeVisible();
    await page.getByTestId("back-button").click();
    await expect(page.getByTestId("step-panel-review")).toBeVisible();
  });
});

test.describe("event checkout flow — unverified user is blocked", () => {
  test("cannot reach any checkout step until email is verified", async ({ page }) => {
    await mockAuth(page, {
      id: "u-unverified",
      email: "unverified@example.com",
    });
    await page.goto(EVENT_PATH);

    await expect(page).toHaveURL(EVENT_PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/),
    ).toBeVisible();

    // No checkout step UI rendered
    await expect(page.getByTestId("checkout-root")).toHaveCount(0);
    await expect(page.getByTestId("step-panel-review")).toHaveCount(0);
    await expect(page.getByTestId("next-button")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Reserve your seat" })).toHaveCount(0);
  });

  test("unauthenticated visitor is redirected to /auth", async ({ page }) => {
    await mockAuth(page, null);
    await page.goto(EVENT_PATH);
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByTestId("checkout-root")).toHaveCount(0);
  });
});

test.describe("verification gate unblocks checkout after email confirms", () => {
  test("blocked → verify → reload → can complete checkout", async ({ page }) => {
    // Start unverified
    await mockAuth(page, {
      id: "u-pending",
      email: "pending@example.com",
    });
    await page.goto(EVENT_PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/),
    ).toBeVisible();
    await expect(page.getByTestId("next-button")).toHaveCount(0);

    // Simulate verification: re-mock as confirmed and reload
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockAuth(page, {
      id: "u-pending",
      email: "pending@example.com",
      email_confirmed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    });
    await page.reload();

    await expect(page.getByTestId("step-panel-review")).toBeVisible();
    await page.getByTestId("next-button").click();
    await page.getByTestId("attendee-name").fill("Grace Hopper");
    await page.getByTestId("next-button").click();
    await page.getByTestId("card-number").fill("4242424242424242");
    await page.getByTestId("pay-button").click();
    await expect(page.getByTestId("confirmation-heading")).toBeVisible();
  });
});
