-- 1) Storage: restrict review-images reads to signed-in users
DROP POLICY IF EXISTS "Review images are publicly viewable" ON storage.objects;
CREATE POLICY "Review images viewable by authenticated users"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'review-images');

-- 2) bourbon_reviews: hide moderation workflow columns from anonymous users
REVOKE SELECT ON public.bourbon_reviews FROM anon;
REVOKE SELECT ON public.bourbon_reviews FROM authenticated;
GRANT SELECT (id, user_id, bottle_name, distillery_id, rating, body, image_url, image_moderation_status, created_at, updated_at)
  ON public.bourbon_reviews TO anon;
GRANT SELECT (id, user_id, bottle_name, distillery_id, rating, body, image_url, image_moderation_status, image_moderation_reason, created_at, updated_at)
  ON public.bourbon_reviews TO authenticated;
GRANT ALL ON public.bourbon_reviews TO service_role;

-- 3) user_roles: controlled admin-only write path
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can grant roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can change roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can revoke roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4) SECURITY DEFINER hardening: signup trigger helper must not be callable via the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;