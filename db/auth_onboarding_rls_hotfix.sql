-- Auth onboarding hotfix (run in Supabase SQL editor if student_intern_rls.sql was already applied)
-- 1. Replaces NULL-role leak: unlinked auth users no longer pass staff-wide RLS clauses.
-- 2. Allows first-time login to link team.supabase_user_id to auth.uid() when email matches.

-- If you have not applied student_intern_rls.sql yet, use the updated file in repo instead of this patch.

-- ─── team: self-link on first login (email match, no supabase_user_id yet) ───
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

-- ─── team SELECT: pending invite row by email (for middleware / client link) ───
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
