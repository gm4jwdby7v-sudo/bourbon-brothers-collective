import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { sendDmPush } from "@/lib/push.functions";

export const Route = createFileRoute("/_authenticated/_verified/messages/$threadId")({
  head: () => ({ meta: [{ title: "Conversation — BourbonConnect" }] }),
  component: ThreadPage,
});

interface ParticipantRow {
  user_id: string;
  last_read_at: string;
}
interface MessageRow {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}
interface ThreadData {
  participants: ParticipantRow[];
  messages: MessageRow[];
}

async function fetchThread(threadId: string): Promise<ThreadData> {
  const [participantsRes, messagesRes] = await Promise.all([
    supabase
      .from("dm_thread_participants")
      .select("user_id, last_read_at")
      .eq("thread_id", threadId),
    supabase
      .from("dm_messages")
      .select("id, sender_id, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
  ]);
  if (participantsRes.error) throw new Error(participantsRes.error.message);
  if (messagesRes.error) throw new Error(messagesRes.error.message);
  return {
    participants: participantsRes.data ?? [],
    messages: messagesRes.data ?? [],
  };
}

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { user } = useAuth();
  const viewerId = user?.id ?? "";
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["dm-thread", threadId] as const, [threadId]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => fetchThread(threadId),
    enabled: Boolean(viewerId),
  });

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const triggerPush = useServerFn(sendDmPush);


  const markRead = useCallback(async () => {
    if (!viewerId) return;
    await supabase
      .from("dm_thread_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .eq("user_id", viewerId);
  }, [threadId, viewerId]);

  // Mark thread read whenever new messages arrive.
  useEffect(() => {
    if (!data) return;
    markRead().catch(() => {});
  }, [data?.messages.length, markRead, data]);

  // Realtime subscriptions
  useEffect(() => {
    if (!viewerId) return;
    const channel = supabase
      .channel(`dm-thread-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const next = payload.new as MessageRow;
          queryClient.setQueryData<ThreadData>(queryKey, (prev) => {
            if (!prev) return prev;
            if (prev.messages.some((m) => m.id === next.id)) return prev;
            return { ...prev, messages: [...prev.messages, next] };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dm_thread_participants", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const next = payload.new as ParticipantRow;
          queryClient.setQueryData<ThreadData>(queryKey, (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.user_id === next.user_id ? { ...p, last_read_at: next.last_read_at } : p,
              ),
            };
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, queryClient, queryKey, viewerId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || !viewerId) return;
    setSending(true);
    try {
      const { data: inserted, error: insErr } = await supabase
        .from("dm_messages")
        .insert({ thread_id: threadId, sender_id: viewerId, body })
        .select("id, sender_id, body, created_at")
        .single();
      if (insErr) throw new Error(insErr.message);
      queryClient.setQueryData<ThreadData>(queryKey, (prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === inserted.id)) return prev;
        return { ...prev, messages: [...prev.messages, inserted as MessageRow] };
      });
      setDraft("");
      // Fire-and-forget background push to other participants.
      triggerPush({ data: { threadId, body } }).catch((e) =>
        console.warn("dm push failed", e),
      );
    } finally {
      setSending(false);
    }
  };

  if (isLoading || !viewerId) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-12" data-testid="thread-loading">
        Loading conversation…
      </main>
    );
  }
  if (isError || !data) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-12 text-destructive" data-testid="thread-error">
        Couldn't load this conversation. {error instanceof Error ? error.message : ""}
      </main>
    );
  }

  const recipient = data.participants.find((p) => p.user_id !== viewerId) ?? null;
  const recipientLastReadMs = recipient ? new Date(recipient.last_read_at).getTime() : 0;

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6" data-testid="thread-root">
      <h1 className="font-display text-3xl">Conversation</h1>
      <p className="text-muted-foreground text-sm" data-testid="thread-id">
        Thread #{threadId}
      </p>
      <ul className="space-y-2" data-testid="thread-messages">
        {data.messages.map((m) => {
          const mine = m.sender_id === viewerId;
          const seenByRecipient = mine && recipientLastReadMs >= new Date(m.created_at).getTime();
          const status: "sent" | "seen" = seenByRecipient ? "seen" : "sent";
          return (
            <li
              key={m.id}
              data-testid="thread-message"
              data-mine={mine ? "true" : "false"}
              data-status={mine ? status : undefined}
              className="rounded-lg border border-border bg-card p-3 flex items-end justify-between gap-3"
            >
              <span>{m.body}</span>
              {mine && (
                <span
                  className="shrink-0 text-muted-foreground"
                  data-testid="receipt-icon"
                  data-receipt={status}
                  aria-label={status === "seen" ? "Seen" : "Sent"}
                  title={status === "seen" ? "Seen" : "Sent"}
                >
                  {status === "seen" ? (
                    <CheckCheck size={16} className="text-primary" data-testid="receipt-seen" />
                  ) : (
                    <Check size={16} data-testid="receipt-sent" />
                  )}
                </span>
              )}
            </li>
          );
        })}
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
            disabled={!draft.trim() || sending}
            className="bg-gradient-amber text-primary-foreground"
          >
            Send
          </Button>
        </div>
      </div>
    </main>
  );
}
