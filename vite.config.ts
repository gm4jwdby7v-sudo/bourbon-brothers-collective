// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// CAPACITOR_BUILD=1 produces a client-only SPA bundle for the Capacitor native
// shell (no SSR, no nitro server). The web deployment (Lovable) keeps building
// exactly as before — SSR + server functions — because it also serves as the
// backend API for the native app.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

export default defineConfig({
  // Skip the nitro server bundle for the native asset build; we only need the
  // static client output that Capacitor packages into the iOS/Android app.
  nitro: isCapacitorBuild ? false : undefined,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    spa: { enabled: isCapacitorBuild },
  },
});
