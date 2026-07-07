-- Tighten crew write access so the database enforces what the UI implies.
-- Previously INSERT/UPDATE/DELETE used auth.uid() IS NOT NULL, letting ANY
-- signed-in user (including Interns / Student Interns) modify crew data.
-- Reads stay open to authenticated users; the public sign-up page reads via
-- the service-role API route and is unaffected. Public sign-ups write through
-- signup_student_crew_atomic (SECURITY DEFINER, service_role) and are unaffected.

-- production_crew
DROP POLICY IF EXISTS production_crew_insert ON public.production_crew;
DROP POLICY IF EXISTS production_crew_update ON public.production_crew;
DROP POLICY IF EXISTS production_crew_delete ON public.production_crew;
CREATE POLICY production_crew_insert ON public.production_crew
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_team_role() IN ('Manager', 'Staff'));
CREATE POLICY production_crew_update ON public.production_crew
  FOR UPDATE TO authenticated
  USING (public.auth_team_role() IN ('Manager', 'Staff'))
  WITH CHECK (public.auth_team_role() IN ('Manager', 'Staff'));
CREATE POLICY production_crew_delete ON public.production_crew
  FOR DELETE TO authenticated
  USING (public.auth_team_role() IN ('Manager', 'Staff'));

-- crew_role_slots
DROP POLICY IF EXISTS crew_role_slots_insert ON public.crew_role_slots;
DROP POLICY IF EXISTS crew_role_slots_update ON public.crew_role_slots;
DROP POLICY IF EXISTS crew_role_slots_delete ON public.crew_role_slots;
CREATE POLICY crew_role_slots_insert ON public.crew_role_slots
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_team_role() IN ('Manager', 'Staff'));
CREATE POLICY crew_role_slots_update ON public.crew_role_slots
  FOR UPDATE TO authenticated
  USING (public.auth_team_role() IN ('Manager', 'Staff'))
  WITH CHECK (public.auth_team_role() IN ('Manager', 'Staff'));
CREATE POLICY crew_role_slots_delete ON public.crew_role_slots
  FOR DELETE TO authenticated
  USING (public.auth_team_role() IN ('Manager', 'Staff'));

-- crew_signups
DROP POLICY IF EXISTS crew_signups_insert ON public.crew_signups;
DROP POLICY IF EXISTS crew_signups_update ON public.crew_signups;
DROP POLICY IF EXISTS crew_signups_delete ON public.crew_signups;
CREATE POLICY crew_signups_insert ON public.crew_signups
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_team_role() IN ('Manager', 'Staff'));
CREATE POLICY crew_signups_update ON public.crew_signups
  FOR UPDATE TO authenticated
  USING (public.auth_team_role() IN ('Manager', 'Staff'))
  WITH CHECK (public.auth_team_role() IN ('Manager', 'Staff'));
CREATE POLICY crew_signups_delete ON public.crew_signups
  FOR DELETE TO authenticated
  USING (public.auth_team_role() IN ('Manager', 'Staff'));
