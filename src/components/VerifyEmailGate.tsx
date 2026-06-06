import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MailWarning, Loader2 } from "lucide-react";

/**
 * Wrap any interactive surface (forum composer, DM input, comment box) with this
 * component to require a verified email before the user can post or message.
 * Signed-out users see the children as-is — sign-in gating happens elsewhere.
 */
export function VerifyEmailGate({
  children,
  message = "Verify your email to post or message other members.",
}: {
  children: React.ReactNode;
  message?: string;
}) {
  const { user, emailVerified, loading } = useAuth();
  if (loading) return <>{children}</>;
  if (!user || emailVerified) return <>{children}</>;
  return (
    <div className="relative">
      <div className="pointer-events-none opacity-40 select-none" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <VerifyEmailNotice email={user.email ?? null} compact message={message} />
      </div>
    </div>
  );
}

export function VerifyEmailBanner() {
  const { user, emailVerified, loading } = useAuth();
  if (loading || !user || emailVerified) return null;
  return (
    <div className="border-b border-amber-500/20 bg-amber-500/10">
      <div className="max-w-7xl mx-auto px-6 py-3">
        <VerifyEmailNotice email={user.email ?? null} />
      </div>
    </div>
  );
}

export function VerifyEmailRequired({ email }: { email: string | null }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-card p-6 shadow-soft">
      <VerifyEmailNotice
        email={email}
        message="Confirm your email to access messaging, forums, and event checkout."
      />
    </div>
  );
}

function VerifyEmailNotice({
  email,
  compact = false,
  message,
}: {
  email: string | null;
  compact?: boolean;
  message?: string;
}) {
  const [sending, setSending] = useState(false);

  async function resend() {
    if (!email) return;
    setSending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setSending(false);
    if (error) toast.error(error.message);
    else toast.success("Verification email sent. Check your inbox.");
  }

  return (
    <div
      className={
        compact
          ? "rounded-lg border border-amber-500/30 bg-card/95 backdrop-blur p-4 shadow-soft max-w-sm text-center"
          : "flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4"
      }
    >
      <div className="flex items-start gap-3 flex-1">
        <MailWarning className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-medium text-foreground">
            {message ?? "Confirm your email to unlock the community"}
          </div>
          <div className="text-muted-foreground text-xs mt-0.5">
            {email ? (
              <>
                We sent a link to <span className="text-foreground">{email}</span>.
              </>
            ) : null}
          </div>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={resend}
        disabled={sending || !email}
        className="shrink-0"
      >
        {sending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
        Resend email
      </Button>
    </div>
  );
}
