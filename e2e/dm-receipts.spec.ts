import { test, expect } from "@playwright/test";
import { mockAuth, mockDmThreadApi, STATIC_THREAD_ID, VERIFIED, type DmState } from "./dm-helpers";

const THREAD_PATH = `/messages/${STATIC_THREAD_ID}`;

function buildState(recipientLastReadIso: string): DmState {
  return {
    participants: [
      { user_id: VERIFIED.id, last_read_at: new Date().toISOString() },
      { user_id: "u-other", last_read_at: recipientLastReadIso },
    ],
    messages: [],
  };
}

test.describe("DM read receipts", () => {
  test("a freshly sent message renders the 'sent' (single check) receipt", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    // Recipient has never read anything.
    await mockDmThreadApi(page, buildState(new Date(0).toISOString()), STATIC_THREAD_ID);
    await page.goto(THREAD_PATH);

    await page.getByTestId("reply-body").fill("Hi!");
    await page.getByTestId("reply-send").click();

    const msg = page.getByTestId("thread-message").last();
    await expect(msg).toHaveAttribute("data-mine", "true");
    await expect(msg).toHaveAttribute("data-status", "sent");
    await expect(msg.getByTestId("receipt-icon")).toHaveAttribute("data-receipt", "sent");
    await expect(msg.getByTestId("receipt-sent")).toBeVisible();
    await expect(msg.getByTestId("receipt-seen")).toHaveCount(0);
  });

  test("a message already older than the recipient's last_read renders 'seen' (double check)", async ({
    page,
  }) => {
    await mockAuth(page, VERIFIED);
    // Recipient last read in the future, so anything we send now is already 'seen' on load.
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await mockDmThreadApi(page, buildState(future), STATIC_THREAD_ID);
    await page.goto(THREAD_PATH);

    await page.getByTestId("reply-body").fill("Already read by them");
    await page.getByTestId("reply-send").click();

    const msg = page.getByTestId("thread-message").last();
    await expect(msg).toHaveAttribute("data-status", "seen");
    await expect(msg.getByTestId("receipt-icon")).toHaveAttribute("data-receipt", "seen");
    await expect(msg.getByTestId("receipt-seen")).toBeVisible();
    await expect(msg.getByTestId("receipt-sent")).toHaveCount(0);
  });

  test("'sent' flips to 'seen' when the recipient's last_read_at advances (simulated realtime)", async ({
    page,
  }) => {
    await mockAuth(page, VERIFIED);
    const state = buildState(new Date(0).toISOString());
    await mockDmThreadApi(page, state, STATIC_THREAD_ID);
    await page.goto(THREAD_PATH);

    await page.getByTestId("reply-body").fill("Did you see this?");
    await page.getByTestId("reply-send").click();

    const msg = page.getByTestId("thread-message").last();
    await expect(msg).toHaveAttribute("data-status", "sent");
    await expect(msg.getByTestId("receipt-sent")).toBeVisible();

    // Simulate realtime: recipient just read the thread. We push the same
    // update path the realtime channel would take by mutating the cached
    // TanStack Query data via a window-exposed hook? Simpler: refetch by
    // re-mounting through navigation, after bumping the mocked participant.
    state.participants = state.participants.map((p) =>
      p.user_id === "u-other" ? { ...p, last_read_at: new Date().toISOString() } : p,
    );
    // Force the UI to re-read by leaving and returning to the thread.
    await page.goto("/messages");
    await page.goto(THREAD_PATH);

    const msg2 = page.getByTestId("thread-message").last();
    await expect(msg2).toHaveAttribute("data-status", "seen");
    await expect(msg2.getByTestId("receipt-seen")).toBeVisible();
    await expect(msg2.getByTestId("receipt-sent")).toHaveCount(0);
  });

  test("messages from the other participant never render a receipt icon", async ({ page }) => {
    await mockAuth(page, VERIFIED);
    const state: DmState = {
      participants: [
        { user_id: VERIFIED.id, last_read_at: new Date(0).toISOString() },
        { user_id: "u-other", last_read_at: new Date(0).toISOString() },
      ],
      messages: [
        {
          id: "incoming-1",
          sender_id: "u-other",
          body: "Welcome to the conversation",
          created_at: new Date(Date.now() - 5000).toISOString(),
        },
      ],
    };
    await mockDmThreadApi(page, state, STATIC_THREAD_ID);
    await page.goto(THREAD_PATH);

    const incoming = page.getByTestId("thread-message").first();
    await expect(incoming).toHaveAttribute("data-mine", "false");
    await expect(incoming.getByTestId("receipt-icon")).toHaveCount(0);
  });

  test("opening the thread marks it read for the viewer (PATCH on dm_thread_participants)", async ({
    page,
  }) => {
    await mockAuth(page, VERIFIED);
    const marks: Array<{ user: string; at: string }> = [];
    const state: DmState = {
      participants: [
        { user_id: VERIFIED.id, last_read_at: new Date(0).toISOString() },
        { user_id: "u-other", last_read_at: new Date(0).toISOString() },
      ],
      messages: [
        {
          id: "incoming-1",
          sender_id: "u-other",
          body: "Hello!",
          created_at: new Date(Date.now() - 5000).toISOString(),
        },
      ],
      onMarkRead: (user, at) => marks.push({ user, at }),
    };
    await mockDmThreadApi(page, state, STATIC_THREAD_ID);
    await page.goto(THREAD_PATH);

    await expect(page.getByTestId("thread-messages")).toBeVisible();
    await expect
      .poll(() => marks.some((m) => m.user === VERIFIED.id), { timeout: 5000 })
      .toBe(true);
  });
});
