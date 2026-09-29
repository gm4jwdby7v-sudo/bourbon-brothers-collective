import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
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

const NATIVE_ORIGINS = new Set(["capacitor://localhost", "http://localhost"]);

const nativeCorsMiddleware = createMiddleware().server(async ({ next, request }) => {
  const origin = request.headers.get("origin");
  if (!origin || !NATIVE_ORIGINS.has(origin)) {
    return next();
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type, accept, x-tsr-serverfn",
        "access-control-max-age": "86400",
      },
    });
  }

  const result = await next();
  result.response.headers.set("access-control-allow-origin", origin);
  return result;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, nativeCorsMiddleware],
}));
