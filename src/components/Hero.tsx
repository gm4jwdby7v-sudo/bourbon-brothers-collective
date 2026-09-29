import { Button } from "@/components/ui/button";
import { ArrowRight, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import hero from "@/assets/hero-bourbon.jpg";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={hero}
          alt=""
          className="h-full w-full object-cover opacity-40"
          width={1600}
          height={1200}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-32 md:pt-32 md:pb-44 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-3 py-1 text-xs text-muted-foreground mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Now pouring · 12,400 enthusiasts online
          </div>
          <h1 className="font-display text-5xl md:text-7xl leading-[1.05] tracking-tight">
            The nation's <span className="text-gradient-copper italic">bourbon</span>
            <br />
            community, distilled.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
            Connect with collectors, hunt rare releases, log your pours, and trade with licensed
            retailers — all in one beautifully crafted home for bourbon lovers.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="bg-gradient-amber text-primary-foreground hover:opacity-90 shadow-glow"
            >
              <Link to="/auth">
                Join the community <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-border/80"
              onClick={() =>
                document.getElementById("business")?.scrollIntoView({ behavior: "smooth" })
              }
            >
              <Users className="mr-2 h-4 w-4" /> For retailers & distilleries
            </Button>
          </div>
          <div className="mt-10 flex items-center gap-8 text-sm text-muted-foreground">
            <Stat n="48K+" l="Members" />
            <div className="h-8 w-px bg-border" />
            <Stat n="9,200" l="Bottles logged" />
            <div className="h-8 w-px bg-border" />
            <Stat n="320" l="Retailers" />
          </div>
        </div>

        <div className="hidden md:block relative">
          <div className="relative rounded-3xl border border-border bg-card/60 backdrop-blur-xl p-6 shadow-soft">
            <div className="text-xs uppercase tracking-widest text-primary mb-4">Today's pour</div>
            <div className="font-display text-3xl mb-1">Weller 12 Year</div>
            <div className="text-sm text-muted-foreground mb-5">Wheated · 90 proof · MSRP $45</div>
            <div className="flex items-center gap-2 mb-4">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i < 4 ? "bg-gradient-amber" : "bg-muted"}`}
                />
              ))}
              <span className="text-sm font-medium ml-2">4.7</span>
            </div>
            <p className="text-sm text-muted-foreground italic leading-relaxed">
              "Caramel and honeyed oak, a long finish with a whisper of cherry pipe tobacco."
            </p>
            <div className="mt-5 pt-5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>1,284 tasting notes</span>
              <span className="text-primary">Hunt this bottle →</span>
            </div>
          </div>
          <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-2xl bg-gradient-amber blur-2xl opacity-40" />
        </div>
      </div>
    </section>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="font-display text-2xl text-foreground">{n}</div>
      <div className="text-xs uppercase tracking-wider">{l}</div>
    </div>
  );
}
