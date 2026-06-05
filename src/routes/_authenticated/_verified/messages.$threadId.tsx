import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/_verified/messages/$threadId")({
  head: () => ({ meta: [{ title: "Conversation — BourbonConnect" }] }),
  component: ThreadPage,
});

interface ThreadMessage {
  id: string;
  body: string;
  mine: boolean;
}

function ThreadPage() {
  const { threadId } = Route.useParams();
  const [messages, setMessages] = useState<ThreadMessage[]>([
    { id: "seed-1", body: "Hey, are you going to the tasting?", mine: false },
    { id: "seed-2", body: "Yes — see you there!", mine: true },
  ]);
  const [draft, setDraft] = useState("");

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}-${prev.length}`, body, mine: true },
    ]);
    setDraft("");
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6" data-testid="thread-root">
      <h1 className="font-display text-3xl">Conversation</h1>
      <p className="text-muted-foreground text-sm" data-testid="thread-id">
        Thread #{threadId}
      </p>
      <ul className="space-y-2" data-testid="thread-messages">
        {messages.map((m) => (
          <li
            key={m.id}
            data-testid="thread-message"
            data-mine={m.mine ? "true" : "false"}
            className="rounded-lg border border-border bg-card p-3"
          >
            {m.body}
          </li>
        ))}
      </ul>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="thread-reply">
        <Textarea
          data-testid="reply-body"
          placeholder="Write a reply…"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex justify-end">
          <Button
            data-testid="reply-send"
            onClick={send}
            disabled={!draft.trim()}
            className="bg-gradient-amber text-primary-foreground"
          >
            Send
          </Button>
        </div>
      </div>
    </main>
  );
}
