import bottles from "@/assets/bottles.jpg";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

const points = [
  "List rare finds visible to verified licensed retailers",
  "State-by-state shipping eligibility built in",
  "All transactions facilitated through licensed channels",
  "Transparent offers, escrow, and chain-of-custody tracking",
];

export function Exchange() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 py-24">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div className="relative order-2 lg:order-1">
          <div className="absolute -inset-6 bg-gradient-amber opacity-20 blur-3xl rounded-3xl" />
          <img
            src={bottles}
            alt="Bourbon bottles flat lay"
            className="relative rounded-2xl border border-border shadow-soft w-full"
            loading="lazy"
            width={1200}
            height={800}
          />
        </div>
        <div className="order-1 lg:order-2">
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-3">
            The Bourbon Exchange
          </div>
          <h2 className="font-display text-4xl md:text-5xl mb-6">
            Sell your finds. <span className="italic text-gradient-copper">Legally.</span>
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed mb-8">
            Built with compliance at its core. The Exchange connects collectors with a verified
            network of licensed retailers who handle every transaction within the bounds of state
            and federal law.
          </p>
          <ul className="space-y-3 mb-8">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <Button size="lg" className="bg-gradient-amber text-primary-foreground hover:opacity-90">
            Explore the Exchange
          </Button>
        </div>
      </div>
    </section>
  );
}
