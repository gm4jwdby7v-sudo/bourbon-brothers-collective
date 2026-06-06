import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";



async function requireModerator(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "moderator"]);
  if (error) throw new Error("Could not verify role");
  if (!data?.length) throw new Error("Forbidden: moderator role required");
}

/** List reviews that need moderator review (pending or auto_flagged). */
export const listPendingReviewImages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireModerator(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("bourbon_reviews")
      .select(
        "id, user_id, bottle_name, body, rating, image_url, image_moderation_status, image_moderation_reason, created_at, author:profiles(display_name, username)",
      )
      .not("image_url", "is", null)
      .in("image_moderation_status", ["pending", "auto_flagged"])
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);

    // Sign URLs for the moderator UI
    const items = await Promise.all(
      (data ?? []).map(async (r) => {
        let signedUrl: string | null = null;
        if (r.image_url) {
          const { data: signed } = await supabaseAdmin.storage
            .from("review-images")
            .createSignedUrl(r.image_url, 60 * 30);
          signedUrl = signed?.signedUrl ?? null;
        }
        return { ...r, signed_image_url: signedUrl };
      }),
    );
    return { items };
  });

/** Moderator action: approve or reject a review's image. */
export const setReviewModeration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reviewId: string; decision: "approved" | "rejected"; reason?: string }) => {
    if (!input?.reviewId) throw new Error("reviewId required");
    if (input.decision !== "approved" && input.decision !== "rejected") {
      throw new Error("Invalid decision");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireModerator(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch review for owner + email and to detect appeal context
    const { data: row } = await supabaseAdmin
      .from("bourbon_reviews")
      .select("id, user_id, bottle_name, image_url, image_moderation_status")
      .eq("id", data.reviewId)
      .single();
    if (!row) throw new Error("Review not found");
    const wasAppeal = row.image_moderation_status === "pending"; // resubmit resets to pending
    const ownerId = row.user_id;

    if (data.decision === "rejected") {
      if (row.image_url) {
        await supabaseAdmin.storage.from("review-images").remove([row.image_url]);
      }
      const { error } = await supabaseAdmin
        .from("bourbon_reviews")
        .update({
          image_url: null,
          image_moderation_status: "rejected",
          image_moderation_reason: data.reason ?? null,
          image_moderated_at: new Date().toISOString(),
          image_moderated_by: context.userId,
        })
        .eq("id", data.reviewId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("bourbon_reviews")
        .update({
          image_moderation_status: "approved",
          image_moderation_reason: data.reason ?? null,
          image_moderated_at: new Date().toISOString(),
          image_moderated_by: context.userId,
        })
        .eq("id", data.reviewId);
      if (error) throw new Error(error.message);
    }

    // Notify the owner (in-app + best-effort email)
    const approved = data.decision === "approved";
    const title = approved
      ? wasAppeal
        ? "Your appealed photo was approved"
        : "Your review photo was approved"
      : wasAppeal
        ? "Your appealed photo was rejected"
        : "Your review photo was rejected";
    const body = approved
      ? `Your photo for "${row.bottle_name}" is now live on the public feed.`
      : `Your photo for "${row.bottle_name}" was removed${data.reason ? `: ${data.reason}` : "."} You can upload a new one.`;
    const link = approved ? "/reviews" : `/reviews/${row.id}/appeal`;

    await supabaseAdmin.from("notifications").insert({
      user_id: ownerId,
      type: approved ? "review_image_approved" : "review_image_rejected",
      title,
      body,
      link,
    });

    // Best-effort email via Lovable Emails if configured
    try {
      const { data: userResp } = await supabaseAdmin.auth.admin.getUserById(ownerId);
      const email = userResp?.user?.email;
      if (email) {
        const { getRequestHost } = await import("@tanstack/react-start/server");
        let origin = "";
        try {
          origin = `https://${getRequestHost()}`;
        } catch {
          origin = process.env.SITE_URL ?? "";
        }
        await fetch(`${origin}/lovable/email/transactional/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
          },
          body: JSON.stringify({
            templateName: "review-moderation-decision",
            recipientEmail: email,
            idempotencyKey: `review-mod-${row.id}-${Date.now()}`,
            templateData: {
              bottleName: row.bottle_name,
              approved,
              wasAppeal,
              reason: data.reason ?? null,
              link: origin ? `${origin}${link}` : link,
            },
          }),
        }).catch(() => {});
      }
    } catch {
      /* email is best effort; in-app already fired */
    }

    return { ok: true };
  });

/** Check if the current user has moderator (or admin) privileges. */
export const getModeratorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "moderator"]);
    return { isModerator: (data?.length ?? 0) > 0 };
  });
