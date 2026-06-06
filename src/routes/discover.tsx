import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Store as StoreIcon, Globe, MapPin, Check, Plus, Users } from "lucide-react";

export const Route = createFileRoute("/discover")({
  head: () => ({
    meta: [
      { title: "Discover Distilleries & Stores — BourbonConnect" },
      {
        name: "description",
        content:
          "Follow your favorite distilleries and bourbon retailers. Get updates from the brands and stores you love.",
      },
      { property: "og:title", content: "Discover Distilleries & Stores — BourbonConnect" },
      {
        property: "og:description",
        content:
          "Follow distilleries and bourbon retailers to stay in the loop on releases and drops.",
      },
    ],
  }),
  component: DiscoverPage,
});

type PlaceKind = "distillery" | "store";

interface Place {
  id: string;
  kind: PlaceKind;
  slug: string;
  name: string;
  region: string | null;
  description: string | null;
  website: string | null;
  image_url: string | null;
}

type TabValue = "all" | "distillery" | "store" | "following";

function DiscoverPage() {
  const { user } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({});
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabValue>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: placesData, error: pErr }, { data: followsData }] = await Promise.all([
        supabase
          .from("places")
          .select("id, kind, slug, name, region, description, website, image_url")
          .order("name"),
        supabase.from("place_follows").select("place_id, user_id"),
      ]);
      if (cancelled) return;
      if (pErr) {
        toast.error("Couldn't load discover. Please refresh.");
        setLoading(false);
        return;
      }
      setPlaces((placesData ?? []) as Place[]);
      const counts: Record<string, number> = {};
      const mine = new Set<string>();
      for (const row of followsData ?? []) {
        counts[row.place_id] = (counts[row.place_id] ?? 0) + 1;
        if (user && row.user_id === user.id) mine.add(row.place_id);
      }
      setFollowerCounts(counts);
      setFollowing(mine);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places.filter((p) => {
      if (tab === "distillery" && p.kind !== "distillery") return false;
      if (tab === "store" && p.kind !== "store") return false;
      if (tab === "following" && !following.has(p.id)) return false;
      if (q && !`${p.name} ${p.region ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [places, tab, query, following]);

  async function toggleFollow(place: Place) {
    if (!user) {
      toast("Sign in to follow", {
        description: "Create an account to follow distilleries and stores.",
      });
      return;
    }
    const isFollowing = following.has(place.id);
    // optimistic
    setFollowing((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(place.id);
      else next.add(place.id);
      return next;
    });
    setFollowerCounts((prev) => ({
      ...prev,
      [place.id]: Math.max(0, (prev[place.id] ?? 0) + (isFollowing ? -1 : 1)),
    }));

    if (isFollowing) {
      const { error } = await supabase
        .from("place_follows")
        .delete()
        .eq("user_id", user.id)
        .eq("place_id", place.id);
      if (error) {
        toast.error("Couldn't unfollow. Please try again.");
        // revert
        setFollowing((prev) => new Set(prev).add(place.id));
        setFollowerCounts((prev) => ({ ...prev, [place.id]: (prev[place.id] ?? 0) + 1 }));
      }
    } else {
      const { error } = await supabase
        .from("place_follows")
        .insert({ user_id: user.id, place_id: place.id });
      if (error) {
        toast.error("Couldn't follow. Please try again.");
        setFollowing((prev) => {
          const next = new Set(prev);
          next.delete(place.id);
          return next;
        });
        setFollowerCounts((prev) => ({
          ...prev,
          [place.id]: Math.max(0, (prev[place.id] ?? 0) - 1),
        }));
      }
    }
  }

  const tabs: { value: TabValue; label: string }[] = [
    { value: "all", label: "All" },
    { value: "distillery", label: "Distilleries" },
    { value: "store", label: "Stores" },
    { value: "following", label: `Following${following.size ? ` (${following.size})` : ""}` },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">Discover</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Follow distilleries and bourbon retailers to stay close to new releases, drops, and
            store picks.
          </p>
          {!user && (
            <p className="mt-3 text-sm">
              <Link to="/auth" className="text-primary underline-offset-4 hover:underline">
                Sign in
              </Link>{" "}
              to follow places and build your feed.
            </p>
          )}
        </header>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <Button
                key={t.value}
                variant={tab === t.value ? "default" : "outline"}
                size="sm"
                onClick={() => setTab(t.value)}
                className={tab === t.value ? "bg-gradient-amber text-primary-foreground" : ""}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or region"
            className="sm:max-w-xs"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {tab === "following"
                ? "You're not following anyone yet. Browse the All tab to get started."
                : "No places match your search."}
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => {
              const isFollowing = following.has(p.id);
              const Icon = p.kind === "distillery" ? Building2 : StoreIcon;
              return (
                <li key={p.id}>
                  <Card className="h-full overflow-hidden border-border/60 bg-card/80 transition hover:border-primary/40">
                    <CardContent className="flex h-full flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-amber text-primary-foreground shadow-glow">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="font-display text-lg leading-tight">{p.name}</h3>
                            <Badge
                              variant="outline"
                              className="mt-1 border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground"
                            >
                              {p.kind}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      {p.description && (
                        <p className="line-clamp-3 text-sm text-muted-foreground">
                          {p.description}
                        </p>
                      )}
                      <div className="mt-auto space-y-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {p.region && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {p.region}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {followerCounts[p.id] ?? 0}{" "}
                            {(followerCounts[p.id] ?? 0) === 1 ? "follower" : "followers"}
                          </span>
                          {p.website && (
                            <a
                              href={p.website}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                              <Globe className="h-3.5 w-3.5" />
                              Website
                            </a>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => void toggleFollow(p)}
                          variant={isFollowing ? "outline" : "default"}
                          className={
                            isFollowing
                              ? "w-full"
                              : "w-full bg-gradient-amber text-primary-foreground hover:opacity-90"
                          }
                        >
                          {isFollowing ? (
                            <>
                              <Check className="mr-1.5 h-4 w-4" /> Following
                            </>
                          ) : (
                            <>
                              <Plus className="mr-1.5 h-4 w-4" /> Follow
                            </>
                          )}
                        </Button>
                      </div>
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
