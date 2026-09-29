DROP POLICY IF EXISTS "Follows are viewable by authenticated users" ON public.place_follows;
CREATE POLICY "Users can view their own follows" ON public.place_follows
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.place_follower_counts()
RETURNS TABLE(place_id uuid, follower_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT place_id, count(*) FROM public.place_follows GROUP BY place_id $$;
REVOKE EXECUTE ON FUNCTION public.place_follower_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_follower_counts() TO anon, authenticated;