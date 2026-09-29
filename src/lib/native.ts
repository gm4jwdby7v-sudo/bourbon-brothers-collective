// Helpers for running inside the Capacitor native shell (iOS / Android).
//
// The native app bundles the built SPA and has no server of its own, so any
// request that needs the backend (server-function RPCs, API routes) must go
// to the deployed web backend as an absolute URL.

/** True when running inside the Capacitor native app rather than a browser. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  try {
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/**
 * Absolute URL of the deployed web backend (e.g. https://my-app.lovable.app).
 * Baked in at build time via the VITE_BACKEND_URL env var when producing the
 * native bundle (`bun run build:ios`). Undefined for normal web builds.
 */
export const BACKEND_URL: string | undefined =
  (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, "") ||
  undefined;

/**
 * Resolve an app path to an absolute backend URL when running natively,
 * otherwise return the path unchanged (same-origin for web).
 */
export function backendUrl(path: string): string {
  if (BACKEND_URL && isNativeApp() && path.startsWith("/")) {
    return `${BACKEND_URL}${path}`;
  }
  return path;
}
