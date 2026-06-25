-- ============================================================================
-- Per-site SELECT scoping for signage (the deferred "signage-only role" phase).
-- Idempotent. REVIEW, then run in Supabase. Test with a NON-manager account
-- before relying on it.
--
-- What this does
--   * Managers (team.role = 'Manager') keep full visibility of every site.
--   * Everyone else sees only rows for sites they've been granted via
--     public.signage_site_access. A user with NO grants sees nothing in the
--     site-scoped tables (the app layer falls back to "all sites" for legacy
--     approvers, but the database is strict — grant sites explicitly).
--   * Rows with a NULL site_id stay visible to everyone (defensive; all seeded
--     rows were stamped with the CIC site in signage_sites_foundation.sql).
--
-- What this does NOT change
--   * Writes. The app performs all signage writes through the service-role key
--     (server API routes gated by requireManagerApi / requireSignageApproverApi),
--     which bypasses RLS. The permissive "_wr" policies from cic_signage.sql are
--     left untouched so nothing breaks.
--   * signage_live / signage_settings — these are not site-scoped.
--
-- Rollback: re-run cic_signage.sql (its DO block recreates the open "_sel"
-- policies), or see the commented block at the bottom.
-- ============================================================================

-- 1. Helper: is the current auth user a Manager?
CREATE OR REPLACE FUNCTION public.signage_is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team
    WHERE supabase_user_id = auth.uid()
      AND lower(role) = 'manager'
  );
$$;

-- 2. Helper: can the current auth user see a given site?
--    Managers see all. A user with NO grants at all also sees all (matches the
--    app-layer fallback so legacy approvers aren't locked out). Once a user has
--    at least one grant, they're restricted to their granted sites.
CREATE OR REPLACE FUNCTION public.signage_can_access_site(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target IS NULL
    OR public.signage_is_manager()
    OR NOT EXISTS (
      SELECT 1
      FROM public.signage_site_access sa
      JOIN public.team t ON t.id = sa.team_id
      WHERE t.supabase_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.signage_site_access sa
      JOIN public.team t ON t.id = sa.team_id
      WHERE sa.site_id = target
        AND t.supabase_user_id = auth.uid()
    );
$$;

-- 3. Replace the open SELECT policies on the site-scoped tables with site-aware
--    ones. Write ("_wr") policies are intentionally left as-is.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'signage_areas','signage_screens','signage_content',
    'signage_announcements','signage_wayfinding','signage_visitors'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_sel" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_sel" ON public.%I FOR SELECT TO authenticated USING (public.signage_can_access_site(site_id))',
      t, t
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to revert to fully-open SELECT):
-- DO $$
-- DECLARE t text;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY[
--     'signage_areas','signage_screens','signage_content',
--     'signage_announcements','signage_wayfinding','signage_visitors'
--   ]
--   LOOP
--     EXECUTE format('DROP POLICY IF EXISTS "%s_sel" ON public.%I', t, t);
--     EXECUTE format('CREATE POLICY "%s_sel" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
--   END LOOP;
-- END $$;
-- DROP FUNCTION IF EXISTS public.signage_can_access_site(uuid);
-- DROP FUNCTION IF EXISTS public.signage_is_manager();
