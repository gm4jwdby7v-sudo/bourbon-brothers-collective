import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/_verified/forum/new")({
  head: () => ({ meta: [{ title: "New post — Bourbon Brothers" }] }),
  component: NewForumPost,
});

function NewForumPost() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6" data-testid="forum-new-root">
      <h1 className="font-display text-3xl">Start a discussion</h1>
      <div
        className="rounded-xl border border-border bg-card p-4 space-y-3"
        data-testid="forum-composer"
      >
        <Input data-testid="forum-title" placeholder="Title" />
        <Textarea
          data-testid="forum-body"
          placeholder="Share your tasting notes, questions, or hunt tips…"
          rows={8}
        />
        <div className="flex justify-end">
          <Button
            data-testid="publish-button"
            className="bg-gradient-amber text-primary-foreground"
          >
            Publish
          </Button>
        </div>
      </div>
    </main>
  );
}
