-- Consolidate RLS auth helpers for view-as, student interns, and staff.
-- Replaces inline team subqueries and auth.uid() membership checks that break under impersonation.

-- ─── Core helpers ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_actor_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT s.subject_team_id
      FROM public.impersonation_sessions s
      INNER JOIN public.team actor ON actor.id = s.actor_team_id
      WHERE actor.supabase_user_id = auth.uid()
        AND actor.role = 'Manager'
        AND s.expires_at > now()
      ORDER BY s.started_at DESC
      LIMIT 1
    ),
    (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_team_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.team WHERE id = public.auth_team_id() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_team_role_is_hub_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_team_role() IN ('Manager', 'Staff', 'Intern', 'Production Focus');
$$;

-- Effective team id (subject while view-as is active).
CREATE OR REPLACE FUNCTION public.get_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_team_id();
$$;

-- Effective role is Manager (false while viewing as a non-manager subject).
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_team_role() = 'Manager';
$$;

-- Real signed-in user is Manager (ignores view-as subject).
CREATE OR REPLACE FUNCTION public.is_actor_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team
    WHERE id = public.auth_actor_team_id()
      AND role = 'Manager'
      AND active IS NOT FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.auth_actor_team_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_actor_team_id() TO authenticated;
REVOKE ALL ON FUNCTION public.auth_team_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_team_id() TO authenticated;
REVOKE ALL ON FUNCTION public.auth_team_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_team_role() TO authenticated;
REVOKE ALL ON FUNCTION public.auth_team_role_is_hub_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_team_role_is_hub_staff() TO authenticated;
REVOKE ALL ON FUNCTION public.get_team_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_id() TO authenticated;
REVOKE ALL ON FUNCTION public.is_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;
REVOKE ALL ON FUNCTION public.is_actor_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_actor_manager() TO authenticated;

-- ─── Production / task access helpers ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_user_can_access_production(p_production_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_team_role_is_hub_staff()
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

CREATE OR REPLACE FUNCTION public.auth_user_can_read_comment(p_entity_type text, p_entity_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_team_role_is_hub_staff()
    OR (
      p_entity_type = 'production'
      AND public.auth_user_can_access_production(p_entity_id::uuid)
    )
    OR (
      p_entity_type = 'task'
      AND public.auth_user_can_read_task_comment(p_entity_id::uuid)
    );
$$;

REVOKE ALL ON FUNCTION public.auth_user_can_access_production(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_can_access_production(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.auth_student_intern_can_read_task(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_student_intern_can_read_task(uuid, uuid, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.auth_user_can_read_task_comment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_can_read_task_comment(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.auth_user_can_read_comment(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_can_read_comment(text, text) TO authenticated;

-- ─── Policies still using inline team subqueries ─────────────────────────────

DROP POLICY IF EXISTS comments_student_intern_permissive_select ON public.comments;
CREATE POLICY comments_student_intern_permissive_select
ON public.comments
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IS DISTINCT FROM 'Student Intern'
  OR public.auth_user_can_read_comment(entity_type, entity_id::text)
);

DROP POLICY IF EXISTS comments_student_intern_restrictive_select ON public.comments;
CREATE POLICY comments_student_intern_restrictive_select
ON public.comments
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (public.auth_user_can_read_comment(entity_type, entity_id::text));

DROP POLICY IF EXISTS onboarding_tasks_student_intern_restrictive_select ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_student_intern_restrictive_select
ON public.onboarding_tasks
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role_is_hub_staff()
  OR assigned_to = public.auth_team_id()
);

DROP POLICY IF EXISTS onboarding_tasks_student_intern_restrictive_update ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_student_intern_restrictive_update
ON public.onboarding_tasks
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  public.auth_team_role_is_hub_staff()
  OR assigned_to = public.auth_team_id()
)
WITH CHECK (
  public.auth_team_role_is_hub_staff()
  OR assigned_to = public.auth_team_id()
);

DROP POLICY IF EXISTS onboarding_tasks_student_intern_permissive_select ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_student_intern_permissive_select
ON public.onboarding_tasks
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IS DISTINCT FROM 'Student Intern'
  OR assigned_to = public.auth_team_id()
  OR public.auth_team_role_is_hub_staff()
);

DROP POLICY IF EXISTS onboarding_tasks_student_intern_permissive_update ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_student_intern_permissive_update
ON public.onboarding_tasks
FOR UPDATE
TO authenticated
USING (
  public.auth_team_role() IS DISTINCT FROM 'Student Intern'
  OR assigned_to = public.auth_team_id()
  OR public.auth_team_role_is_hub_staff()
)
WITH CHECK (
  public.auth_team_role() IS DISTINCT FROM 'Student Intern'
  OR assigned_to = public.auth_team_id()
  OR public.auth_team_role_is_hub_staff()
);

DROP POLICY IF EXISTS schedule_gone_days_delete ON public.schedule_gone_days;
CREATE POLICY schedule_gone_days_delete
ON public.schedule_gone_days
FOR DELETE
TO authenticated
USING (
  user_id = public.auth_team_id()
  OR public.is_manager()
);

DROP POLICY IF EXISTS backup_runs_manager_select ON public.backup_runs;
CREATE POLICY backup_runs_manager_select
ON public.backup_runs
FOR SELECT
TO authenticated
USING (public.is_actor_manager());

DROP POLICY IF EXISTS cost_camera_packages_manager_all ON public.cost_camera_packages;
CREATE POLICY cost_camera_packages_manager_all
ON public.cost_camera_packages
FOR ALL
TO authenticated
USING (public.is_actor_manager())
WITH CHECK (public.is_actor_manager());

DROP POLICY IF EXISTS team_student_intern_permissive_select ON public.team;
CREATE POLICY team_student_intern_permissive_select
ON public.team
FOR SELECT
TO authenticated
USING (
  public.auth_team_role_is_hub_staff()
  OR team.supabase_user_id = auth.uid()
  OR team.id = public.auth_team_id()
  OR (
    team.supabase_user_id IS NULL
    AND lower(trim(team.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);

DROP POLICY IF EXISTS team_student_intern_restrictive_select ON public.team;
CREATE POLICY team_student_intern_restrictive_select
ON public.team
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role_is_hub_staff()
  OR team.active = true
  OR team.supabase_user_id = auth.uid()
  OR team.id = public.auth_team_id()
  OR (
    team.supabase_user_id IS NULL
    AND lower(trim(team.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);
