-- ============================================================================
-- Close the hole that made every signage "_sel" policy a no-op.
--
-- Each signage table carried a "_wr" policy declared FOR ALL. In Postgres,
-- FOR ALL covers SELECT as well, and permissive policies OR together — so
-- `USING (auth.uid() IS NOT NULL)` quietly granted every signed-in Hub user
-- read of every signage row. The per-site "_sel" policy shipped in
-- 20260717180000 never actually restricted anything, and neither would the
-- per-screen one in 20260819190000.
--
-- Two changes:
--   1. Split "_wr" into explicit INSERT / UPDATE / DELETE, so SELECT is
--      decided by "_sel" alone.
--   2. Narrow the write test from "any signed-in user" to signage staff.
--      Every app write goes through /api/signage/* on the service-role client
--      (which bypasses RLS), so this changes nothing the app does — it only
--      closes the direct anon-key path, where any team member could previously
--      insert content aimed at every screen in the district.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.signage_is_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team
    WHERE supabase_user_id = (SELECT auth.uid())
      AND (lower(role) = 'manager' OR signage_role = 'editor' OR signage_approver IS TRUE)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.signage_is_editor() FROM public;
GRANT EXECUTE ON FUNCTION public.signage_is_editor() TO authenticated;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'signage_screens', 'signage_areas', 'signage_content',
    'signage_announcements', 'signage_wayfinding', 'signage_visitors',
    'signage_sites', 'signage_live', 'signage_settings'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_wr" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_ins" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.signage_is_editor())', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_upd" ON public.%I FOR UPDATE TO authenticated USING (public.signage_is_editor()) WITH CHECK (public.signage_is_editor())', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_del" ON public.%I FOR DELETE TO authenticated USING (public.signage_is_editor())', t, t);
  END LOOP;
END $do$;

-- Locations: a screen-scoped user should see only the site their screen lives
-- in, not every location in the district. (Was: any team member sees all.)
DROP POLICY IF EXISTS "signage_sites_sel" ON public.signage_sites;
CREATE POLICY "signage_sites_sel" ON public.signage_sites
  FOR SELECT TO authenticated
  USING (public.signage_can_access_site(id));

DROP POLICY IF EXISTS "signage_live_sel" ON public.signage_live;
CREATE POLICY "signage_live_sel" ON public.signage_live
  FOR SELECT TO authenticated
  USING (public.signage_can_access_site(site_id));

-- Global settings have no site to scope by; any team member may read them.
DROP POLICY IF EXISTS "signage_settings_sel" ON public.signage_settings;
CREATE POLICY "signage_settings_sel" ON public.signage_settings
  FOR SELECT TO authenticated
  USING (public.auth_team_id() IS NOT NULL);

-- ----------------------------------------------------------------------------
-- Verified against production data (2026-08-19), signage_role = 'editor':
--   no grants   -> 9 screens, 2 sites, 29 areas, 15 content   (legacy, unchanged)
--   site grant  -> 9 screens, 1 site,   4 areas, 13 content
--   screen grant-> 1 screen,  1 site,   1 area,  13 content
-- (content stays high because most rows are all_screens, which do play there)
-- ----------------------------------------------------------------------------
