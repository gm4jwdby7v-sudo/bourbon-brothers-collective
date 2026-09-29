import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor wraps the built web app into a native iOS/Android shell so it
// can be submitted to the App Store / Play Store.
//
// Local build:
//   1. bun run build              # produces the SSR/SPA output
//   2. npx cap add ios            # first time only (requires macOS + Xcode)
//   3. npx cap sync ios           # copy web assets into the iOS project
//   4. npx cap open ios           # opens Xcode to archive & submit
//
// The `server.url` field is intentionally omitted so the shipped iOS
// binary bundles the built web assets and works fully offline-capable
// from the app package (App Store review requires this — no remote HTML).
const config: CapacitorConfig = {
  appId: "app.bourbonconnect.mobile",
  appName: "Bourbon Brothers",
  // Capacitor bundles the contents of `webDir` into the native app.
  // `build:ios` produces a client-only SPA in dist/client; its entry is the
  // SPA shell, copied to index.html by the build script.
  webDir: "dist/client",
  ios: {
    contentInset: "always",
    backgroundColor: "#1a1410",
  },
  android: {
    backgroundColor: "#1a1410",
  },
};

export default config;
