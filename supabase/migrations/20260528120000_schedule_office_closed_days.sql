-- Office-wide closed days: block team hour scheduling and show on signage.
-- Requires public.auth_team_role() (see db/student_intern_rls.sql).

CREATE TABLE IF NOT EXISTS public.schedule_office_closed_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.team (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_office_closed_days_date
  ON public.schedule_office_closed_days (date);

ALTER TABLE public.schedule_office_closed_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedule_office_closed_days_select ON public.schedule_office_closed_days;
CREATE POLICY schedule_office_closed_days_select ON public.schedule_office_closed_days
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS schedule_office_closed_days_insert ON public.schedule_office_closed_days;
CREATE POLICY schedule_office_closed_days_insert ON public.schedule_office_closed_days
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_team_role() = 'Manager');

DROP POLICY IF EXISTS schedule_office_closed_days_delete ON public.schedule_office_closed_days;
CREATE POLICY schedule_office_closed_days_delete ON public.schedule_office_closed_days
  FOR DELETE TO authenticated
  USING (public.auth_team_role() = 'Manager');

DROP POLICY IF EXISTS schedule_office_closed_days_update ON public.schedule_office_closed_days;
CREATE POLICY schedule_office_closed_days_update ON public.schedule_office_closed_days
  FOR UPDATE TO authenticated
  USING (public.auth_team_role() = 'Manager')
  WITH CHECK (public.auth_team_role() = 'Manager');
