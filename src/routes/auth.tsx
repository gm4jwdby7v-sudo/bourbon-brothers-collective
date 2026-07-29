import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · BourbonConnect" },
      { name: "description", content: "Sign in or create your BourbonConnect account. 21+ only." },
    ],
  }),
  component: AuthPage,
});

function yearsAgo(d: string) {
  const dob = new Date(d);
  if (isNaN(dob.getTime())) return -1;
  const diff = Date.now() - dob.getTime();
  return diff / (365.25 * 24 * 3600 * 1000);
}

const signUpSchema = z.object({
  displayName: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  dob: z.string().refine((v) => yearsAgo(v) >= 21, "You must be 21 or older to join"),
});

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(1, "Enter your password").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);
  const [appleRetrying, setAppleRetrying] = useState(false);


  // Redirect away if already signed in AND email confirmed
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u && (u.email_confirmed_at || u.confirmed_at)) navigate({ to: "/" });
    });
  }, [navigate]);

  async function handleResend() {
    if (!pendingEmail) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setResending(false);
    if (error) toast.error(error.message);
    else toast.success("Verification email sent. Check your inbox.");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    try {
      if (mode === "signup") {
        const parsed = signUpSchema.safeParse({
          displayName: fd.get("displayName"),
          email: fd.get("email"),
          password: fd.get("password"),
          dob: fd.get("dob"),
        });
        if (!parsed.success) {
          toast.error(parsed.error.issues[0].message);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              display_name: parsed.data.displayName,
              date_of_birth: parsed.data.dob,
            },
          },
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        // With email confirmation required, no session is returned yet.
        if (!data.session) {
          setPendingEmail(parsed.data.email);
          toast.success("Check your email to confirm your account.");
          return;
        }
        navigate({ to: "/" });
      } else {
        const parsed = signInSchema.safeParse({
          email: fd.get("email"),
          password: fd.get("password"),
        });
        if (!parsed.success) {
          toast.error(parsed.error.issues[0].message);
          return;
        }
        const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) {
          toast.error(error.message);
          return;
        }
        const u = data.user;
        if (u && !u.email_confirmed_at && !u.confirmed_at) {
          setPendingEmail(parsed.data.email);
          toast.message("Please confirm your email to continue.");
          return;
        }
        navigate({ to: "/" });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    // Confirm 21+ for OAuth sign-ups too (we can't capture DOB before the redirect)
    const ok = window.confirm("Confirm you are 21 or older to continue.");
    if (!ok) return;
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setLoading(false);
      return;
    }
    if (!result.redirected) navigate({ to: "/" });
  }

  async function handleApple() {
    const ok = window.confirm("Confirm you are 21 or older to continue.");
    if (!ok) return;
    setAppleError(null);
    setAppleRetrying(true);
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        const msg = result.error.message ?? "Sign in with Apple failed";
        setAppleError(msg);
        toast.error(msg);
        return;
      }
      if (!result.redirected) navigate({ to: "/" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign in with Apple failed";
      setAppleError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setAppleRetrying(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16 relative">
      <div className="absolute top-6 left-6">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-9 w-9 rounded-md bg-gradient-amber shadow-glow flex items-center justify-center font-display text-primary-foreground font-bold">
              B
            </div>
            <span className="font-display text-xl">BourbonConnect</span>
          </div>
          <h1 className="font-display text-3xl mb-2">
            {pendingEmail
              ? "Check your inbox"
              : mode === "signin"
                ? "Welcome back"
                : "Join the community"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pendingEmail
              ? `We sent a verification link to ${pendingEmail}.`
              : mode === "signin"
                ? "Sign in to your account"
                : "Free to join · 21+ only"}
          </p>
        </div>

        {pendingEmail ? (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft space-y-4">
            <p className="text-sm text-muted-foreground">
              Click the link in the email to confirm your account. You must verify your email before
              you can post in the forums or message other members.
            </p>
            <Button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="w-full bg-gradient-amber text-primary-foreground hover:opacity-90"
            >
              {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Resend verification email
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                setPendingEmail(null);
                setMode("signin");
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            {appleError && (
              <div
                role="alert"
                className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">Sign in with Apple failed</p>
                    <p className="mt-0.5 text-xs opacity-90">{appleError}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleApple}
                    disabled={loading}
                    className="shrink-0"
                  >
                    {appleRetrying && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Retry
                  </Button>
                </div>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogle}
              disabled={loading}
            >
              <GoogleIcon /> Continue with Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full mt-2"
              onClick={handleApple}
              disabled={loading}
            >
              <AppleIcon /> Continue with Apple
            </Button>


            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or with email
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <Field name="displayName" label="Display name" placeholder="Marcus K." />
              )}
              <Field name="email" type="email" label="Email" placeholder="you@example.com" />
              <Field
                name="password"
                type="password"
                label="Password"
                placeholder={mode === "signup" ? "At least 8 characters" : ""}
              />
              {mode === "signup" && (
                <div>
                  <Field name="dob" type="date" label="Date of birth" />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    You must be 21+ to create an account.
                  </p>
                </div>
              )}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-amber text-primary-foreground hover:opacity-90"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? (
                <>
                  New here?{" "}
                  <button
                    className="text-primary hover:underline"
                    onClick={() => setMode("signup")}
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already a member?{" "}
                  <button
                    className="text-primary hover:underline"
                    onClick={() => setMode("signin")}
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <p className="mt-6 text-[11px] text-muted-foreground text-center leading-relaxed">
          By continuing you confirm you are at least 21 years old and agree to drink responsibly.
          All alcohol transactions are facilitated through licensed retailers in accordance with
          state and federal law.
        </p>
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <Label htmlFor={name} className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required
        className="mt-1.5 bg-input/40"
      />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.2s2.69-6.2 6-6.2c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.83 3.27 14.66 2.3 12 2.3 6.86 2.3 2.7 6.46 2.7 11.6s4.16 9.3 9.3 9.3c5.37 0 8.93-3.77 8.93-9.08 0-.61-.07-1.08-.15-1.62H12z"
      />
    </svg>
  );
}
