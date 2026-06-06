
-- App-wide role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'member');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Moderation status
CREATE TYPE public.moderation_status AS ENUM ('pending', 'approved', 'rejected', 'auto_flagged');

ALTER TABLE public.bourbon_reviews
  ADD COLUMN image_moderation_status public.moderation_status,
  ADD COLUMN image_moderation_reason text,
  ADD COLUMN image_moderated_at timestamptz,
  ADD COLUMN image_moderated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill existing reviews
UPDATE public.bourbon_reviews
SET image_moderation_status = CASE WHEN image_url IS NULL THEN 'approved'::public.moderation_status
                                   ELSE 'pending'::public.moderation_status END;

-- Default for new rows
ALTER TABLE public.bourbon_reviews
  ALTER COLUMN image_moderation_status SET DEFAULT 'pending'::public.moderation_status;

-- Moderators can read all reviews (already public) and update moderation columns
CREATE POLICY "Moderators can update review moderation"
  ON public.bourbon_reviews FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX bourbon_reviews_moderation_idx
  ON public.bourbon_reviews (image_moderation_status, created_at DESC)
  WHERE image_url IS NOT NULL;
