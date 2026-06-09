-- Allow Staff, Intern, and Student Intern to add/edit equipment (matches lib/equipment-access.ts).
-- Managers and Staff retain delete; categories/kits stay manager-only.

CREATE OR REPLACE FUNCTION public.auth_team_can_edit_equipment()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_team_role() IN ('Manager', 'Staff', 'Intern', 'Student Intern');
$$;

CREATE OR REPLACE FUNCTION public.auth_team_can_delete_equipment()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_team_role() IN ('Manager', 'Staff');
$$;

REVOKE ALL ON FUNCTION public.auth_team_can_edit_equipment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_team_can_edit_equipment() TO authenticated;
REVOKE ALL ON FUNCTION public.auth_team_can_delete_equipment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_team_can_delete_equipment() TO authenticated;

DROP POLICY IF EXISTS "Managers can insert equipment" ON public.equipment;
CREATE POLICY "Team editors can insert equipment"
ON public.equipment
FOR INSERT
TO authenticated
WITH CHECK (public.auth_team_can_edit_equipment());

DROP POLICY IF EXISTS "Managers can update equipment" ON public.equipment;
CREATE POLICY "Team editors can update equipment"
ON public.equipment
FOR UPDATE
TO authenticated
USING (public.auth_team_can_edit_equipment())
WITH CHECK (public.auth_team_can_edit_equipment());

DROP POLICY IF EXISTS "Managers can delete equipment" ON public.equipment;
CREATE POLICY "Staff can delete equipment"
ON public.equipment
FOR DELETE
TO authenticated
USING (public.auth_team_can_delete_equipment());
