
CREATE TABLE public.bourbon_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bottle_name text NOT NULL CHECK (char_length(bottle_name) BETWEEN 1 AND 200),
  distillery_id uuid REFERENCES public.places(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bourbon_reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bourbon_reviews TO authenticated;
GRANT ALL ON public.bourbon_reviews TO service_role;

ALTER TABLE public.bourbon_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are viewable by everyone"
  ON public.bourbon_reviews FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own reviews"
  ON public.bourbon_reviews FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own reviews"
  ON public.bourbon_reviews FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own reviews"
  ON public.bourbon_reviews FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX bourbon_reviews_created_at_idx ON public.bourbon_reviews (created_at DESC);
CREATE INDEX bourbon_reviews_user_id_idx ON public.bourbon_reviews (user_id);

CREATE TRIGGER bourbon_reviews_set_updated_at
  BEFORE UPDATE ON public.bourbon_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
