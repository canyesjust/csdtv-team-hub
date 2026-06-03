-- Fix infinite recursion in team SELECT RLS (subquery on team inside team policy).

DROP POLICY IF EXISTS team_student_intern_restrictive_select ON public.team;
CREATE POLICY team_student_intern_restrictive_select
ON public.team
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern', 'Production Focus')
  OR team.active = true
  OR team.supabase_user_id = auth.uid()
  OR team.id = public.auth_team_id()
  OR (
    team.supabase_user_id IS NULL
    AND lower(trim(team.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);

DROP POLICY IF EXISTS team_student_intern_permissive_select ON public.team;
CREATE POLICY team_student_intern_permissive_select
ON public.team
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR team.supabase_user_id = auth.uid()
  OR team.id = public.auth_team_id()
  OR (
    team.supabase_user_id IS NULL
    AND lower(trim(team.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);
