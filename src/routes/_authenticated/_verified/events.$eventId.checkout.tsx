import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/_verified/events/$eventId/checkout")({
  head: () => ({ meta: [{ title: "Checkout — BourbonConnect" }] }),
  component: CheckoutPage,
});

type Step = "review" | "attendee" | "payment" | "confirmation";
const ORDER: Step[] = ["review", "attendee", "payment", "confirmation"];

function CheckoutPage() {
  const { eventId } = Route.useParams();
  const [step, setStep] = useState<Step>("review");
  const [name, setName] = useState("");
  const [card, setCard] = useState("");

  const idx = ORDER.indexOf(step);
  const next = () => setStep(ORDER[Math.min(idx + 1, ORDER.length - 1)]);
  const back = () => setStep(ORDER[Math.max(idx - 1, 0)]);

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-6" data-testid="checkout-root">
      <h1 className="font-display text-3xl">Reserve your seat</h1>
      <p className="text-muted-foreground text-sm">Event ID: {eventId}</p>

      <ol className="flex items-center gap-2 text-xs text-muted-foreground" aria-label="Checkout progress">
        {ORDER.map((s, i) => (
          <li
            key={s}
            data-testid={`step-indicator-${s}`}
            data-active={s === step}
            className={i === idx ? "text-foreground font-medium" : ""}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4" data-testid={`step-panel-${step}`}>
        {step === "review" && (
          <>
            <h2 className="font-display text-xl">Review your order</h2>
            <div className="flex justify-between text-sm">
              <span>Ticket</span>
              <span>$85.00</span>
            </div>
            <Button onClick={next} data-testid="next-button" className="w-full bg-gradient-amber text-primary-foreground">
              Continue to attendee
            </Button>
          </>
        )}

        {step === "attendee" && (
          <>
            <h2 className="font-display text-xl">Attendee details</h2>
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" data-testid="attendee-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={back} data-testid="back-button">Back</Button>
              <Button
                onClick={next}
                disabled={!name.trim()}
                data-testid="next-button"
                className="flex-1 bg-gradient-amber text-primary-foreground"
              >
                Continue to payment
              </Button>
            </div>
          </>
        )}

        {step === "payment" && (
          <>
            <h2 className="font-display text-xl">Payment</h2>
            <div className="space-y-2">
              <Label htmlFor="card">Card number</Label>
              <Input id="card" data-testid="card-number" value={card} onChange={(e) => setCard(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={back} data-testid="back-button">Back</Button>
              <Button
                onClick={next}
                disabled={card.replace(/\s/g, "").length < 12}
                data-testid="pay-button"
                className="flex-1 bg-gradient-amber text-primary-foreground"
              >
                Pay & confirm
              </Button>
            </div>
          </>
        )}

        {step === "confirmation" && (
          <>
            <h2 className="font-display text-xl" data-testid="confirmation-heading">You're going!</h2>
            <p className="text-sm text-muted-foreground">
              Your seat for event {eventId} is confirmed{name ? `, ${name}` : ""}.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
