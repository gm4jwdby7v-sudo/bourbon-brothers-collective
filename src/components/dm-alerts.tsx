import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

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
 * and they are not already viewing that thread.
 */
export function DmAlerts() {
  const { user } = useAuth();
  const router = useRouter();
  const senderNameCache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!user?.id) return;
    const viewerId = user.id;

    const channel = supabase
      .channel(`dm-alerts-${viewerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages" },
        async (payload) => {
          const msg = payload.new as DmMessagePayload;
          if (!msg || msg.sender_id === viewerId) return;

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
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, router]);

  return null;
}
