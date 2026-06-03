-- Simplified hub UI flag + Production Focus role data access (same as Intern/Staff hub policies).

ALTER TABLE public.team
  ADD COLUMN IF NOT EXISTS dashboard_profile text NOT NULL DEFAULT 'default';

ALTER TABLE public.team
  DROP CONSTRAINT IF EXISTS team_dashboard_profile_check;

ALTER TABLE public.team
  ADD CONSTRAINT team_dashboard_profile_check
  CHECK (dashboard_profile IN ('default', 'production_focus'));

COMMENT ON COLUMN public.team.dashboard_profile IS
  'default = full nav; production_focus = Home, Tasks, Productions and limited production tabs.';

CREATE OR REPLACE FUNCTION public.auth_team_role_is_hub_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_team_role() IN ('Manager', 'Staff', 'Intern', 'Production Focus');
$$;

REVOKE ALL ON FUNCTION public.auth_team_role_is_hub_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_team_role_is_hub_staff() TO authenticated;

-- Extend student-intern restrictive policies so Production Focus has full staff visibility.
DROP POLICY IF EXISTS productions_student_intern_restrictive_select ON public.productions;
CREATE POLICY productions_student_intern_restrictive_select
ON public.productions
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role_is_hub_staff()
  OR EXISTS (
    SELECT 1 FROM public.production_members pm
    INNER JOIN public.team t ON t.id = pm.user_id
    WHERE pm.production_id = productions.id AND t.supabase_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS production_members_student_intern_restrictive_select ON public.production_members;
CREATE POLICY production_members_student_intern_restrictive_select
ON public.production_members
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role_is_hub_staff()
  OR EXISTS (
    SELECT 1 FROM public.production_members pm2
    INNER JOIN public.team t ON t.id = pm2.user_id
    WHERE pm2.production_id = production_members.production_id AND t.supabase_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS checklist_items_student_intern_restrictive_select ON public.checklist_items;
CREATE POLICY checklist_items_student_intern_restrictive_select
ON public.checklist_items
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role_is_hub_staff()
  OR EXISTS (
    SELECT 1 FROM public.production_members pm
    INNER JOIN public.team t ON t.id = pm.user_id
    WHERE pm.production_id = checklist_items.production_id AND t.supabase_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS tasks_student_intern_restrictive_select ON public.tasks;
CREATE POLICY tasks_student_intern_restrictive_select
ON public.tasks
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role_is_hub_staff()
  OR tasks.assigned_to = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
  OR (
    tasks.production_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.production_members pm
      INNER JOIN public.team t ON t.id = pm.user_id
      WHERE pm.production_id = tasks.production_id AND t.supabase_user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS production_activity_student_intern_restrictive_select ON public.production_activity;
CREATE POLICY production_activity_student_intern_restrictive_select
ON public.production_activity
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role_is_hub_staff()
  OR EXISTS (
    SELECT 1 FROM public.production_members pm
    INNER JOIN public.team t ON t.id = pm.user_id
    WHERE pm.production_id = production_activity.production_id AND t.supabase_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS comments_student_intern_restrictive_select ON public.comments;
CREATE POLICY comments_student_intern_restrictive_select
ON public.comments
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role_is_hub_staff()
  OR (
    comments.entity_type = 'task'
    AND EXISTS (
      SELECT 1 FROM public.tasks tk
      WHERE tk.id::text = comments.entity_id::text
        AND (
          tk.assigned_to = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
          OR (
            tk.production_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.production_members pm
              INNER JOIN public.team t ON t.id = pm.user_id
              WHERE pm.production_id = tk.production_id AND t.supabase_user_id = auth.uid()
            )
          )
        )
    )
  )
  OR (
    comments.entity_type = 'production'
    AND EXISTS (
      SELECT 1 FROM public.production_members pm
      INNER JOIN public.team t ON t.id = pm.user_id
      WHERE pm.production_id::text = comments.entity_id::text AND t.supabase_user_id = auth.uid()
    )
  )
);
