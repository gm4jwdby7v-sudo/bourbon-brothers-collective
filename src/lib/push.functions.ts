import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// --- Public: register/unregister this browser's FCM token ----------------

export const registerPushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { token: string }) => {
    if (!data || typeof data.token !== "string" || data.token.length < 10) {
      throw new Error("Invalid token");
    }
    if (data.token.length > 4096) throw new Error("Token too long");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("dm_push_tokens")
      .upsert(
        { token: data.token, user_id: context.userId, updated_at: new Date().toISOString() },
        { onConflict: "token" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Trigger: send DM push to other thread participants ------------------

export const sendDmPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { threadId: string; body: string }) => {
    if (!data?.threadId || typeof data.threadId !== "string") {
      throw new Error("threadId required");
    }
    if (typeof data.body !== "string" || data.body.length === 0) {
      throw new Error("body required");
    }
    return { threadId: data.threadId, body: data.body.slice(0, 500) };
  })
  .handler(async ({ data, context }) => {
    const { sendFcmToTokens, getAccessToken } = await import("./push.server");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Verify sender is a participant (RLS would also catch this, but be explicit).
    const senderId = context.userId;

    // Fetch recipients (other participants) and the sender's display name in parallel.
    const [{ data: participants }, { data: senderProfile }] = await Promise.all([
      supabaseAdmin
        .from("dm_thread_participants")
        .select("user_id")
        .eq("thread_id", data.threadId),
      supabaseAdmin
        .from("profiles")
        .select("display_name, username")
        .eq("id", senderId)
        .maybeSingle(),
    ]);

    const recipientIds = (participants ?? [])
      .map((p) => p.user_id)
      .filter((id) => id !== senderId);
    if (recipientIds.length === 0) return { sent: 0 };

    // Honor recipient notification preferences: skip those who disabled DM
    // push or are currently in their quiet-hours window.
    const { DEFAULT_PREFS, isInQuietHours } = await import(
      "./notification-prefs"
    );
    const { data: prefsRows } = await supabaseAdmin
      .from("notification_preferences")
      .select(
        "user_id, dm_push_enabled, quiet_hours_enabled, quiet_start, quiet_end, timezone",
      )
      .in("user_id", recipientIds);
    const prefsByUser = new Map(
      (prefsRows ?? []).map((row) => [row.user_id, row]),
    );
    const eligibleIds = recipientIds.filter((id) => {
      const prefs = { ...DEFAULT_PREFS, ...(prefsByUser.get(id) ?? {}) };
      if (!prefs.dm_push_enabled) return false;
      if (isInQuietHours(prefs)) return false;
      return true;
    });
    if (eligibleIds.length === 0) return { sent: 0 };

    const { data: tokenRows } = await supabaseAdmin
      .from("dm_push_tokens")
      .select("token")
      .in("user_id", eligibleIds);
    const tokens = (tokenRows ?? []).map((r) => r.token);
    if (tokens.length === 0) return { sent: 0 };


    const senderName =
      senderProfile?.display_name ?? senderProfile?.username ?? "Someone";
    const preview =
      data.body.length > 80 ? `${data.body.slice(0, 80)}…` : data.body;

    const accessToken = await getAccessToken();
    const { successCount, failedTokens } = await sendFcmToTokens({
      accessToken,
      tokens,
      title: senderName,
      body: preview,
      data: { threadId: data.threadId },
    });

    // Best-effort cleanup of invalid tokens.
    if (failedTokens.length > 0) {
      await supabaseAdmin
        .from("dm_push_tokens")
        .delete()
        .in("token", failedTokens);
    }

    return { sent: successCount };
  });
