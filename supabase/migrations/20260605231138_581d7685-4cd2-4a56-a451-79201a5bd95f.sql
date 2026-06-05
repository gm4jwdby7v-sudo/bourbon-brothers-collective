-- Tighten thread INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create threads" ON public.dm_threads;
CREATE POLICY "Authenticated users can create threads"
ON public.dm_threads FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Lock down EXECUTE on the security-definer helper.
-- RLS policies run as the table owner, so revoking from PUBLIC/anon/authenticated
-- does not affect policy evaluation.
REVOKE EXECUTE ON FUNCTION public.is_thread_participant(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_thread_participant(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_thread_participant(uuid, uuid) FROM authenticated;
