import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { BACKEND_URL, isNativeApp } from "./lib/native";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// --- CORS for the native app -------------------------------------------------
// Server-function RPCs are same-origin by design. The iOS/Android shell runs on
// capacitor://localhost, so the backend must answer preflights and label
// responses for that origin. Scoped strictly to the native origin; web traffic
// is untouched.
const NATIVE_ORIGINS = new Set(["capacitor://localhost", "http://localhost"]);

const corsMiddleware = createMiddleware().server(async ({ next, request }) => {
  const origin = request.headers.get("origin") ?? "";
  if (!NATIVE_ORIGINS.has(origin)) {
    return next();
  }
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, accept, x-tsr-serverfn",
    "Access-Control-Max-Age": "86400",
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const result = await next();
  const response = result instanceof Response ? result : result.response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [corsMiddleware, errorMiddleware],
  serverFns: {
    // The Capacitor app bundles the SPA with no server of its own, so
    // server-function RPCs are rewritten to the deployed backend origin.
    // Web builds keep same-origin behavior (BACKEND_URL is undefined there).
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && BACKEND_URL && isNativeApp() && input.startsWith("/")) {
        input = `${BACKEND_URL}${input}`;
      }
      return fetch(input, init);
    }) as typeof fetch,
  },
}));
