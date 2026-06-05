import { test, expect, Page } from "@playwright/test";

interface MockUser {
  id: string;
  email: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}

/**
 * Mock the Supabase auth client directly in the browser page.
 * This is more reliable than intercepting network requests because it
 * bypasses localStorage key format issues and ensures the app's hooks
 * see the desired auth state immediately.
 */
async function mockAuth(page: Page, user: MockUser | null) {
  await page.addInitScript((mockUser) => {
    // Store the mock user on window so our later override can access it
    (window as any).__mockAuthUser = mockUser;

    // Override supabase.auth methods after the client initializes
    const applyMock = () => {
      const supabase = (window as any).supabase;
      if (!supabase) {
        // Supabase not yet initialized, try again shortly
        setTimeout(applyMock, 50);
        return;
      }

      supabase.auth.getUser = async () => {
        const u = (window as any).__mockAuthUser;
        if (!u) return { data: { user: null }, error: new Error("Unauthorized") };
        return {
          data: {
            user: {
              id: u.id,
              email: u.email,
              email_confirmed_at: u.email_confirmed_at ?? null,
              confirmed_at: u.confirmed_at ?? null,
              app_metadata: {},
              user_metadata: {},
              aud: "authenticated",
              created_at: new Date().toISOString(),
              role: "authenticated",
              updated_at: new Date().toISOString(),
            },
          },
          error: null,
        };
      };

      supabase.auth.getSession = async () => {
        const u = (window as any).__mockAuthUser;
        if (!u) return { data: { session: null }, error: null };
        return {
          data: {
            session: {
              access_token: "fake-access-token",
              refresh_token: "fake-refresh-token",
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              token_type: "bearer",
              user: {
                id: u.id,
                email: u.email,
                email_confirmed_at: u.email_confirmed_at ?? null,
                confirmed_at: u.confirmed_at ?? null,
              },
            },
          },
          error: null,
        };
      };
    };

    // Start trying to apply the mock
    applyMock();
  }, user);
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
      await page.waitForTimeout(500); // let React re-render after mock applies

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
      await page.waitForTimeout(500); // let React re-render after mock applies

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
