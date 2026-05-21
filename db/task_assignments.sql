-- Multiple assignees per task (idempotent)
-- Apply in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.task_assignments (
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.team (id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.team (id) ON DELETE SET NULL,
  PRIMARY KEY (task_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignments_team_id ON public.task_assignments (team_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_task_id ON public.task_assignments (task_id);

-- Backfill from legacy single assignee column
INSERT INTO public.task_assignments (task_id, team_id)
SELECT id, assigned_to
FROM public.tasks
WHERE assigned_to IS NOT NULL
ON CONFLICT (task_id, team_id) DO NOTHING;

-- Keep tasks.assigned_to in sync as primary assignee (first row) for signage/digest until those are migrated
CREATE OR REPLACE FUNCTION public.sync_tasks_assigned_to_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  primary_id uuid;
BEGIN
  SELECT ta.team_id INTO primary_id
  FROM public.task_assignments ta
  WHERE ta.task_id = COALESCE(NEW.task_id, OLD.task_id)
  ORDER BY ta.assigned_at ASC, ta.team_id ASC
  LIMIT 1;

  UPDATE public.tasks
  SET assigned_to = primary_id,
      updated_at = now()
  WHERE id = COALESCE(NEW.task_id, OLD.task_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS task_assignments_sync_primary_insert ON public.task_assignments;
CREATE TRIGGER task_assignments_sync_primary_insert
  AFTER INSERT ON public.task_assignments
  FOR EACH ROW EXECUTE FUNCTION public.sync_tasks_assigned_to_primary();

DROP TRIGGER IF EXISTS task_assignments_sync_primary_delete ON public.task_assignments;
CREATE TRIGGER task_assignments_sync_primary_delete
  AFTER DELETE ON public.task_assignments
  FOR EACH ROW EXECUTE FUNCTION public.sync_tasks_assigned_to_primary();

ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_assignments_select ON public.task_assignments;
CREATE POLICY task_assignments_select ON public.task_assignments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS task_assignments_insert ON public.task_assignments;
CREATE POLICY task_assignments_insert ON public.task_assignments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS task_assignments_delete ON public.task_assignments;
CREATE POLICY task_assignments_delete ON public.task_assignments
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Student intern: also see tasks where user is in task_assignments
DROP POLICY IF EXISTS tasks_student_intern_restrictive_select ON public.tasks;
CREATE POLICY tasks_student_intern_restrictive_select
ON public.tasks
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.auth_team_role() IN ('Manager', 'Staff', 'Intern')
  OR tasks.assigned_to = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
  OR EXISTS (
    SELECT 1 FROM public.task_assignments ta
    INNER JOIN public.team t ON t.id = ta.team_id
    WHERE ta.task_id = tasks.id AND t.supabase_user_id = auth.uid()
  )
  OR (
    tasks.production_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.production_members pm
      INNER JOIN public.team t ON t.id = pm.user_id
      WHERE pm.production_id = tasks.production_id AND t.supabase_user_id = auth.uid()
    )
  )
);
