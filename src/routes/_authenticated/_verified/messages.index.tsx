import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellOff, MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { enablePushNotifications, getPushStatus, type PushStatus } from "@/lib/push";
import { registerPushToken } from "@/lib/push.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/_verified/messages/")({
  head: () => ({ meta: [{ title: "Messages — Bourbon Brothers" }] }),
  component: MessagesPage,
});

interface ThreadSummary {
  threadId: string;
  updatedAt: string;
  otherName: string;
  preview: string;
  unread: boolean;
}

async function fetchInbox(userId: string): Promise<ThreadSummary[]> {
  const { data: parts, error: pErr } = await supabase
    .from("dm_thread_participants")
    .select("thread_id, last_read_at")
    .eq("user_id", userId);
  if (pErr) throw new Error(pErr.message);
  if (!parts || parts.length === 0) return [];

  const threadIds = parts.map((p) => p.thread_id);
  const lastRead = new Map(parts.map((p) => [p.thread_id, p.last_read_at]));

  const [{ data: threads }, { data: allParts }, { data: messages }] = await Promise.all([
    supabase
      .from("dm_threads")
      .select("id, updated_at")
      .in("id", threadIds)
      .order("updated_at", { ascending: false }),
    supabase.from("dm_thread_participants").select("thread_id, user_id").in("thread_id", threadIds),
    supabase
      .from("dm_messages")
      .select("thread_id, sender_id, body, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const otherIds = new Set<string>();
  const othersByThread = new Map<string, string[]>();
  for (const p of allParts ?? []) {
    if (p.user_id === userId) continue;
    otherIds.add(p.user_id);
    const arr = othersByThread.get(p.thread_id) ?? [];
    arr.push(p.user_id);
    othersByThread.set(p.thread_id, arr);
  }

  const names = new Map<string, string>();
  if (otherIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, username")
      .in("id", [...otherIds]);
    for (const pr of profiles ?? []) {
      names.set(pr.id, pr.display_name ?? pr.username ?? "Someone");
    }
  }

  const latestByThread = new Map<string, { body: string; created_at: string; sender_id: string }>();
  for (const m of messages ?? []) {
    if (!latestByThread.has(m.thread_id)) latestByThread.set(m.thread_id, m);
  }

  return (threads ?? []).map((t) => {
    const others = othersByThread.get(t.id) ?? [];
    const latest = latestByThread.get(t.id);
    const readAt = lastRead.get(t.id);
    return {
      threadId: t.id,
      updatedAt: t.updated_at,
      otherName:
        others.length === 0
          ? "Conversation"
          : others.map((id) => names.get(id) ?? "Someone").join(", "),
      preview: latest
        ? latest.body.length > 70
          ? `${latest.body.slice(0, 70)}…`
          : latest.body
        : "No messages yet",
      unread: Boolean(
        latest && latest.sender_id !== userId && (!readAt || latest.created_at > readAt),
      ),
    };
  });
}

function MessagesPage() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [status, setStatus] = useState<PushStatus>("default");
  const [busy, setBusy] = useState(false);
  const register = useServerFn(registerPushToken);

  useEffect(() => {
    getPushStatus().then(setStatus);
  }, []);

  const { data: threads, isLoading, isError } = useQuery({
    queryKey: ["dm-inbox", userId],
    queryFn: () => fetchInbox(userId),
    enabled: Boolean(userId),
  });

  const enable = async () => {
    setBusy(true);
    try {
      const token = await enablePushNotifications();
      const next = await getPushStatus();
      setStatus(next);
      if (!token) {
        if (next === "denied") {
          toast.error("Notifications blocked", {
            description: "Allow notifications in your browser settings.",
          });
        } else if (next === "unsupported") {
          toast.error("Push notifications aren't supported on this device.");
        } else {
          toast("Permission not granted yet.");
        }
        return;
      }
      await register({ data: { token } });
      toast.success("Push notifications enabled");
    } catch (e) {
      toast.error("Couldn't enable notifications", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6" data-testid="messages-root">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Messages</h1>
          <p className="text-muted-foreground text-sm">
            Your conversations with other members.{" "}
            <Link
              to="/settings/notifications"
              className="underline"
              data-testid="notif-settings-link"
            >
              Notification settings
            </Link>
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {status !== "unsupported" && (
            <Button
              variant="outline"
              size="sm"
              onClick={enable}
              disabled={busy || status === "granted"}
              data-testid="enable-push"
            >
              {status === "granted" ? (
                <>
                  <Bell className="mr-2" size={14} /> Notifications on
                </>
              ) : (
                <>
                  <BellOff className="mr-2" size={14} />
                  {busy ? "Enabling…" : "Enable notifications"}
                </>
              )}
            </Button>
          )}
          <Button size="sm" className="bg-gradient-amber text-primary-foreground" asChild>
            <Link to="/messages/new">
              <Plus className="mr-1.5" size={14} /> New
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading conversations…
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Couldn't load your messages. Please refresh.
        </div>
      ) : !threads || threads.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium mb-1">No conversations yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Start a direct message with another member.
          </p>
          <Button className="bg-gradient-amber text-primary-foreground" asChild>
            <Link to="/messages/new">New message</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {threads.map((t) => (
            <Link
              key={t.threadId}
              to="/messages/$threadId"
              params={{ threadId: t.threadId }}
              className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-gradient-amber flex items-center justify-center font-display text-primary-foreground shrink-0">
                {t.otherName[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${t.unread ? "font-semibold" : "font-medium"}`}>
                    {t.otherName}
                  </span>
                  {t.unread && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                </div>
                <p className="text-sm text-muted-foreground truncate">{t.preview}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(t.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
