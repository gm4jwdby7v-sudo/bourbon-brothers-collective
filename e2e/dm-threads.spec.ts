import { test, expect } from "@playwright/test";
import { mockAuth, mockDmThreadApi, STATIC_THREAD_ID, UNVERIFIED, VERIFIED, type DmState } from "./dm-helpers";

const THREAD_PATH = `/messages/${STATIC_THREAD_ID}`;
const NEW_PATH = "/messages/new";

const threadTestIds = ["thread-root", "thread-messages", "thread-reply", "reply-body", "reply-send"];
const dmTestIds = ["dm-composer-root", "dm-composer", "dm-recipient", "dm-body", "dm-send"];

function emptyState(): DmState {
  return {
    participants: [
      { user_id: VERIFIED.id, last_read_at: new Date(0).toISOString() },
      { user_id: "u-other", last_read_at: new Date(0).toISOString() },
    ],
    messages: [],
  };
}

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
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/),
    ).toBeVisible();
    for (const id of threadTestIds) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });

  test("verified user can view the existing thread", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await mockDmThreadApi(page, emptyState(), STATIC_THREAD_ID);
    await page.goto(THREAD_PATH);
    await expect(page).toHaveURL(THREAD_PATH);
    await expect(page.getByRole("heading", { name: "Conversation" })).toBeVisible();
    await expect(page.getByTestId("thread-id")).toHaveText(/thread-123/);
    // thread-messages is an empty <ul> in this scenario, so check existence not visibility.
    await expect(page.getByTestId("thread-messages")).toHaveCount(1);
    for (const id of threadTestIds.filter((t) => t !== "thread-messages")) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(
      page.getByText(/Confirm your email to access messaging/),
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
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/),
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
      page.getByText(/Confirm your email to access messaging/),
    ).not.toBeVisible();
  });
});

test.describe("DM unblocking after verification", () => {
  test("thread: blocked → verify → reload → thread visible", async ({ page }) => {
    await mockAuth(page, { id: "u-pending", email: "pending@example.com" });
    await page.goto(THREAD_PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/),
    ).toBeVisible();
    await expect(page.getByTestId("thread-root")).toHaveCount(0);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockAuth(page, {
      id: "u-pending",
      email: "pending@example.com",
      email_confirmed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    });
    await mockDmThreadApi(
      page,
      {
        participants: [
          { user_id: "u-pending", last_read_at: new Date(0).toISOString() },
          { user_id: "u-other", last_read_at: new Date(0).toISOString() },
        ],
        messages: [],
      },
      STATIC_THREAD_ID,
    );
    await page.reload();

    await expect(page.getByTestId("thread-root")).toBeVisible();
    await expect(page.getByTestId("thread-messages")).toHaveCount(1);
    await expect(page.getByTestId("reply-send")).toBeVisible();
  });

  test("dm composer: blocked → verify → reload → composer visible", async ({ page }) => {
    await mockAuth(page, { id: "u-pending", email: "pending@example.com" });
    await page.goto(NEW_PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/),
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
