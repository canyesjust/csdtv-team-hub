-- Student interns and other editors can manage kits (create, add items, check out via app).

DROP POLICY IF EXISTS "Managers can insert equipment_kits" ON public.equipment_kits;
CREATE POLICY "Team editors can insert equipment_kits"
ON public.equipment_kits
FOR INSERT
TO authenticated
WITH CHECK (public.auth_team_can_edit_equipment());

DROP POLICY IF EXISTS "Managers can update equipment_kits" ON public.equipment_kits;
CREATE POLICY "Team editors can update equipment_kits"
ON public.equipment_kits
FOR UPDATE
TO authenticated
USING (public.auth_team_can_edit_equipment())
WITH CHECK (public.auth_team_can_edit_equipment());

DROP POLICY IF EXISTS "Managers can delete equipment_kits" ON public.equipment_kits;
CREATE POLICY "Staff can delete equipment_kits"
ON public.equipment_kits
FOR DELETE
TO authenticated
USING (public.auth_team_can_delete_equipment());

DROP POLICY IF EXISTS "Managers can insert kit items" ON public.equipment_kit_items;
CREATE POLICY "Team editors can insert kit items"
ON public.equipment_kit_items
FOR INSERT
TO authenticated
WITH CHECK (public.auth_team_can_edit_equipment());

DROP POLICY IF EXISTS "Managers can delete kit items" ON public.equipment_kit_items;
CREATE POLICY "Team editors can delete kit items"
ON public.equipment_kit_items
FOR DELETE
TO authenticated
USING (public.auth_team_can_edit_equipment());
