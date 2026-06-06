import { supabase } from "@/integrations/supabase/client";

export const REVIEW_BUCKET = "review-images";

/** Get a signed URL for a stored review image path. Returns null on failure. */
export async function getReviewImageUrl(path: string, expiresInSec = 60 * 60): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(REVIEW_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Batch resolve signed URLs. Order matches input. */
export async function getReviewImageUrls(
  paths: string[],
  expiresInSec = 60 * 60,
): Promise<(string | null)[]> {
  return Promise.all(paths.map((p) => getReviewImageUrl(p, expiresInSec)));
}
