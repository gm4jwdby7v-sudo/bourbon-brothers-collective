import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { useAuth } from "@/hooks/use-auth";
import { VerifyEmailRequired } from "@/components/VerifyEmailGate";

export const Route = createFileRoute("/_authenticated/_verified")({
  ssr: false,
  component: VerifiedLayout,
});

function VerifiedLayout() {
  const { user, emailVerified, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen">
        <SiteNav />
        <div className="max-w-7xl mx-auto px-6 py-16 text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (user && !emailVerified) {
    return (
      <div className="min-h-screen">
        <SiteNav />
        <div className="max-w-xl mx-auto px-6 py-16">
          <VerifyEmailRequired email={user.email ?? null} />
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen">
      <SiteNav />
      <Outlet />
    </div>
  );
}
