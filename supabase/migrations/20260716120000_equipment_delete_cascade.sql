-- Let Manager/Staff delete an equipment record cleanly.
--
-- The RLS DELETE policy ("Staff can delete equipment") and the role helper
-- auth_team_can_delete_equipment() already exist (see equipment_editor_rls.sql).
-- The blocker was the child foreign keys: equipment_activity.equipment_id and
-- equipment_loans.equipment_id were ON DELETE NO ACTION, so deleting any item
-- that had activity or loan history threw a foreign-key violation.
--
-- Switch both to ON DELETE CASCADE so removing an equipment row also removes its
-- activity log and loan history. (equipment_kit_items.equipment_id already
-- cascades; child power cables' parent_equipment_id already SET NULL on delete.)

ALTER TABLE public.equipment_activity
  DROP CONSTRAINT equipment_activity_equipment_id_fkey,
  ADD CONSTRAINT equipment_activity_equipment_id_fkey
    FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;

ALTER TABLE public.equipment_loans
  DROP CONSTRAINT equipment_loans_equipment_id_fkey,
  ADD CONSTRAINT equipment_loans_equipment_id_fkey
    FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;
