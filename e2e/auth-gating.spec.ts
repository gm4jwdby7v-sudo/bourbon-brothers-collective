import { test, expect, Page } from "@playwright/test";

const SUPABASE_URL = "https://rjwbskhokscwmnndpoec.supabase.co";

interface MockUser {
  id: string;
  email: string;
  email_confirmed_at?: string;
  confirmed_at?: string;
}

/**
 * Set up mock auth state by intercepting Supabase auth API calls.
 * We inject a fake session into localStorage and intercept /auth/v1/user
 * so the app's beforeLoad + useAuth hooks see the desired state.
 */
async function mockAuth(page: Page, user: MockUser | null) {
  // Build a fake session to inject into localStorage
  if (user) {
    const fakeSession = {
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
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
        role: "authenticated",
        updated_at: new Date().toISOString(),
      },
    };

    await page.addInitScript((session) => {
      localStorage.setItem(
        `sb-${SUPABASE_URL.replace("https://", "").replace(".", "-")}-auth-token`,
        JSON.stringify(session)
      );
    }, fakeSession);
  }

  // Intercept getUser() API call
  await page.route(`*/**/auth/v1/user`, async (route) => {
    if (user) {
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
    } else {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Unauthorized" }),
      });
    }
  });

  // Intercept token refresh
  await page.route(`*/**/auth/v1/token**`, async (route) => {
    if (user) {
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
    } else {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Unauthorized" }),
      });
    }
  });
}

const GATED_PATHS = [
  { path: "/messages", heading: "Messages" },
  { path: "/forum/new", heading: "Start a discussion" },
  { path: "/events/evt_123/checkout", heading: "Reserve your seat" },
] as const;

test.describe("unauthenticated users", () => {
  for (const { path } of GATED_PATHS) {
    test(`redirects to /auth from ${path}`, async ({ page }) => {
      await mockAuth(page, null);
      await page.goto(path);

      // Wait for redirect to auth page
      await expect(page).toHaveURL(/\/auth/);

      // Auth page content is visible
      await expect(
        page.getByRole("heading", { name: /Welcome back|Join the community/ })
      ).toBeVisible();
    });
  }
});

test.describe("authenticated but unverified users", () => {
  for (const { path, heading } of GATED_PATHS) {
    test(`blocks ${path} with verify-email notice`, async ({ page }) => {
      await mockAuth(page, {
        id: "u1-unverified",
        email: "unverified@example.com",
        // No email_confirmed_at or confirmed_at
      });
      await page.goto(path);

      // Should stay on the requested path but show verify email notice
      await expect(page).toHaveURL(path);

      // Verify email notice is shown
      await expect(
        page.getByText(/Confirm your email to access messaging, forums, and event checkout/)
      ).toBeVisible();

      // Page-specific heading should NOT be visible
      await expect(
        page.getByRole("heading", { name: heading })
      ).not.toBeVisible();
    });
  }
});

test.describe("verified users", () => {
  for (const { path, heading } of GATED_PATHS) {
    test(`renders ${path}`, async ({ page }) => {
      await mockAuth(page, {
        id: "u1-verified",
        email: "verified@example.com",
        email_confirmed_at: "2024-01-01T00:00:00Z",
        confirmed_at: "2024-01-01T00:00:00Z",
      });
      await page.goto(path);

      // Should stay on the requested path
      await expect(page).toHaveURL(path);

      // Page-specific heading IS visible
      await expect(
        page.getByRole("heading", { name: heading })
      ).toBeVisible();

      // Verify email notice should NOT be present
      await expect(
        page.getByText(/Confirm your email to access messaging/)
      ).not.toBeVisible();
    });
  }
});
