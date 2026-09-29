import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/_verified/events/$eventId/checkout")({
  head: () => ({ meta: [{ title: "RSVP — Bourbon Brothers" }] }),
  component: CheckoutPage,
});

type Step = "review" | "attendee" | "confirmation";
const ORDER: Step[] = ["review", "attendee", "confirmation"];

function CheckoutPage() {
  const { eventId } = Route.useParams();
  const [step, setStep] = useState<Step>("review");
  const [name, setName] = useState("");

  const idx = ORDER.indexOf(step);
  const next = () => setStep(ORDER[Math.min(idx + 1, ORDER.length - 1)]);
  const back = () => setStep(ORDER[Math.max(idx - 1, 0)]);

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-6" data-testid="checkout-root">
      <h1 className="font-display text-3xl">Reserve your seat</h1>
      <p className="text-muted-foreground text-sm">Event ID: {eventId}</p>

      <ol
        className="flex items-center gap-2 text-xs text-muted-foreground"
        aria-label="RSVP progress"
      >
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

      <div
        className="rounded-xl border border-border bg-card p-6 space-y-4"
        data-testid={`step-panel-${step}`}
      >
        {step === "review" && (
          <>
            <h2 className="font-display text-xl">Review</h2>
            <div className="flex justify-between text-sm">
              <span>Ticket</span>
              <span>Free RSVP</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Paid ticketing is coming soon — for now, RSVPs are free.
            </p>
            <Button
              onClick={next}
              data-testid="next-button"
              className="w-full bg-gradient-amber text-primary-foreground"
            >
              Continue
            </Button>
          </>
        )}

        {step === "attendee" && (
          <>
            <h2 className="font-display text-xl">Attendee details</h2>
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                data-testid="attendee-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={back} data-testid="back-button">
                Back
              </Button>
              <Button
                onClick={next}
                disabled={!name.trim()}
                data-testid="next-button"
                className="flex-1 bg-gradient-amber text-primary-foreground"
              >
                Confirm RSVP
              </Button>
            </div>
          </>
        )}

        {step === "confirmation" && (
          <>
            <h2 className="font-display text-xl" data-testid="confirmation-heading">
              You're going!
            </h2>
            <p className="text-sm text-muted-foreground">
              Your seat for event {eventId} is reserved{name ? `, ${name}` : ""}.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
