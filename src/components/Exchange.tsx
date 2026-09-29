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
          <div className="flex items-center gap-3 mb-3">
            <div className="text-xs uppercase tracking-[0.3em] text-primary">
              The Bourbon Exchange
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border border-primary/40 text-primary/90">
              Coming soon
            </span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl mb-6">
            Sell <span className="italic text-gradient-copper">to your friends.</span>
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed mb-8">
            The Exchange is still being built. When it launches, it will connect collectors with a
            verified network of licensed retailers who handle every transaction within the bounds
            of state and federal law. For now, take a look at what's coming.
          </p>
          <ul className="space-y-3 mb-8">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <Button
            size="lg"
            disabled
            aria-disabled="true"
            className="bg-gradient-amber text-primary-foreground opacity-70 cursor-not-allowed"
          >
            Exchange coming soon
          </Button>
        </div>

      </div>
    </section>
  );
}
