-- Per-day out-of-office markers for team hours + public signage calendar.
-- Requires public.auth_team_role() (see db/student_intern_rls.sql).

CREATE TABLE IF NOT EXISTS public.schedule_gone_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.team (id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_schedule_gone_days_date
  ON public.schedule_gone_days (date);

CREATE INDEX IF NOT EXISTS idx_schedule_gone_days_user_date
  ON public.schedule_gone_days (user_id, date);

ALTER TABLE public.schedule_gone_days ENABLE ROW LEVEL SECURITY;

-- Signage (/signage) and dashboard read via anon + authenticated clients.
DROP POLICY IF EXISTS schedule_gone_days_select ON public.schedule_gone_days;
CREATE POLICY schedule_gone_days_select ON public.schedule_gone_days
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS schedule_gone_days_insert ON public.schedule_gone_days;
CREATE POLICY schedule_gone_days_insert ON public.schedule_gone_days
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
    OR public.auth_team_role() = 'Manager'
  );

DROP POLICY IF EXISTS schedule_gone_days_delete ON public.schedule_gone_days;
CREATE POLICY schedule_gone_days_delete ON public.schedule_gone_days
  FOR DELETE TO authenticated
  USING (
    user_id = (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
    OR public.auth_team_role() = 'Manager'
  );
