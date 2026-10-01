import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMembership } from "@/hooks/use-membership";

export const Route = createFileRoute("/_authenticated/_verified/messages/new")({
  head: () => ({ meta: [{ title: "New Message — Bourbon Brothers" }] }),
  component: NewMessagePage,
});

function NewMessagePage() {
  const { user } = useAuth();
  const { isReserve, loading: membershipLoading, openPaywall } = useMembership();
  const navigate = useNavigate();
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const me = user?.id;
    const name = recipient.trim().replace(/^@/, "");
    if (!me) {
      toast.error("You must be signed in to message.");
      return;
    }
    // Messaging is a Reserve perk — free members get the paywall.
    if (!membershipLoading && !isReserve) {
      openPaywall();
      return;
    }
    if (!name) {
      toast.error("Enter a recipient username.");
      return;
    }
    if (!body.trim()) {
      toast.error("Write a message first.");
      return;
    }
    setSending(true);
    try {
      // Resolve the recipient by username (or display name).
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .or(`username.ilike.${name},display_name.ilike.${name}`)
        .limit(1)
        .maybeSingle();
      if (profErr) throw new Error(profErr.message);
      if (!profile) {
        toast.error(`Couldn't find "@${name}".`, {
          description: "Check the spelling of their username.",
        });
        return;
      }
      if (profile.id === me) {
        toast.error("You can't message yourself.");
        return;
      }

      // Reuse an existing thread between the two users if there is one.
      let threadId: string | null = null;
      const { data: myParts } = await supabase
        .from("dm_thread_participants")
        .select("thread_id")
        .eq("user_id", me);
      const myThreadIds = (myParts ?? []).map((p) => p.thread_id);
      if (myThreadIds.length > 0) {
        const { data: shared } = await supabase
          .from("dm_thread_participants")
          .select("thread_id")
          .eq("user_id", profile.id)
          .in("thread_id", myThreadIds)
          .limit(1)
          .maybeSingle();
        threadId = shared?.thread_id ?? null;
      }

      // Otherwise create the thread and add both participants.
      if (!threadId) {
        const { data: thread, error: tErr } = await supabase
          .from("dm_threads")
          .insert({})
          .select("id")
          .single();
        if (tErr) throw new Error(tErr.message);
        threadId = thread.id;
        const { error: partErr } = await supabase.from("dm_thread_participants").insert([
          { thread_id: threadId, user_id: me },
          { thread_id: threadId, user_id: profile.id },
        ]);
        if (partErr) throw new Error(partErr.message);
      }

      const { error: msgErr } = await supabase
        .from("dm_messages")
        .insert({ thread_id: threadId, sender_id: me, body: body.trim() });
      if (msgErr) throw new Error(msgErr.message);

      toast.success("Message sent");
      void navigate({ to: "/messages/$threadId", params: { threadId } });
    } catch (e) {
      toast.error("Couldn't send your message", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6" data-testid="dm-composer-root">
      <h1 className="font-display text-3xl">New direct message</h1>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="dm-composer">
        <Input
          data-testid="dm-recipient"
          placeholder="Recipient username"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <Textarea
          data-testid="dm-body"
          placeholder="Write a message…"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex justify-end">
          <Button
            data-testid="dm-send"
            className="bg-gradient-amber text-primary-foreground"
            onClick={handleSend}
            disabled={sending}
          >
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send
          </Button>
        </div>
      </div>
    </main>
  );
}
