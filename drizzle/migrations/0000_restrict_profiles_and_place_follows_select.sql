DROP POLICY "Follows are viewable by everyone" ON public.place_follows;
CREATE POLICY "Follows are viewable by authenticated users" ON public.place_follows FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

REVOKE SELECT ON public.place_follows FROM anon;