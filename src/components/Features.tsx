import { MessagesSquare, Search, Calendar, Store, BookMarked, ShieldCheck } from "lucide-react";

const features = [
  {
    icon: MessagesSquare,
    title: "Community & DMs",
    desc: "Forums for reviews, hunts, and distillery news. Direct message any collector.",
  },
  {
    icon: Search,
    title: "Bourbon Discovery",
    desc: "Searchable database with MSRP, releases, ratings, and tasting notes.",
  },
  {
    icon: BookMarked,
    title: "Collection tracking",
    desc: "Log your shelf, wishlist whales, and share your pour calendar.",
  },
  {
    icon: Calendar,
    title: "Events & barrel picks",
    desc: "Tastings, festivals, and exclusive distillery tours near you.",
  },
  {
    icon: Store,
    title: "Retailer marketplace",
    desc: "Licensed shops post inventory, store picks, and rare release drops.",
  },
  {
    icon: ShieldCheck,
    title: "Compliant exchange",
    desc: "Trade & sell finds through licensed retailers — state-by-state ready.",
  },
];

export function Features() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 py-24">
      <div className="max-w-2xl mb-16">
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-3">
          Everything in one decanter
        </div>
        <h2 className="font-display text-4xl md:text-5xl">
          A clubhouse, a database, and a marketplace.
        </h2>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden">
        {features.map((f) => (
          <div
            key={f.title}
            className="group relative bg-card p-8 hover:bg-secondary/40 transition-colors"
          >
            <div className="h-11 w-11 rounded-lg bg-gradient-amber/10 border border-primary/20 flex items-center justify-center mb-5 group-hover:shadow-glow transition-shadow">
              <f.icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-display text-xl mb-2">{f.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
