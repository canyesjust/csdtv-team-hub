-- Student Intern RLS (Supabase / Postgres)
-- Run in the Supabase SQL editor after review. RESTRICTIVE policies AND with existing permissive policies,
-- so they tighten access for Student Intern without removing broad staff read (if you already have USING (true)).
-- Requires Postgres 15+ (RESTRICTIVE policies).

-- ─── Helper: role for current auth user (bypasses RLS on team for this lookup only) ───
CREATE OR REPLACE FUNCTION public.auth_team_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.auth_team_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_team_role() TO authenticated;

-- ─── Optional: self-read on team (if not already present) ───
-- CREATE POLICY team_select_self ON public.team FOR SELECT TO authenticated USING (supabase_user_id = auth.uid());

-- ─── productions ───
DROP POLICY IF EXISTS productions_student_intern_restrictive_select ON public.productions;
CREATE POLICY productions_student_intern_restrictive_select
ON public.productions
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR EXISTS (
    SELECT 1 FROM public.production_members pm
    INNER JOIN public.team t ON t.id = pm.user_id
    WHERE pm.production_id = productions.id AND t.supabase_user_id = auth.uid()
  )
);

-- ─── production_members ───
DROP POLICY IF EXISTS production_members_student_intern_restrictive_select ON public.production_members;
CREATE POLICY production_members_student_intern_restrictive_select
ON public.production_members
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR EXISTS (
    SELECT 1 FROM public.production_members pm2
    INNER JOIN public.team t ON t.id = pm2.user_id
    WHERE pm2.production_id = production_members.production_id AND t.supabase_user_id = auth.uid()
  )
);

-- ─── checklist_items (via production membership) ───
DROP POLICY IF EXISTS checklist_items_student_intern_restrictive_select ON public.checklist_items;
CREATE POLICY checklist_items_student_intern_restrictive_select
ON public.checklist_items
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR EXISTS (
    SELECT 1 FROM public.production_members pm
    INNER JOIN public.team t ON t.id = pm.user_id
    WHERE pm.production_id = checklist_items.production_id AND t.supabase_user_id = auth.uid()
  )
);

-- ─── tasks: assigned to self OR on a production where user is a member ───
DROP POLICY IF EXISTS tasks_student_intern_restrictive_select ON public.tasks;
CREATE POLICY tasks_student_intern_restrictive_select
ON public.tasks
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
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

-- ─── production_activity ───
DROP POLICY IF EXISTS production_activity_student_intern_restrictive_select ON public.production_activity;
CREATE POLICY production_activity_student_intern_restrictive_select
ON public.production_activity
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR EXISTS (
    SELECT 1 FROM public.production_members pm
    INNER JOIN public.team t ON t.id = pm.user_id
    WHERE pm.production_id = production_activity.production_id AND t.supabase_user_id = auth.uid()
  )
);

-- ─── comments (entity_type production | task) ───
DROP POLICY IF EXISTS comments_student_intern_restrictive_select ON public.comments;
CREATE POLICY comments_student_intern_restrictive_select
ON public.comments
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
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
      INNER JOIN public.productions pr ON pr.id = pm.production_id
      WHERE pr.id::text = comments.entity_id::text AND t.supabase_user_id = auth.uid()
    )
  )
);

-- Adjust entity_id comparisons if your column type is uuid vs text (cast as needed).

-- ─── knowledge_base: read all; block writes for Student Intern (INSERT/UPDATE/DELETE only) ───
DROP POLICY IF EXISTS knowledge_base_student_intern_restrictive_insert ON public.knowledge_base;
CREATE POLICY knowledge_base_student_intern_restrictive_insert
ON public.knowledge_base AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.auth_team_role() IN ('Manager', 'Staff', 'Intern'));

DROP POLICY IF EXISTS knowledge_base_student_intern_restrictive_update ON public.knowledge_base;
CREATE POLICY knowledge_base_student_intern_restrictive_update
ON public.knowledge_base AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.auth_team_role() IN ('Manager', 'Staff', 'Intern'))
WITH CHECK (public.auth_team_role() IN ('Manager', 'Staff', 'Intern'));

DROP POLICY IF EXISTS knowledge_base_student_intern_restrictive_delete ON public.knowledge_base;
CREATE POLICY knowledge_base_student_intern_restrictive_delete
ON public.knowledge_base AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.auth_team_role() IN ('Manager', 'Staff', 'Intern'));

-- ─── onboarding_tasks ───
DROP POLICY IF EXISTS onboarding_tasks_student_intern_restrictive_select ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_student_intern_restrictive_select
ON public.onboarding_tasks
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR onboarding_tasks.assigned_to = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
  OR public.auth_team_role() IN ('Manager', 'Staff')
);

