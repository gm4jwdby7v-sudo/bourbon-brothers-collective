import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Owner-initiated resubmission: after rejection, owner uploaded a new image
 * to review-images/{user_id}/... and now wants it re-moderated.
 */
export const resubmitReviewImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reviewId: string; newImagePath: string }) => {
    if (!input?.reviewId) throw new Error("reviewId is required");
    if (!input?.newImagePath || typeof input.newImagePath !== "string") {
      throw new Error("newImagePath is required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Enforce the upload lives in the user's folder
    if (!data.newImagePath.startsWith(`${userId}/`)) {
      throw new Error("Image path must be inside your own folder");
    }
    const { data: review, error: loadErr } = await supabase
      .from("bourbon_reviews")
      .select("id, user_id, image_moderation_status, image_url")
      .eq("id", data.reviewId)
      .single();
    if (loadErr || !review) throw new Error("Review not found");
    if (review.user_id !== userId) throw new Error("Forbidden");
    if (review.image_moderation_status !== "rejected") {
      throw new Error("Only rejected photos can be resubmitted");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("bourbon_reviews")
      .update({
        image_url: data.newImagePath,
        image_moderation_status: "pending",
        image_moderation_reason: null,
        image_moderated_at: null,
        image_moderated_by: null,
      })
      .eq("id", data.reviewId);
    if (upErr) throw new Error(upErr.message);

    return { ok: true };
  });

/**
 * Run AI moderation on a freshly uploaded review image, then update the review.
 * Uses Lovable AI Gateway (Gemini Flash) for low-cost vision moderation.
 */
export const moderateReviewImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reviewId: string }) => {
    if (!input?.reviewId || typeof input.reviewId !== "string") {
      throw new Error("reviewId is required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load the review (RLS lets the owner read it)
    const { data: review, error: loadErr } = await supabase
      .from("bourbon_reviews")
      .select("id, user_id, image_url, image_moderation_status")
      .eq("id", data.reviewId)
      .single();

    if (loadErr || !review) {
      throw new Error("Review not found");
    }
    if (review.user_id !== userId) {
      throw new Error("Forbidden");
    }
    if (!review.image_url) {
      return { status: "approved" as const, reason: "No image to moderate" };
    }

    // Fetch the image from storage as base64
    const { data: blob, error: dlErr } = await supabase.storage
      .from("review-images")
      .download(review.image_url);
    if (dlErr || !blob) {
      return updateStatus(data.reviewId, "pending", "Could not load image for moderation");
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    const b64 = buf.toString("base64");
    const mime = blob.type || "image/jpeg";

    // Call Lovable AI Gateway
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) {
      return updateStatus(data.reviewId, "pending", "AI moderation unavailable");
    }

    type AiVerdict = {
      verdict: "approved" | "rejected" | "auto_flagged";
      reason: string;
    };

    let verdict: AiVerdict = { verdict: "auto_flagged", reason: "Moderation unavailable" };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content:
                "You moderate photos for a bourbon review community. Reject images with: nudity or sexual content; graphic violence or gore; hate symbols; illegal drugs other than alcohol; minors visible drinking; or images that aren't bourbon-related (no bottle, glass, label, distillery, bar, or pour visible). Approve clean bottle/pour/label/distillery photos. Reply ONLY as compact JSON: {\"verdict\":\"approved\"|\"rejected\"|\"auto_flagged\",\"reason\":\"short reason\"}. Use auto_flagged when unsure.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Moderate this bourbon review photo." },
                { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
              ],
            },
          ],
          temperature: 0,
        }),
      });

      if (res.ok) {
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
        const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(cleaned) as Partial<AiVerdict>;
        if (
          parsed.verdict === "approved" ||
          parsed.verdict === "rejected" ||
          parsed.verdict === "auto_flagged"
        ) {
          verdict = {
            verdict: parsed.verdict,
            reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 280) : "",
          };
        }
      } else if (res.status === 429) {
        verdict = { verdict: "auto_flagged", reason: "Rate limited; needs manual review" };
      } else if (res.status === 402) {
        verdict = { verdict: "auto_flagged", reason: "AI credits exhausted; needs manual review" };
      }
    } catch (err) {
      console.error("[moderation] AI call failed", err);
      verdict = { verdict: "auto_flagged", reason: "Moderation error; needs manual review" };
    }

    return updateStatus(data.reviewId, verdict.verdict, verdict.reason);

    async function updateStatus(
      reviewId: string,
      status: "approved" | "rejected" | "auto_flagged" | "pending",
      reason: string,
    ) {
      // Use service-role client so we can write moderation columns without
      // needing the user to have moderator role.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("bourbon_reviews")
        .update({
          image_moderation_status: status,
          image_moderation_reason: reason,
          image_moderated_at: new Date().toISOString(),
        })
        .eq("id", reviewId);
      return { status, reason };
    }
  });
