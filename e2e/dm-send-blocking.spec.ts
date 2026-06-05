import { test, expect, Request } from "@playwright/test";
import { mockAuth, mockDmThreadApi, STATIC_THREAD_ID, UNVERIFIED, VERIFIED, type DmState } from "./dm-helpers";

function trackSendAttempts(page: import("@playwright/test").Page): Request[] {
  const attempts: Request[] = [];
  page.on("request", (req) => {
    const url = req.url();
    const method = req.method();
    const isWrite = method === "POST" || method === "PUT" || method === "PATCH";
    if (!isWrite) return;
    if (/\/rest\/v1\/(dm_messages|messages|direct_messages)/i.test(url)) {
      attempts.push(req);
    }
  });
  return attempts;
}

function emptyState(): DmState {
  return {
    participants: [
      { user_id: VERIFIED.id, last_read_at: new Date(0).toISOString() },
      { user_id: "u-other", last_read_at: new Date(0).toISOString() },
    ],
    messages: [],
  };
}

test.describe("DM thread send blocking", () => {
  const THREAD_PATH = `/messages/${STATIC_THREAD_ID}`;

  test("unauthenticated: send button is unreachable and no send request fires", async ({ page }) => {
    await mockAuth(page, null);
    const attempts = trackSendAttempts(page);
    await page.goto(THREAD_PATH);
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByTestId("reply-send")).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(attempts).toEqual([]);
  });

  test("unverified: send button is unreachable and no send request fires", async ({ page }) => {
    await mockAuth(page, UNVERIFIED);
    const attempts = trackSendAttempts(page);
    await page.goto(THREAD_PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/),
    ).toBeVisible();
    await expect(page.getByTestId("reply-send")).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(attempts).toEqual([]);
  });

  test("verified: send button is reachable and clickable", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await mockDmThreadApi(page, emptyState(), STATIC_THREAD_ID);
    await page.goto(THREAD_PATH);
    await expect(page.getByTestId("reply-send")).toBeVisible();
    await expect(page.getByTestId("reply-send")).toBeDisabled();
    await page.getByTestId("reply-body").fill("Hello there");
    await expect(page.getByTestId("reply-send")).toBeEnabled();
    await page.getByTestId("reply-send").click();
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
    await page.waitForTimeout(300);
    expect(attempts).toEqual([]);
  });

  test("unverified: send button is unreachable and no send request fires", async ({ page }) => {
    await mockAuth(page, UNVERIFIED);
    const attempts = trackSendAttempts(page);
    await page.goto(NEW_PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/),
    ).toBeVisible();
    await expect(page.getByTestId("dm-send")).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(attempts).toEqual([]);
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

  test("unauthenticated: send button is unreachable", async ({ page }) => {
    await mockAuth(page, null);
    await page.goto(PATH);
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByTestId("send-button")).toHaveCount(0);
  });

  test("unverified: send button is unreachable", async ({ page }) => {
    await mockAuth(page, UNVERIFIED);
    await page.goto(PATH);
    await expect(
      page.getByText(/Confirm your email to access messaging, forums, and event checkout/),
    ).toBeVisible();
    await expect(page.getByTestId("send-button")).toHaveCount(0);
  });
});
