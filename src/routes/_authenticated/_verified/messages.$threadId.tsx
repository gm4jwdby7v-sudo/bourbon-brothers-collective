import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/_verified/messages/$threadId")({
  head: () => ({ meta: [{ title: "Conversation — BourbonConnect" }] }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6" data-testid="thread-root">
      <h1 className="font-display text-3xl">Conversation</h1>
      <p className="text-muted-foreground text-sm" data-testid="thread-id">
        Thread #{threadId}
      </p>
      <ul className="space-y-2" data-testid="thread-messages">
        <li className="rounded-lg border border-border bg-card p-3">Hey, are you going to the tasting?</li>
        <li className="rounded-lg border border-border bg-card p-3">Yes — see you there!</li>
      </ul>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="thread-reply">
        <Textarea data-testid="reply-body" placeholder="Write a reply…" rows={3} />
        <div className="flex justify-end">
          <Button data-testid="reply-send" className="bg-gradient-amber text-primary-foreground">Send</Button>
        </div>
      </div>
    </main>
  );
}
