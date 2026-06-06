import { Page, Route } from "@playwright/test";

export const STORAGE_KEY = "sb-rjwbskhokscwmnndpoec-auth-token";

export interface MockUser {
  id: string;
  email: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}

export const VERIFIED: MockUser = {
  id: "u-verified",
  email: "verified@example.com",
  email_confirmed_at: "2024-01-01T00:00:00Z",
  confirmed_at: "2024-01-01T00:00:00Z",
};

export const UNVERIFIED: MockUser = {
  id: "u-unverified",
  email: "unverified@example.com",
};

export async function mockAuth(page: Page, user: MockUser | null) {
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

// ============= DM REST mock =============

export interface DmMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  thread_id?: string;
}
export interface DmParticipant {
  user_id: string;
  last_read_at: string;
  thread_id?: string;
}
export interface DmState {
  messages: DmMessage[];
  participants: DmParticipant[];
  onInsert?: (msg: DmMessage) => void;
  onMarkRead?: (userId: string, at: string) => void;
}

/**
 * Mocks Supabase REST endpoints used by the DM thread page.
 * Mutates `state` so tests can read what's been sent or seen.
 */
export function mockDmThreadApi(page: Page, state: DmState, threadId: string) {
  const handle = async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname; // e.g. /rest/v1/dm_messages
    const method = req.method();

    const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*", ...headers },
        body: JSON.stringify(body),
      });

    if (method === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
      return;
    }

    if (path.endsWith("/rest/v1/dm_messages")) {
      if (method === "GET") return json(200, state.messages);
      if (method === "POST") {
        const body = JSON.parse(req.postData() ?? "{}");
        const rows = Array.isArray(body) ? body : [body];
        const inserted = rows.map((r, i) => ({
          id: r.id ?? `mock-${Date.now()}-${i}`,
          sender_id: r.sender_id,
          body: r.body,
          created_at: new Date().toISOString(),
          thread_id: r.thread_id,
        })) as DmMessage[];
        state.messages.push(...inserted);
        for (const m of inserted) state.onInsert?.(m);
        const wantsSingle = req.headers()["accept"]?.includes("application/vnd.pgrst.object+json");
        return json(201, wantsSingle ? inserted[0] : inserted);
      }
    }

    if (path.endsWith("/rest/v1/dm_thread_participants")) {
      if (method === "GET") return json(200, state.participants);
      if (method === "PATCH") {
        const body = JSON.parse(req.postData() ?? "{}");
        const userIdFilter = url.searchParams.get("user_id");
        const eqUser = userIdFilter?.startsWith("eq.") ? userIdFilter.slice(3) : null;
        if (eqUser) {
          const part = state.participants.find((p) => p.user_id === eqUser);
          if (part && typeof body.last_read_at === "string") {
            part.last_read_at = body.last_read_at;
            state.onMarkRead?.(eqUser, body.last_read_at);
          }
        }
        return json(204, "");
      }
    }

    await route.continue();
  };

  return Promise.all([
    page.route(`**/rest/v1/dm_messages*`, handle),
    page.route(`**/rest/v1/dm_thread_participants*`, handle),
  ]);
}

export const STATIC_THREAD_ID = "thread-123";
