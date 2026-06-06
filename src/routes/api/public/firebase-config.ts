import { createFileRoute } from "@tanstack/react-router";

// Returns the public Firebase web config so the browser SDK and the
// firebase-messaging service worker can initialize. All values here are
// publishable (apiKey, projectId, messagingSenderId, appId, vapidKey).
export const Route = createFileRoute("/api/public/firebase-config")({
  server: {
    handlers: {
      GET: async () => {
        const raw = process.env.FIREBASE_WEB_CONFIG;
        if (!raw) {
          return new Response(JSON.stringify({ error: "FIREBASE_WEB_CONFIG not set" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        try {
          const parsed = JSON.parse(raw);
          return new Response(JSON.stringify(parsed), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "cache-control": "public, max-age=300",
              "access-control-allow-origin": "*",
            },
          });
        } catch {
          return new Response(JSON.stringify({ error: "FIREBASE_WEB_CONFIG is not valid JSON" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
