import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SiteNav } from "@/components/SiteNav";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { REVIEW_BUCKET } from "@/lib/review-images";
import { toast } from "sonner";
import { ImagePlus, Star, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_verified/reviews/new")({
  head: () => ({ meta: [{ title: "New review — BourbonConnect" }] }),
  component: NewReviewPage,
});

interface DistilleryOption {
  id: string;
  name: string;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

function NewReviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bottleName, setBottleName] = useState("");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [distilleryId, setDistilleryId] = useState<string>("");
  const [distilleries, setDistilleries] = useState<DistilleryOption[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void supabase
      .from("places")
      .select("id, name")
      .eq("kind", "distillery")
      .order("name")
      .then(({ data }) => setDistilleries((data ?? []) as DistilleryOption[]));
  }, []);

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

  async function uploadImage(): Promise<string | null> {
    if (!file || !user) return null;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(REVIEW_BUCKET)
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) {
      toast.error("Image upload failed. Please try again.");
      return null;
    }
    return path;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!bottleName.trim() || !body.trim() || rating < 1) {
      toast.error("Add a bottle name, rating, and tasting notes.");
      return;
    }
    setSubmitting(true);
    try {
      const imagePath = file ? await uploadImage() : null;
      if (file && !imagePath) return; // upload failed, toast already shown

      const { data: inserted, error } = await supabase
        .from("bourbon_reviews")
        .insert({
          user_id: user.id,
          bottle_name: bottleName.trim(),
          distillery_id: distilleryId || null,
          rating,
          body: body.trim(),
          image_url: imagePath,
        })
        .select("id")
        .single();
      if (error || !inserted) {
        toast.error("Couldn't post your review. Please try again.");
        return;
      }

      if (imagePath) {
        // Run AI moderation in the background; don't block the user.
        const { moderateReviewImage } = await import("@/lib/moderation.functions");
        void moderateReviewImage({ data: { reviewId: inserted.id } }).catch(() => {
          /* best-effort: moderator queue will catch it */
        });
        toast.success("Review posted. Your photo is in moderation and will appear shortly.");
      } else {
        toast.success("Review posted.");
      }
      void navigate({ to: "/reviews" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-display text-3xl md:text-4xl tracking-tight">Post a review</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Share tasting notes, a rating, and a photo of the bottle or pour.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="bottle">Bottle</Label>
            <Input
              id="bottle"
              value={bottleName}
              onChange={(e) => setBottleName(e.target.value)}
              placeholder="e.g., Eagle Rare 10"
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="distillery">Distillery (optional)</Label>
            <select
              id="distillery"
              value={distilleryId}
              onChange={(e) => setDistilleryId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">— Select a distillery —</option>
              {distilleries.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Rating</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  className="p-1"
                >
                  <Star
                    className={cn(
                      "h-7 w-7 transition-colors",
                      n <= rating
                        ? "fill-primary text-primary"
                        : "text-muted-foreground hover:text-primary/60",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Tasting notes</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={4000}
              placeholder="Nose, palate, finish — what stood out?"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Photo (optional)</Label>
            {preview ? (
              <div className="relative overflow-hidden rounded-xl border border-border">
                <img src={preview} alt="Review preview" className="w-full max-h-96 object-cover" />
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
                <span>Add a photo of the bottle or pour</span>
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
              disabled={submitting}
              className="bg-gradient-amber text-primary-foreground hover:opacity-90"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Posting…
                </>
              ) : (
                "Publish review"
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
