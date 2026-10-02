import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  getModeratorStatus,
  listPendingReviewImages,
  setReviewModeration,
} from "@/lib/moderation-admin.functions";
import { Check, X, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_verified/admin/moderation")({
  head: () => ({ meta: [{ title: "Moderation queue — Bourbon Brothers" }] }),
  beforeLoad: async () => {
    try {
      const { isModerator } = await getModeratorStatus();
      if (!isModerator) throw redirect({ to: "/" });
    } catch {
      throw redirect({ to: "/" });
    }
  },
  component: ModerationPage,
});

interface PendingItem {
  id: string;
  bottle_name: string;
  body: string;
  rating: number;
  created_at: string;
  image_moderation_status: "pending" | "auto_flagged";
  image_moderation_reason: string | null;
  signed_image_url: string | null;
  author: { display_name: string | null; username: string | null } | null;
}

function ModerationPage() {
  const listFn = useServerFn(listPendingReviewImages);
  const decideFn = useServerFn(setReviewModeration);
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    try {
      const res = await listFn();
      setItems((res.items ?? []) as unknown as PendingItem[]);
    } catch {
      toast.error("Couldn't load the moderation queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusy(id);
    try {
      await decideFn({ data: { reviewId: id, decision, reason: reasons[id] } });
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success(decision === "approved" ? "Approved." : "Rejected and photo removed.");
    } catch {
      toast.error("Action failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <div>
              <h1 className="font-display text-3xl tracking-tight">Moderation queue</h1>
              <p className="text-sm text-muted-foreground">
                Review photos awaiting approval before they appear on the public feed.
              </p>
            </div>
          </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/reviews">View public feed</Link>
            </Button>
        </header>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading queue…</p>
        ) : items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nothing to review. Inbox zero — nice work.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-5">
            {items.map((it) => (
              <li key={it.id}>
                <Card className="overflow-hidden border-border/60">
                  <div className="grid gap-4 md:grid-cols-[280px_1fr]">
                    <div className="bg-muted/20">
                      {it.signed_image_url ? (
                        <img
                          src={it.signed_image_url}
                          alt={it.bottle_name}
                          className="h-full max-h-72 w-full object-cover md:max-h-none"
                        />
                      ) : (
                        <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
                          Image unavailable
                        </div>
                      )}
                    </div>
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            it.image_moderation_status === "auto_flagged"
                              ? "destructive"
                              : "outline"
                          }
                          className="text-[10px] uppercase tracking-wider"
                        >
                          {it.image_moderation_status.replace("_", " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          by{" "}
                          {it.author?.display_name ?? it.author?.username ?? "member"} ·{" "}
                          {new Date(it.created_at).toLocaleString()}
                        </span>
                      </div>
                      <h3 className="font-display text-xl leading-tight">{it.bottle_name}</h3>
                      <p className="whitespace-pre-line text-sm text-foreground/90">{it.body}</p>
                      {it.image_moderation_reason && (
                        <p className="text-xs text-amber-300/80">
                          AI note: {it.image_moderation_reason}
                        </p>
                      )}
                      <Textarea
                        placeholder="Reason (optional, recorded with decision)"
                        rows={2}
                        value={reasons[it.id] ?? ""}
                        onChange={(e) =>
                          setReasons((prev) => ({ ...prev, [it.id]: e.target.value }))
                        }
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={busy === it.id}
                          onClick={() => void decide(it.id, "approved")}
                          className="bg-gradient-amber text-primary-foreground hover:opacity-90"
                        >
                          {busy === it.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="mr-1.5 h-4 w-4" /> Approve
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy === it.id}
                          onClick={() => void decide(it.id, "rejected")}
                        >
                          <X className="mr-1.5 h-4 w-4" /> Reject & remove
                        </Button>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
