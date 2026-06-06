import rickhouse from "@/assets/rickhouse.jpg";
import { Button } from "@/components/ui/button";

const tiers = [
  {
    name: "Retailer",
    price: "$149",
    period: "/mo",
    perks: ["Storefront listing", "Inventory drops", "Lead notifications", "Basic analytics"],
  },
  {
    name: "Distillery",
    price: "$499",
    period: "/mo",
    perks: ["Brand hub", "Sponsored releases", "Event promotion", "Audience insights"],
    featured: true,
  },
  {
    name: "Event Host",
    price: "$79",
    period: "/event",
    perks: ["Featured listing", "RSVP management", "Cross-promotion", "Post-event recap"],
  },
];

export function Business() {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={rickhouse}
          alt=""
          className="h-full w-full object-cover opacity-20"
          loading="lazy"
          width={1200}
          height={800}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />
      </div>
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-3">For business</div>
          <h2 className="font-display text-4xl md:text-5xl mb-4">
            Reach the most engaged drinkers in America.
          </h2>
          <p className="text-muted-foreground">
            Retailers, distilleries, and event organizers — meet your community.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-2xl border p-8 ${t.featured ? "border-primary/60 bg-card shadow-glow" : "border-border bg-card/60 backdrop-blur"}`}
            >
              {t.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.2em] bg-gradient-amber text-primary-foreground px-3 py-1 rounded-full">
                  Most popular
                </div>
              )}
              <div className="text-sm text-muted-foreground mb-2">{t.name}</div>
              <div className="font-display text-4xl mb-1">
                {t.price}
                <span className="text-base text-muted-foreground font-sans">{t.period}</span>
              </div>
              <div className="h-px bg-border my-6" />
              <ul className="space-y-2.5 text-sm text-muted-foreground mb-6">
                {t.perks.map((p) => (
                  <li key={p} className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-primary" /> {p}
                  </li>
                ))}
              </ul>
              <Button
                className={
                  t.featured ? "w-full bg-gradient-amber text-primary-foreground" : "w-full"
                }
                variant={t.featured ? "default" : "outline"}
              >
                Get started
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