DROP POLICY IF EXISTS onboarding_tasks_student_intern_restrictive_update ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_student_intern_restrictive_update
ON public.onboarding_tasks
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR onboarding_tasks.assigned_to = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
  OR public.auth_team_role() IN ('Manager', 'Staff')
)
WITH CHECK (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR onboarding_tasks.assigned_to = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
  OR public.auth_team_role() IN ('Manager', 'Staff')
);

-- ─── team: list only self for Student Intern (restrictive on SELECT) ───
DROP POLICY IF EXISTS team_student_intern_restrictive_select ON public.team;
CREATE POLICY team_student_intern_restrictive_select
ON public.team
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR team.supabase_user_id = auth.uid()
  OR team.id = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
  OR (
    team.supabase_user_id IS NULL
    AND lower(trim(team.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);

-- If staff need to read all team rows, the first clause passes for them. Student Intern: only rows matching the OR branches.

-- ─── Hotfix: add permissive policies so restrictive policies can evaluate correctly ───
-- In Postgres RLS, restrictive policies are combined with permissive policies.
-- If a table has only restrictive policies, reads may return zero rows.

DROP POLICY IF EXISTS productions_student_intern_permissive_select ON public.productions;
CREATE POLICY productions_student_intern_permissive_select
ON public.productions FOR SELECT TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR EXISTS (
    SELECT 1 FROM public.production_members pm
    JOIN public.team t ON t.id = pm.user_id
    WHERE pm.production_id = productions.id AND t.supabase_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS production_members_student_intern_permissive_select ON public.production_members;
CREATE POLICY production_members_student_intern_permissive_select
ON public.production_members FOR SELECT TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR EXISTS (
    SELECT 1 FROM public.production_members pm2
    JOIN public.team t ON t.id = pm2.user_id
    WHERE pm2.production_id = production_members.production_id AND t.supabase_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS checklist_items_student_intern_permissive_select ON public.checklist_items;
CREATE POLICY checklist_items_student_intern_permissive_select
ON public.checklist_items FOR SELECT TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR EXISTS (
    SELECT 1 FROM public.production_members pm
    JOIN public.team t ON t.id = pm.user_id
    WHERE pm.production_id = checklist_items.production_id AND t.supabase_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS tasks_student_intern_permissive_select ON public.tasks;
CREATE POLICY tasks_student_intern_permissive_select
ON public.tasks FOR SELECT TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR tasks.assigned_to = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
  OR (
    tasks.production_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.production_members pm
      JOIN public.team t ON t.id = pm.user_id
      WHERE pm.production_id = tasks.production_id AND t.supabase_user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS production_activity_student_intern_permissive_select ON public.production_activity;
CREATE POLICY production_activity_student_intern_permissive_select
ON public.production_activity FOR SELECT TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR EXISTS (
    SELECT 1 FROM public.production_members pm
    JOIN public.team t ON t.id = pm.user_id
    WHERE pm.production_id = production_activity.production_id AND t.supabase_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS comments_student_intern_permissive_select ON public.comments;
CREATE POLICY comments_student_intern_permissive_select
ON public.comments FOR SELECT TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
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
              JOIN public.team t ON t.id = pm.user_id
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
      JOIN public.team t ON t.id = pm.user_id
      JOIN public.productions pr ON pr.id = pm.production_id
      WHERE pr.id::text = comments.entity_id::text AND t.supabase_user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS knowledge_base_student_intern_permissive_select ON public.knowledge_base;
CREATE POLICY knowledge_base_student_intern_permissive_select
ON public.knowledge_base FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS onboarding_tasks_student_intern_permissive_select ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_student_intern_permissive_select
ON public.onboarding_tasks FOR SELECT TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR onboarding_tasks.assigned_to = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
  OR public.auth_team_role() IN ('Manager', 'Staff')
);

DROP POLICY IF EXISTS onboarding_tasks_student_intern_permissive_update ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_student_intern_permissive_update
ON public.onboarding_tasks FOR UPDATE TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR onboarding_tasks.assigned_to = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
  OR public.auth_team_role() IN ('Manager', 'Staff')
)
WITH CHECK (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR onboarding_tasks.assigned_to = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
  OR public.auth_team_role() IN ('Manager', 'Staff')
);

DROP POLICY IF EXISTS team_student_intern_permissive_select ON public.team;
CREATE POLICY team_student_intern_permissive_select
ON public.team FOR SELECT TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR team.supabase_user_id = auth.uid()
  OR team.id = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
  OR (
    team.supabase_user_id IS NULL
    AND lower(trim(team.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);

-- ─── team: self-link supabase_user_id on first login (email must match invite row) ───
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
