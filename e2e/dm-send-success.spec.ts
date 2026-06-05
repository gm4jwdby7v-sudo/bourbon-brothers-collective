import { test, expect } from "@playwright/test";
import { mockAuth, mockDmThreadApi, STATIC_THREAD_ID, VERIFIED, type DmState } from "./dm-helpers";

const THREAD_PATH = `/messages/${STATIC_THREAD_ID}`;

function seedState(): DmState {
  return {
    participants: [
      { user_id: VERIFIED.id, last_read_at: new Date().toISOString() },
      // Recipient hasn't read anything yet.
      { user_id: "u-other", last_read_at: new Date(0).toISOString() },
    ],
    messages: [
      { id: "seed-1", sender_id: "u-other", body: "Hey, are you going to the tasting?", created_at: new Date(Date.now() - 60000).toISOString() },
      { id: "seed-2", sender_id: VERIFIED.id, body: "Yes — see you there!", created_at: new Date(Date.now() - 30000).toISOString() },
    ],
  };
}

test.describe("verified user sending a DM in an open thread", () => {
  test("sent message appears immediately in the thread", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await mockDmThreadApi(page, seedState(), STATIC_THREAD_ID);
    await page.goto(THREAD_PATH);

    const messages = page.getByTestId("thread-message");
    await expect(messages).toHaveCount(2);

    const body = "Looking forward to it! 🥃";
    await page.getByTestId("reply-body").fill(body);
    await expect(page.getByTestId("reply-send")).toBeEnabled();
    await page.getByTestId("reply-send").click();

    await expect(messages).toHaveCount(3);
    const last = messages.last();
    await expect(last).toBeVisible();
    await expect(last).toContainText(body);
    await expect(last).toHaveAttribute("data-mine", "true");

    await expect(page.getByTestId("reply-body")).toHaveValue("");
    await expect(page.getByTestId("reply-send")).toBeDisabled();
    await expect(page).toHaveURL(THREAD_PATH);
  });

  test("multiple sends append in order", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await mockDmThreadApi(page, seedState(), STATIC_THREAD_ID);
    await page.goto(THREAD_PATH);

    const messages = page.getByTestId("thread-message");
    await expect(messages).toHaveCount(2);

    const bodies = ["First reply", "Second reply", "Third reply"];
    for (const body of bodies) {
      await page.getByTestId("reply-body").fill(body);
      await page.getByTestId("reply-send").click();
      await expect(page.getByTestId("reply-body")).toHaveValue("");
    }

    await expect(messages).toHaveCount(2 + bodies.length);
    for (let i = 0; i < bodies.length; i++) {
      const msg = messages.nth(2 + i);
      await expect(msg).toContainText(bodies[i]);
      await expect(msg).toHaveAttribute("data-mine", "true");
    }
  });

  test("empty/whitespace draft cannot be sent", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    await mockDmThreadApi(page, seedState(), STATIC_THREAD_ID);
    await page.goto(THREAD_PATH);

    const messages = page.getByTestId("thread-message");
    await expect(messages).toHaveCount(2);

    const sendBtn = page.getByTestId("reply-send");
    await expect(sendBtn).toBeDisabled();
    await page.getByTestId("reply-body").fill("   ");
    await expect(sendBtn).toBeDisabled();
    await sendBtn.click({ force: true }).catch(() => {});
    await expect(messages).toHaveCount(2);
  });
});
