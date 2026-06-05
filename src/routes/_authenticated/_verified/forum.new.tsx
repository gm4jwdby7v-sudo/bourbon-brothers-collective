import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/_verified/forum/new")({
  head: () => ({ meta: [{ title: "New post — BourbonConnect" }] }),
  component: NewForumPost,
});

function NewForumPost() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <h1 className="font-display text-3xl">Start a discussion</h1>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <Input placeholder="Title" />
        <Textarea placeholder="Share your tasting notes, questions, or hunt tips…" rows={8} />
        <div className="flex justify-end">
          <Button className="bg-gradient-amber text-primary-foreground">Publish</Button>
        </div>
      </div>
    </main>
  );
}
