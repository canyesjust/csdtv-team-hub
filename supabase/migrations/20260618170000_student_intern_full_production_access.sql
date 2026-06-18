-- Give every Student Intern full access to ALL productions (role-based, ongoing).
--
-- Until now a Student Intern could only see productions they were added to as a
-- member. All other roles (Manager, Staff, Intern, Production Focus) already see
-- everything via auth_team_role_is_hub_staff(). This opens the same visibility to
-- Student Interns.
--
-- Reads for productions, production_members, checklist_items, production_activity,
-- comments and tasks all funnel through these two SECURITY DEFINER helpers, so a
-- single role short-circuit in each opens every related read policy at once.
-- Writes (tasks insert/update, checklist toggles, comments) are already permitted
-- for any team member, so this also lets interns edit across all productions.

CREATE OR REPLACE FUNCTION public.auth_user_can_access_production(p_production_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_team_role_is_hub_staff()
    OR public.auth_team_role() = 'Student Intern'
    OR (
      p_production_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.production_members pm
        WHERE pm.production_id = p_production_id
          AND pm.user_id = public.auth_team_id()
      )
    );
$$;

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
    OR public.auth_team_role() = 'Student Intern'
    OR p_assigned_to = public.auth_team_id()
    OR p_created_by = public.auth_team_id()
    OR EXISTS (
      SELECT 1
      FROM public.task_assignments ta
      WHERE ta.task_id = p_task_id
        AND ta.team_id = public.auth_team_id()
    )
    OR (
      p_production_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.production_members pm
        WHERE pm.production_id = p_production_id
          AND pm.user_id = public.auth_team_id()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.auth_user_can_access_production(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_can_access_production(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.auth_student_intern_can_read_task(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_student_intern_can_read_task(uuid, uuid, uuid, uuid) TO authenticated;
