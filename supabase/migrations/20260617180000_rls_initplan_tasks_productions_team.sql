-- RLS initplan fix for high-traffic tables: wrap auth.* and helper calls in (select …)
-- so Postgres evaluates once per query, not per row.
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- productions ----------------------------------------------------------------

DROP POLICY IF EXISTS productions_insert ON public.productions;
CREATE POLICY productions_insert ON public.productions
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS productions_student_intern_permissive_select ON public.productions;
CREATE POLICY productions_student_intern_permissive_select ON public.productions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    ((select auth_team_role()) IS DISTINCT FROM 'Student Intern')
    OR (select auth_user_can_access_production(id))
  );

DROP POLICY IF EXISTS productions_student_intern_restrictive_select ON public.productions;
CREATE POLICY productions_student_intern_restrictive_select ON public.productions
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((select auth_user_can_access_production(id)));

DROP POLICY IF EXISTS productions_update ON public.productions;
CREATE POLICY productions_update ON public.productions
  AS PERMISSIVE FOR UPDATE TO public
  USING ((select is_manager()));

-- tasks ----------------------------------------------------------------------

DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_delete ON public.tasks
  AS PERMISSIVE FOR DELETE TO public
  USING (
    (select is_manager())
    OR (created_by = (select get_team_id()))
  );

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select get_team_id()) IS NOT NULL);

DROP POLICY IF EXISTS tasks_student_intern_permissive_select ON public.tasks;
CREATE POLICY tasks_student_intern_permissive_select ON public.tasks
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    ((select auth_team_role()) IS DISTINCT FROM 'Student Intern')
    OR (select auth_student_intern_can_read_task(id, assigned_to, production_id, created_by))
  );

DROP POLICY IF EXISTS tasks_student_intern_restrictive_select ON public.tasks;
CREATE POLICY tasks_student_intern_restrictive_select ON public.tasks
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((select auth_student_intern_can_read_task(id, assigned_to, production_id, created_by)));

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks
  AS PERMISSIVE FOR UPDATE TO public
  USING ((select get_team_id()) IS NOT NULL);

-- team -----------------------------------------------------------------------

DROP POLICY IF EXISTS team_insert ON public.team;
CREATE POLICY team_insert ON public.team
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select is_manager()));

DROP POLICY IF EXISTS team_link_own_supabase_user ON public.team;
CREATE POLICY team_link_own_supabase_user ON public.team
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    lower(trim(email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
    AND supabase_user_id IS NULL
  )
  WITH CHECK (
    supabase_user_id = (select auth.uid())
    AND lower(trim(email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
  );

DROP POLICY IF EXISTS team_select_pending_by_email ON public.team;
CREATE POLICY team_select_pending_by_email ON public.team
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    supabase_user_id = (select auth.uid())
    OR (
      supabase_user_id IS NULL
      AND lower(trim(email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
    )
  );

DROP POLICY IF EXISTS team_student_intern_permissive_select ON public.team;
CREATE POLICY team_student_intern_permissive_select ON public.team
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (select auth_team_role_is_hub_staff())
    OR (supabase_user_id = (select auth.uid()))
    OR (id = (select auth_team_id()))
    OR (
      supabase_user_id IS NULL
      AND lower(trim(email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
    )
  );

DROP POLICY IF EXISTS team_student_intern_restrictive_select ON public.team;
CREATE POLICY team_student_intern_restrictive_select ON public.team
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (select auth_team_role_is_hub_staff())
    OR (active = true)
    OR (supabase_user_id = (select auth.uid()))
    OR (id = (select auth_team_id()))
    OR (
      supabase_user_id IS NULL
      AND lower(trim(email)) = lower(trim(coalesce((select auth.jwt()) ->> 'email', '')))
    )
  );

DROP POLICY IF EXISTS team_update ON public.team;
CREATE POLICY team_update ON public.team
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    (select is_manager())
    OR (supabase_user_id = (select auth.uid()))
  );
