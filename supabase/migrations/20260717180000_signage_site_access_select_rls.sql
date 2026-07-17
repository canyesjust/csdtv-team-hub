-- Promoted from db/signage_sites_access_rls.sql (idempotent).
-- App-layer writes are now also gated via assertCanAccessSignageSite in
-- lib/signage/server-auth.ts (service-role routes bypass RLS).
--
-- SELECT scoping:
--   * Managers see every site.
--   * Users with no signage_site_access rows see all sites (legacy fallback).
--   * Users with at least one grant see only granted sites.
--   * NULL site_id rows remain visible to everyone.

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
