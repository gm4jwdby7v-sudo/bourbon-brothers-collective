import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_verified/events/$eventId/checkout")({
  head: () => ({ meta: [{ title: "Checkout — BourbonConnect" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { eventId } = Route.useParams();
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <h1 className="font-display text-3xl">Reserve your seat</h1>
      <p className="text-muted-foreground text-sm">Event ID: {eventId}</p>
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex justify-between text-sm">
          <span>Ticket</span>
          <span>$85.00</span>
        </div>
        <Button className="w-full bg-gradient-amber text-primary-foreground">Pay & confirm</Button>
      </div>
    </main>
  );
}
