import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { REVIEW_BUCKET } from "@/lib/review-images";
import { toast } from "sonner";
import { ImagePlus, Loader2, X, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_verified/reviews/$reviewId/appeal")({
  head: () => ({ meta: [{ title: "Appeal photo — Bourbon Brothers" }] }),
  component: AppealPage,
});

interface ReviewRow {
  id: string;
  user_id: string;
  bottle_name: string;
  body: string;
  image_moderation_status: "pending" | "approved" | "rejected" | "auto_flagged" | null;
  image_moderation_reason: string | null;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function AppealPage() {
  const { reviewId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [review, setReview] = useState<ReviewRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("bourbon_reviews")
      .select("id, user_id, bottle_name, body, image_moderation_status, image_moderation_reason")
      .eq("id", reviewId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setReview((data as ReviewRow) ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be 8 MB or smaller.");
      return;
    }
    setFile(f);
  }

  function clearFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !review || !file) return;
    setSubmitting(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(REVIEW_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (upErr) {
        toast.error("Upload failed. Please try again.");
        return;
      }

      const { resubmitReviewImage, moderateReviewImage } = await import(
        "@/lib/moderation.functions"
      );
      try {
        await resubmitReviewImage({ data: { reviewId: review.id, newImagePath: path } });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not resubmit.");
        // best-effort cleanup
        await supabase.storage.from(REVIEW_BUCKET).remove([path]).catch(() => {});
        return;
      }
      void moderateReviewImage({ data: { reviewId: review.id } }).catch(() => {});
      toast.success("Photo resubmitted. It's back in moderation.");
      void navigate({ to: "/reviews" });
    } finally {
      setSubmitting(false);
    }
  }

  const ownsReview = review && user && review.user_id === user.id;
  const canAppeal = review?.image_moderation_status === "rejected";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-2xl px-6 py-10">
        <header className="mb-6 flex items-center gap-3">
          <ShieldAlert className="h-7 w-7 text-primary" />
          <div>
            <h1 className="font-display text-3xl tracking-tight">Appeal photo</h1>
            <p className="text-sm text-muted-foreground">
              Upload a new photo and we'll send it back through moderation.
            </p>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !review ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Review not found.
            </CardContent>
          </Card>
        ) : !ownsReview ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              You can only appeal your own reviews.
            </CardContent>
          </Card>
        ) : !canAppeal ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              This review's photo isn't in a rejected state.
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card className="border-border/60 bg-card/80">
              <CardContent className="space-y-2 p-5">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-[10px] uppercase tracking-wider">
                    Rejected
                  </Badge>
                  <span className="font-display text-lg">{review.bottle_name}</span>
                </div>
                {review.image_moderation_reason && (
                  <p className="text-sm text-amber-300/80">
                    Moderator note: {review.image_moderation_reason}
                  </p>
                )}
                <p className="whitespace-pre-line text-sm text-foreground/90">{review.body}</p>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label>New photo</Label>
              {preview ? (
                <div className="relative overflow-hidden rounded-xl border border-border">
                  <img src={preview} alt="New preview" className="w-full max-h-96 object-cover" />
                  <button
                    type="button"
                    onClick={clearFile}
                    className="absolute top-2 right-2 rounded-full bg-background/80 p-1.5 backdrop-blur hover:bg-background"
                    aria-label="Remove image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition"
                >
                  <ImagePlus className="h-6 w-6" />
                  <span>Choose a replacement photo</span>
                  <span className="text-xs">JPG, PNG, or WebP · up to 8 MB</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/reviews" })}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !file}
                className="bg-gradient-amber text-primary-foreground hover:opacity-90"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resubmitting…
                  </>
                ) : (
                  "Resubmit for review"
                )}
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
