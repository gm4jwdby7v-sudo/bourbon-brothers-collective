import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFAULT_PREFS,
  isInQuietHours,
  type NotificationPrefs,
} from "@/lib/notification-prefs";

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

    // Live-update prefs when the user changes them in settings.
    const prefsChannel = supabase
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
        senderName =
          profile?.display_name ?? profile?.username ?? "Someone";
        senderNameCache.current.set(msg.sender_id, senderName);
      }

      const preview =
        msg.body.length > 80 ? `${msg.body.slice(0, 80)}…` : msg.body;

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

    const channel = supabase
      .channel(`dm-alerts-${viewerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages" },
        (payload) => {
          void handleIncoming(payload.new as DmMessagePayload);
        },
      )
      .subscribe();

    // Test-only bridge: lets E2E tests simulate a realtime DM insert by
    // dispatching a `dm-alerts:test-inject` CustomEvent with the payload.
    const onTestInject = (e: Event) => {
      const detail = (e as CustomEvent<DmMessagePayload>).detail;
      if (detail) void handleIncoming(detail);
    };
    // Test-only bridge: simulate the realtime prefs-update callback so E2E
    // tests can verify live suppression without a websocket connection.
    const onTestUpdatePrefs = (e: Event) => {
      const detail = (e as CustomEvent<Partial<NotificationPrefs>>).detail;
      if (detail) prefsRef.current = { ...DEFAULT_PREFS, ...detail };
    };
    window.addEventListener("dm-alerts:test-inject", onTestInject);
    window.addEventListener("dm-alerts:test-update-prefs", onTestUpdatePrefs);

    return () => {
      window.removeEventListener("dm-alerts:test-inject", onTestInject);
      window.removeEventListener(
        "dm-alerts:test-update-prefs",
        onTestUpdatePrefs,
      );
      supabase.removeChannel(channel);
      supabase.removeChannel(prefsChannel);
    };
  }, [user?.id, router]);

  return null;
}
