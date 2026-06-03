-- Student intern: task visibility (multi-assignee + created tasks) and team directory for schedule.

CREATE OR REPLACE FUNCTION public.auth_student_intern_can_read_task(
  p_task_id uuid,
  p_assigned_to uuid,
  p_production_id uuid,
  p_created_by uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_team_role_is_hub_staff()
    OR p_assigned_to = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
    OR p_created_by = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1
      FROM public.task_assignments ta
      INNER JOIN public.team t ON t.id = ta.team_id
      WHERE ta.task_id = p_task_id AND t.supabase_user_id = auth.uid()
    )
    OR (
      p_production_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.production_members pm
        INNER JOIN public.team t ON t.id = pm.user_id
        WHERE pm.production_id = p_production_id AND t.supabase_user_id = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.auth_student_intern_can_read_task(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_student_intern_can_read_task(uuid, uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS tasks_student_intern_restrictive_select ON public.tasks;
CREATE POLICY tasks_student_intern_restrictive_select
ON public.tasks
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_student_intern_can_read_task(id, assigned_to, production_id, created_by)
);

DROP POLICY IF EXISTS tasks_student_intern_permissive_select ON public.tasks;
CREATE POLICY tasks_student_intern_permissive_select
ON public.tasks
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IS DISTINCT FROM 'Student Intern'
  OR public.auth_student_intern_can_read_task(id, assigned_to, production_id, created_by)
);

-- Team hours: student interns can read active team directory (schedule page).
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
