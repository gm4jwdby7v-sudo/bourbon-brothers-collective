
CREATE TABLE public.retailer_presets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  state_filter text[] NOT NULL DEFAULT '{}',
  retailer_search text NOT NULL DEFAULT '',
  retailer_sort text NOT NULL DEFAULT 'asc',
  retailer_state_scope text NOT NULL DEFAULT 'all',
  retailer_eligible_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX retailer_presets_user_id_idx ON public.retailer_presets(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.retailer_presets TO authenticated;
GRANT ALL ON public.retailer_presets TO service_role;

ALTER TABLE public.retailer_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own retailer presets"
  ON public.retailer_presets FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own retailer presets"
  ON public.retailer_presets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own retailer presets"
  ON public.retailer_presets FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own retailer presets"
  ON public.retailer_presets FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER set_retailer_presets_updated_at
  BEFORE UPDATE ON public.retailer_presets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
