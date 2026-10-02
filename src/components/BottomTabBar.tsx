import { Link, useLocation } from "@tanstack/react-router";
import { Home, Compass, Store, Star, MessageCircle } from "lucide-react";

const tabs = [
  { to: "/", label: "Home" },
  { to: "/discover", label: "Discover" },
  { to: "/marketplace", label: "Market" },
  { to: "/reviews", label: "Reviews" },
  { to: "/messages", label: "Messages" },
] as const;

const icons = {
  "/": Home,
  "/discover": Compass,
  "/marketplace": Store,
  "/reviews": Star,
  "/messages": MessageCircle,
} as const;

/**
 * Native-style bottom tab bar for phones. Each tab is its own page —
 * no more hunting through the hamburger menu.
 */
export function BottomTabBar() {
  const { pathname } = useLocation();
  // Keep the sign-in flow focused.
  if (pathname.startsWith("/auth")) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl md:hidden pb-[env(safe-area-inset-bottom,0px)]"
    >
      <div className="grid grid-cols-5">
        {tabs.map(({ to, label }) => {
          const Icon = icons[to];
          return (
            <Link
              key={to}
              to={to}
              activeOptions={to === "/" ? { exact: true } : undefined}
              activeProps={{ className: "text-primary" }}
              className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground transition-colors"
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
