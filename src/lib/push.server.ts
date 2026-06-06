// Server-only Firebase Cloud Messaging (HTTP v1) helpers.
// Mints an OAuth2 access token from the service account JSON using RS256,
// caches it in module memory until just before expiry, then posts to
// https://fcm.googleapis.com/v1/projects/{projectId}/messages:send.

import { SignJWT, importPKCS8 } from "jose";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

let cached: { token: string; expiresAt: number; projectId: string } | null = null;

function getServiceAccount(): ServiceAccount {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FCM_SERVICE_ACCOUNT_JSON not configured");
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON is missing required fields");
  }
  // Some pasted JSON keeps literal \n in the private key.
  parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}

export async function getAccessToken(): Promise<{
  token: string;
  projectId: string;
}> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - 60 > now) {
    return { token: cached.token, projectId: cached.projectId };
  }

  const sa = getServiceAccount();
  const key = await importPKCS8(sa.private_key, "RS256");

  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(sa.token_uri || "https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FCM oauth failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cached = {
    token: json.access_token,
    expiresAt: now + json.expires_in,
    projectId: sa.project_id,
  };
  return { token: json.access_token, projectId: sa.project_id };
}

export async function sendFcmToTokens(opts: {
  accessToken: { token: string; projectId: string };
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<{ successCount: number; failedTokens: string[] }> {
  const url = `https://fcm.googleapis.com/v1/projects/${opts.accessToken.projectId}/messages:send`;
  let successCount = 0;
  const failedTokens: string[] = [];

  // FCM v1 sends one token per request; fan out in parallel.
  await Promise.all(
    opts.tokens.map(async (token) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${opts.accessToken.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: opts.title, body: opts.body },
              data: opts.data,
              webpush: opts.data?.threadId
                ? { fcm_options: { link: `/messages/${opts.data.threadId}` } }
                : undefined,
            },
          }),
        });
        if (res.ok) {
          successCount++;
          return;
        }
        const text = await res.text().catch(() => "");
        // 404 UNREGISTERED / 400 INVALID_ARGUMENT for stale tokens.
        if (
          res.status === 404 ||
          res.status === 400 ||
          /UNREGISTERED|INVALID_ARGUMENT|registration-token-not-registered/i.test(text)
        ) {
          failedTokens.push(token);
        }
        console.warn("[fcm] send failed", res.status, text.slice(0, 200));
      } catch (e) {
        console.warn("[fcm] send error", e);
      }
    }),
  );

  return { successCount, failedTokens };
}
