import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ModerationDecision = "approved" | "rejected" | "auto_flagged" | "pending";

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

    const update: Record<string, unknown> = {
      image_moderation_status: data.decision as ModerationDecision,
      image_moderation_reason: data.reason ?? null,
      image_moderated_at: new Date().toISOString(),
      image_moderated_by: context.userId,
    };

    // On rejection, remove the file from storage too
    if (data.decision === "rejected") {
      const { data: row } = await supabaseAdmin
        .from("bourbon_reviews")
        .select("image_url")
        .eq("id", data.reviewId)
        .single();
      if (row?.image_url) {
        await supabaseAdmin.storage.from("review-images").remove([row.image_url]);
      }
      update.image_url = null;
    }

    const { error } = await supabaseAdmin
      .from("bourbon_reviews")
      .update(update)
      .eq("id", data.reviewId);
    if (error) throw new Error(error.message);
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
