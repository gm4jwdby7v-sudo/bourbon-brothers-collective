import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/_verified/messages/new")({
  head: () => ({ meta: [{ title: "New Message — Bourbon Brothers" }] }),
  component: NewMessagePage,
});

function NewMessagePage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6" data-testid="dm-composer-root">
      <h1 className="font-display text-3xl">New direct message</h1>
      <div
        className="rounded-xl border border-border bg-card p-4 space-y-3"
        data-testid="dm-composer"
      >
        <Input data-testid="dm-recipient" placeholder="Recipient username" />
        <Textarea data-testid="dm-body" placeholder="Write a message…" rows={4} />
        <div className="flex justify-end">
          <Button data-testid="dm-send" className="bg-gradient-amber text-primary-foreground">
            Send
          </Button>
        </div>
      </div>
    </main>
  );
}
