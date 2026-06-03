-- Fix infinite recursion when RLS policies reference production_members from
-- production_members policy evaluation (and nested production selects).

CREATE OR REPLACE FUNCTION public.auth_user_can_access_production(p_production_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_team_role_is_hub_staff()
    OR EXISTS (
      SELECT 1
      FROM public.production_members pm
      INNER JOIN public.team t ON t.id = pm.user_id
      WHERE pm.production_id = p_production_id
        AND t.supabase_user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_user_can_read_task_comment(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT public.auth_student_intern_can_read_task(
        tk.id,
        tk.assigned_to,
        tk.production_id,
        tk.created_by
      )
      FROM public.tasks tk
      WHERE tk.id = p_task_id
      LIMIT 1
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.auth_user_can_access_production(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_can_access_production(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.auth_user_can_read_task_comment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_can_read_task_comment(uuid) TO authenticated;

DROP POLICY IF EXISTS productions_student_intern_restrictive_select ON public.productions;
CREATE POLICY productions_student_intern_restrictive_select
ON public.productions
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (public.auth_user_can_access_production(productions.id));

DROP POLICY IF EXISTS production_members_student_intern_restrictive_select ON public.production_members;
CREATE POLICY production_members_student_intern_restrictive_select
ON public.production_members
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (public.auth_user_can_access_production(production_members.production_id));

DROP POLICY IF EXISTS checklist_items_student_intern_restrictive_select ON public.checklist_items;
CREATE POLICY checklist_items_student_intern_restrictive_select
ON public.checklist_items
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (public.auth_user_can_access_production(checklist_items.production_id));

DROP POLICY IF EXISTS production_activity_student_intern_restrictive_select ON public.production_activity;
CREATE POLICY production_activity_student_intern_restrictive_select
ON public.production_activity
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (public.auth_user_can_access_production(production_activity.production_id));

DROP POLICY IF EXISTS comments_student_intern_restrictive_select ON public.comments;
CREATE POLICY comments_student_intern_restrictive_select
ON public.comments
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role_is_hub_staff()
  OR (
    comments.entity_type = 'production'
    AND public.auth_user_can_access_production(comments.entity_id::uuid)
  )
  OR (
    comments.entity_type = 'task'
    AND public.auth_user_can_read_task_comment(comments.entity_id::uuid)
  )
);

DROP POLICY IF EXISTS productions_student_intern_permissive_select ON public.productions;
CREATE POLICY productions_student_intern_permissive_select
ON public.productions
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IS DISTINCT FROM 'Student Intern'
  OR public.auth_user_can_access_production(productions.id)
);

DROP POLICY IF EXISTS production_members_student_intern_permissive_select ON public.production_members;
CREATE POLICY production_members_student_intern_permissive_select
ON public.production_members
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IS DISTINCT FROM 'Student Intern'
  OR public.auth_user_can_access_production(production_members.production_id)
);

DROP POLICY IF EXISTS checklist_items_student_intern_permissive_select ON public.checklist_items;
CREATE POLICY checklist_items_student_intern_permissive_select
ON public.checklist_items
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IS DISTINCT FROM 'Student Intern'
  OR public.auth_user_can_access_production(checklist_items.production_id)
);

DROP POLICY IF EXISTS production_activity_student_intern_permissive_select ON public.production_activity;
CREATE POLICY production_activity_student_intern_permissive_select
ON public.production_activity
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IS DISTINCT FROM 'Student Intern'
  OR public.auth_user_can_access_production(production_activity.production_id)
);
