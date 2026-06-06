import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  createRouter,
  createRootRoute,
  createRoute,
  createMemoryHistory,
  RouterProvider,
  Outlet,
  redirect,
} from "@tanstack/react-router";

// Mock the supabase client BEFORE importing anything that uses it.
const getUserMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
      resend: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
      signOut: vi.fn(),
    },
  },
}));

// Mock the useAuth hook so we can control verification state.
const useAuthMock = vi.fn();
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

// Mock SiteNav (it imports useAuth + Link; keep test focused on gating logic).
vi.mock("@/components/SiteNav", () => ({
  SiteNav: () => <nav data-testid="site-nav" />,
}));

import { AnyRoute } from "@tanstack/react-router";
import { Route as AuthedRoute } from "@/routes/_authenticated/route";
import { Route as VerifiedRoute } from "@/routes/_authenticated/_verified/route";
import { Route as MessagesRoute } from "@/routes/_authenticated/_verified/messages";
import { Route as ForumNewRoute } from "@/routes/_authenticated/_verified/forum.new";
import { Route as CheckoutRoute } from "@/routes/_authenticated/_verified/events.$eventId.checkout";

function buildRouter(initialPath: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const authRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/auth",
    component: () => <div data-testid="auth-page">auth</div>,
  });
  const authedLayout = createRoute({
    getParentRoute: () => rootRoute,
    id: "_authenticated",
    ssr: false,
    beforeLoad: AuthedRoute.options.beforeLoad as AnyRoute["options"]["beforeLoad"],
    component: () => <Outlet />,
  }) as AnyRoute;
  const verifiedLayout = createRoute({
    getParentRoute: () => authedLayout,
    id: "_verified",
    component: VerifiedRoute.options.component as AnyRoute["options"]["component"],
  }) as AnyRoute;
  const messages = createRoute({
    getParentRoute: () => verifiedLayout,
    path: "/messages",
    component: MessagesRoute.options.component as AnyRoute["options"]["component"],
  }) as AnyRoute;
  const forumNew = createRoute({
    getParentRoute: () => verifiedLayout,
    path: "/forum/new",
    component: ForumNewRoute.options.component as AnyRoute["options"]["component"],
  }) as AnyRoute;
  const checkout = createRoute({
    getParentRoute: () => verifiedLayout,
    path: "/events/$eventId/checkout",
    component: CheckoutRoute.options.component as AnyRoute["options"]["component"],
  }) as AnyRoute;

  const routeTree = rootRoute.addChildren([
    authRoute,
    authedLayout.addChildren([verifiedLayout.addChildren([messages, forumNew, checkout])]),
  ]);

  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    defaultPendingMs: 0,
  });
}

async function renderAt(path: string) {
  const router = buildRouter(path);
  render(<RouterProvider router={router} />);
  // Let beforeLoad + render flush.
  await new Promise((r) => setTimeout(r, 20));
  return router;
}

beforeEach(() => {
  getUserMock.mockReset();
  useAuthMock.mockReset();
});

const GATED_PATHS = [
  ["/messages", "Messages"],
  ["/forum/new", "Start a discussion"],
  ["/events/evt_123/checkout", "Reserve your seat"],
] as const;

describe("unauthenticated users", () => {
  for (const [path] of GATED_PATHS) {
    it(`redirects to /auth from ${path}`, async () => {
      getUserMock.mockResolvedValue({ data: { user: null }, error: null });
      useAuthMock.mockReturnValue({ user: null, emailVerified: false, loading: false });

      const router = await renderAt(path);
      expect(router.state.location.pathname).toBe("/auth");
      expect(screen.getByTestId("auth-page")).toBeInTheDocument();
    });
  }
});

describe("authenticated but unverified users", () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "user@example.com" } },
      error: null,
    });
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "user@example.com" },
      emailVerified: false,
      loading: false,
    });
  });

  for (const [path, pageHeading] of GATED_PATHS) {
    it(`blocks ${path} with verify-email notice`, async () => {
      await renderAt(path);
      expect(
        screen.getByText(/Confirm your email to access messaging, forums, and event checkout\./i),
      ).toBeInTheDocument();
      expect(screen.queryByText(pageHeading)).not.toBeInTheDocument();
    });
  }
});

describe("verified users", () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "user@example.com", email_confirmed_at: "2024-01-01" } },
      error: null,
    });
    useAuthMock.mockReturnValue({
      user: { id: "u1", email: "user@example.com" },
      emailVerified: true,
      loading: false,
    });
  });

  for (const [path, pageHeading] of GATED_PATHS) {
    it(`renders ${path}`, async () => {
      await renderAt(path);
      expect(screen.getByText(pageHeading)).toBeInTheDocument();
      expect(
        screen.queryByText(/Confirm your email to access messaging/i),
      ).not.toBeInTheDocument();
    });
  }
});

// Sanity: redirect() throws — ensure the beforeLoad import wiring is intact.
it("redirect helper is wired", () => {
  expect(typeof redirect).toBe("function");
});
