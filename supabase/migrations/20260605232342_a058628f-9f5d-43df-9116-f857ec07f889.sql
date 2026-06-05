CREATE TABLE public.dm_push_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dm_push_tokens_user_id_idx ON public.dm_push_tokens(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_push_tokens TO authenticated;
GRANT ALL ON public.dm_push_tokens TO service_role;

ALTER TABLE public.dm_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own push tokens (select)"
  ON public.dm_push_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users manage their own push tokens (insert)"
  ON public.dm_push_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage their own push tokens (update)"
  ON public.dm_push_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage their own push tokens (delete)"
  ON public.dm_push_tokens FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER dm_push_tokens_set_updated_at
  BEFORE UPDATE ON public.dm_push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();