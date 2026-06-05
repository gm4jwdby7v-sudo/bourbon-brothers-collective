import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/_verified/messages/")({
  head: () => ({ meta: [{ title: "Messages — BourbonConnect" }] }),
  component: MessagesPage,
});

function MessagesPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6" data-testid="messages-root">
      <h1 className="font-display text-3xl">Messages</h1>
      <p className="text-muted-foreground text-sm">Send a direct message to another member.</p>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="messages-composer">
        <Textarea data-testid="message-body" placeholder="Write a message…" rows={4} />
        <div className="flex justify-end">
          <Button data-testid="send-button" className="bg-gradient-amber text-primary-foreground">Send</Button>
        </div>
      </div>
    </main>
  );
}
