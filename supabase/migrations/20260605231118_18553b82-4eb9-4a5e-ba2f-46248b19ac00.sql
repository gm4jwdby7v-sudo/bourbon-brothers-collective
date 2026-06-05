-- ============ Tables ============

CREATE TABLE public.dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dm_thread_participants (
  thread_id uuid NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT 'epoch'::timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX dm_thread_participants_user_idx ON public.dm_thread_participants(user_id);

CREATE TABLE public.dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dm_messages_thread_created_idx ON public.dm_messages(thread_id, created_at);

-- ============ Grants ============

GRANT SELECT, INSERT, UPDATE ON public.dm_threads TO authenticated;
GRANT ALL ON public.dm_threads TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.dm_thread_participants TO authenticated;
GRANT ALL ON public.dm_thread_participants TO service_role;

GRANT SELECT, INSERT ON public.dm_messages TO authenticated;
GRANT ALL ON public.dm_messages TO service_role;

-- ============ Security definer helper (avoids recursive RLS on participants) ============

CREATE OR REPLACE FUNCTION public.is_thread_participant(_thread_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dm_thread_participants
    WHERE thread_id = _thread_id AND user_id = _user_id
  );
$$;

-- ============ RLS ============

ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

-- dm_threads: participants can read; anyone authenticated can create
CREATE POLICY "Participants can view their threads"
ON public.dm_threads FOR SELECT
TO authenticated
USING (public.is_thread_participant(id, auth.uid()));

CREATE POLICY "Authenticated users can create threads"
ON public.dm_threads FOR INSERT
TO authenticated
WITH CHECK (true);

-- dm_thread_participants
CREATE POLICY "Participants can view rows in their threads"
ON public.dm_thread_participants FOR SELECT
TO authenticated
USING (public.is_thread_participant(thread_id, auth.uid()));

CREATE POLICY "Authenticated users can add themselves as participants"
ON public.dm_thread_participants FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Participants can update only their own last_read_at"
ON public.dm_thread_participants FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- dm_messages
CREATE POLICY "Participants can read thread messages"
ON public.dm_messages FOR SELECT
TO authenticated
USING (public.is_thread_participant(thread_id, auth.uid()));

CREATE POLICY "Participants can send messages as themselves"
ON public.dm_messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_thread_participant(thread_id, auth.uid())
);

-- ============ updated_at trigger on threads ============

CREATE TRIGGER dm_threads_set_updated_at
BEFORE UPDATE ON public.dm_threads
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Bump thread updated_at when a new message is inserted
CREATE OR REPLACE FUNCTION public.tg_dm_messages_bump_thread()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.dm_threads SET updated_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dm_messages_bump_thread
AFTER INSERT ON public.dm_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_dm_messages_bump_thread();

-- ============ Realtime ============

ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;
ALTER TABLE public.dm_thread_participants REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_thread_participants;
