-- Allow first-time login to link team.supabase_user_id when email matches (see db/auth_onboarding_rls_hotfix.sql)

DROP POLICY IF EXISTS team_link_own_supabase_user ON public.team;
CREATE POLICY team_link_own_supabase_user
ON public.team
FOR UPDATE
TO authenticated
USING (
  lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  AND supabase_user_id IS NULL
)
WITH CHECK (
  supabase_user_id = auth.uid()
  AND lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
);

DROP POLICY IF EXISTS team_select_pending_by_email ON public.team;
CREATE POLICY team_select_pending_by_email
ON public.team
FOR SELECT
TO authenticated
USING (
  supabase_user_id = auth.uid()
  OR (
    supabase_user_id IS NULL
    AND lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);
