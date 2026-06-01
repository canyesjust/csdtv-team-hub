-- Query performance indexes for dashboard workloads (idempotent).
-- Apply in Supabase SQL Editor or via migration.

CREATE INDEX IF NOT EXISTS idx_productions_start_datetime_status
  ON public.productions (start_datetime, status)
  WHERE start_datetime IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_productions_status_not_abandoned
  ON public.productions (status)
  WHERE status IS DISTINCT FROM 'Abandoned';

CREATE INDEX IF NOT EXISTS idx_tasks_status_due_date
  ON public.tasks (status, due_date);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_status
  ON public.tasks (assigned_to, status)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_assignments_team_id
  ON public.task_assignments (team_id);

CREATE INDEX IF NOT EXISTS idx_production_activity_prod_action
  ON public.production_activity (production_id, action);
