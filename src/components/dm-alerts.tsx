import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_PREFS, isInQuietHours, type NotificationPrefs } from "@/lib/notification-prefs";

interface DmMessagePayload {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

/**
 * Global subscriber that listens for new direct messages and shows an in-app
 * sonner toast (sender name + preview) when the recipient is the current user
 * and they are not already viewing that thread. Respects user notification
 * preferences (in-app toggle + quiet hours).
 */
export function DmAlerts() {
  const { user } = useAuth();
  const router = useRouter();
  const senderNameCache = useRef<Map<string, string>>(new Map());
  const prefsRef = useRef<NotificationPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (!user?.id) return;
    const viewerId = user.id;

    // Load current notification preferences once on mount / sign-in.
    supabase
      .from("notification_preferences")
      .select(
        "dm_push_enabled, dm_inapp_enabled, quiet_hours_enabled, quiet_start, quiet_end, timezone",
      )
      .eq("user_id", viewerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) prefsRef.current = { ...DEFAULT_PREFS, ...data };
      });

    const handleIncoming = async (msg: DmMessagePayload) => {
      if (!msg || msg.sender_id === viewerId) return;

      // Respect user preferences.
      const prefs = prefsRef.current;
      if (!prefs.dm_inapp_enabled) return;
      if (isInQuietHours(prefs)) return;

      // Skip if user is currently viewing the thread.
      const currentPath = router.state.location.pathname;
      if (currentPath === `/messages/${msg.thread_id}`) return;

      // Resolve sender display name (cached).
      let senderName = senderNameCache.current.get(msg.sender_id);
      if (!senderName) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, username")
          .eq("id", msg.sender_id)
          .maybeSingle();
        senderName = profile?.display_name ?? profile?.username ?? "Someone";
        senderNameCache.current.set(msg.sender_id, senderName);
      }

      const preview = msg.body.length > 80 ? `${msg.body.slice(0, 80)}…` : msg.body;

      toast(senderName, {
        description: preview,
        action: {
          label: "Open",
          onClick: () =>
            router.navigate({
              to: "/messages/$threadId",
              params: { threadId: msg.thread_id },
            }),
        },
      });
    };

    // Realtime subscriptions. Channel names are deduped by topic: a leftover
    // channel from a previous mount (its async removal may still be in
    // flight) is handed back by channel() already-subscribed, and adding
    // callbacks to it throws — which crashes the whole app shell, since this
    // component lives in the root layout. Clear any stragglers before
    // subscribing, and never let a realtime hiccup take the app down.
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let prefsChannel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;
    (async () => {
      try {
        const topics = [
          `realtime:notification-prefs-${viewerId}`,
          `realtime:dm-alerts-${viewerId}`,
        ];
        await Promise.all(
          supabase
            .getChannels()
            .filter((c) => topics.includes(c.topic))
            .map((c) => supabase.removeChannel(c)),
        );
        if (cancelled) return;

        // Live-update prefs when the user changes them in settings.
        prefsChannel = supabase
          .channel(`notification-prefs-${viewerId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notification_preferences",
              filter: `user_id=eq.${viewerId}`,
            },
            (payload) => {
              if (payload.new) {
                prefsRef.current = {
                  ...DEFAULT_PREFS,
                  ...(payload.new as Partial<NotificationPrefs>),
                };
              }
            },
          )
          .subscribe();

        channel = supabase
          .channel(`dm-alerts-${viewerId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "dm_messages" },
            (payload) => {
              void handleIncoming(payload.new as DmMessagePayload);
            },
          )
          .subscribe();
      } catch (e) {
        console.warn("[dm-alerts] realtime setup skipped:", e);
      }
    })();

    // Test-only bridge: lets E2E tests simulate a realtime DM insert by
    // dispatching a `dm-alerts:test-inject` CustomEvent with the payload.
    const onTestInject = (e: Event) => {
      const detail = (e as CustomEvent<DmMessagePayload>).detail;
      if (detail) void handleIncoming(detail);
    };
    // Test-only bridge (dev builds only): simulate the realtime prefs-update
    // callback so E2E tests can verify live suppression without a websocket.
    const onTestUpdatePrefs = (e: Event) => {
      const detail = (e as CustomEvent<Partial<NotificationPrefs>>).detail;
      if (detail) prefsRef.current = { ...DEFAULT_PREFS, ...detail };
    };
    if (import.meta.env.DEV) {
      window.addEventListener("dm-alerts:test-inject", onTestInject);
      window.addEventListener("dm-alerts:test-update-prefs", onTestUpdatePrefs);
    }

    return () => {
      cancelled = true;
      if (import.meta.env.DEV) {
        window.removeEventListener("dm-alerts:test-inject", onTestInject);
        window.removeEventListener("dm-alerts:test-update-prefs", onTestUpdatePrefs);
      }
      if (channel) void supabase.removeChannel(channel);
      if (prefsChannel) void supabase.removeChannel(prefsChannel);
    };
  }, [user?.id, router]);

  return null;
}
