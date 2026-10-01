import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { BottomTabBar } from "@/components/BottomTabBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getReviewImageUrls } from "@/lib/review-images";
import { Star, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reviews")({
  head: () => ({
    meta: [
      { title: "Bourbon Reviews — Bourbon Brothers" },
      {
        name: "description",
        content:
          "Member-written bourbon reviews with photos, ratings, and tasting notes from the Bourbon Brothers community.",
      },
      { property: "og:title", content: "Bourbon Reviews — Bourbon Brothers" },
      {
        property: "og:description",
        content: "Photos, ratings, and tasting notes from the Bourbon Brothers community.",
      },
    ],
  }),
  component: ReviewsPage,
});

interface ReviewRow {
  id: string;
  user_id: string;
  bottle_name: string;
  rating: number;
  body: string;
  image_url: string | null;
  image_moderation_status: "pending" | "approved" | "rejected" | "auto_flagged" | null;
  created_at: string;
  distillery: { name: string } | null;
  author: { display_name: string | null; username: string | null; avatar_url: string | null } | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

function ReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("bourbon_reviews")
        .select(
          "id, user_id, bottle_name, rating, body, image_url, image_moderation_status, created_at, distillery:places(name), author:profiles(display_name, username, avatar_url)",
        )
        .order("created_at", { ascending: false })
        .limit(60);
      if (cancelled) return;
      if (error) {
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as unknown as ReviewRow[];
      setReviews(rows);

      // Only show photos that passed moderation
      const paths = rows
        .filter((r) => r.image_moderation_status === "approved")
        .map((r) => r.image_url)
        .filter((p): p is string => Boolean(p));
      if (paths.length) {
        const urls = await getReviewImageUrls(paths);
        if (cancelled) return;
        const map: Record<string, string> = {};
        paths.forEach((p, i) => {
          const u = urls[i];
          if (u) map[p] = u;
        });
        setImages(map);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <BottomTabBar />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight">Reviews</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Tasting notes, ratings, and photos from members. Add your own pour to the feed.
            </p>
          </div>
          {user ? (
            <Button asChild className="bg-gradient-amber text-primary-foreground hover:opacity-90">
              <Link to="/reviews/new">
                <PlusCircle className="mr-2 h-4 w-4" /> New review
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/auth">Sign in to post</Link>
            </Button>
          )}
        </header>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading reviews…</p>
        ) : reviews.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No reviews yet. Be the first to pour and post.
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2">
            {reviews.map((r) => {
              const initial =
                (r.author?.display_name ?? r.author?.username ?? "?")[0]?.toUpperCase() ?? "?";
              const imgUrl = r.image_url ? images[r.image_url] : null;
              return (
                <li key={r.id}>
                  <Card className="h-full overflow-hidden border-border/60 bg-card/80">
                    {imgUrl && r.image_moderation_status === "approved" && (
                      <img
                        src={imgUrl}
                        alt={r.bottle_name}
                        loading="lazy"
                        className="h-56 w-full object-cover"
                      />
                    )}
                    {r.image_moderation_status === "rejected" && user?.id === r.user_id && (
                      <div className="flex h-32 w-full flex-col items-center justify-center gap-2 bg-destructive/10 text-xs text-destructive">
                        <span>Photo was rejected by moderation</span>
                        <Link
                          to="/reviews/$reviewId/appeal"
                          params={{ reviewId: r.id }}
                          className="rounded-md border border-destructive/40 px-2.5 py-1 font-medium hover:bg-destructive/20"
                        >
                          Appeal & upload new photo
                        </Link>
                      </div>
                    )}
                    {r.image_url &&
                      r.image_moderation_status !== "approved" &&
                      r.image_moderation_status !== "rejected" && (
                        <div className="flex h-32 w-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                          Photo pending moderation
                        </div>
                      )}
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center gap-3">
                        {r.author?.avatar_url ? (
                          <img
                            src={r.author.avatar_url}
                            alt=""
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-amber font-display text-sm text-primary-foreground">
                            {initial}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {r.author?.display_name ?? r.author?.username ?? "Member"}
                          </p>
                          <p className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</p>
                        </div>
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={cn(
                                "h-4 w-4",
                                n <= r.rating
                                  ? "fill-primary text-primary"
                                  : "text-muted-foreground/40",
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-lg leading-tight">{r.bottle_name}</h3>
                        {r.distillery?.name && (
                          <Badge variant="outline" className="border-border/60 text-xs">
                            {r.distillery.name}
                          </Badge>
                        )}
                      </div>
                      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                        {r.body}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
