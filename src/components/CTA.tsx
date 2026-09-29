import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-card via-card to-secondary p-12 md:p-20 text-center grain">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-64 w-[36rem] bg-gradient-amber rounded-full blur-[120px] opacity-30" />
        <div className="relative">
          <h2 className="font-display text-4xl md:text-6xl mb-5 leading-tight">
            Pour something <span className="italic text-gradient-copper">good</span>.<br />
            Find your people.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8">
            Free to join. 21+ only. Drink responsibly.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-gradient-amber text-primary-foreground hover:opacity-90 shadow-glow"
          >
            <Link to="/auth">Create your account</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-7xl px-6 py-12 grid md:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-7 w-7 rounded bg-gradient-amber flex items-center justify-center font-display text-primary-foreground text-sm font-bold">
              B
            </div>
            <span className="font-display text-base">Bourbon Brothers</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The nationwide community for bourbon enthusiasts, collectors, retailers, and
            distilleries.
          </p>
        </div>
        {[
          {
            h: "Community",
            l: [
              { label: "Join the community", to: "/auth", hash: undefined as string | undefined },
              { label: "Sign in", to: "/auth", hash: undefined as string | undefined },
              { label: "Messages", to: "/messages", hash: undefined as string | undefined },
              { label: "Start a discussion", to: "/forum/new", hash: undefined as string | undefined },
            ],
          },
          {
            h: "Discover",
            l: [
              { label: "Bottle database", to: "/discover", hash: undefined as string | undefined },
              { label: "Reviews", to: "/reviews", hash: undefined as string | undefined },
              { label: "Write a review", to: "/reviews/new", hash: undefined as string | undefined },
              { label: "Marketplace", to: "/marketplace", hash: undefined as string | undefined },
            ],
          },
          {
            h: "Business",
            l: [
              { label: "For Retailers", to: "/", hash: "business" as string | undefined },
              { label: "For Distilleries", to: "/", hash: "business" as string | undefined },
            ],
          },
        ].map((c) => (
          <div key={c.h}>
            <div className="text-xs uppercase tracking-widest text-primary mb-3">{c.h}</div>
            <ul className="space-y-2 text-muted-foreground">
              {c.l.map((i) => (
                <li key={i.label}>
                  <Link to={i.to} hash={i.hash} className="hover:text-foreground">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-6 flex flex-col md:flex-row gap-3 justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Bourbon Brothers. Drink responsibly. 21+ only.</span>
          <span>
            All sales facilitated through licensed retailers in accordance with state and federal
            law.
          </span>
        </div>
      </div>
    </footer>
  );
}
