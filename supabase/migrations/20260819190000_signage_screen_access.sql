-- ============================================================================
-- Per-SCREEN access for signage.
--
-- Extends the existing per-site model (signage_site_access) with a narrower
-- grant: a person can be given one screen instead of a whole location.
--
-- Resolution order (union, widest wins per site):
--   * Manager                       -> everything
--   * No grants of any kind         -> everything (legacy fallback, unchanged)
--   * signage_site_access row       -> that whole site
--   * signage_screen_access row     -> only that screen, plus read of the
--                                      site shell it lives in (branding,
--                                      wayfinding, areas it belongs to)
--
-- App-layer writes are gated in lib/signage/server-auth.ts. Service-role API
-- routes bypass RLS, so these policies are defence in depth for the browser
-- (anon-key) client, not the only guard.
-- ============================================================================

-- 1. The grant table.
CREATE TABLE IF NOT EXISTS public.signage_screen_access (
  team_id   uuid NOT NULL REFERENCES public.team(id) ON DELETE CASCADE,
  screen_id uuid NOT NULL REFERENCES public.signage_screens(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, screen_id)
);
CREATE INDEX IF NOT EXISTS idx_signage_screen_access_team   ON public.signage_screen_access (team_id);
CREATE INDEX IF NOT EXISTS idx_signage_screen_access_screen ON public.signage_screen_access (screen_id);

ALTER TABLE public.signage_screen_access ENABLE ROW LEVEL SECURITY;

-- Everyone signed in may read their OWN grants (the dashboard needs this to
-- resolve scope). Managers read all. Writes are manager-only.
DROP POLICY IF EXISTS signage_screen_access_sel ON public.signage_screen_access;
CREATE POLICY signage_screen_access_sel ON public.signage_screen_access
  FOR SELECT TO authenticated
  USING (
    public.signage_is_manager()
    OR team_id IN (SELECT id FROM public.team WHERE supabase_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS signage_screen_access_wr ON public.signage_screen_access;
CREATE POLICY signage_screen_access_wr ON public.signage_screen_access
  FOR ALL TO authenticated
  USING (public.signage_is_manager())
  WITH CHECK (public.signage_is_manager());

-- Same treatment for the older site table, which had no policies of its own.
ALTER TABLE public.signage_site_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signage_site_access_sel ON public.signage_site_access;
CREATE POLICY signage_site_access_sel ON public.signage_site_access
  FOR SELECT TO authenticated
  USING (
    public.signage_is_manager()
    OR team_id IN (SELECT id FROM public.team WHERE supabase_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS signage_site_access_wr ON public.signage_site_access;
CREATE POLICY signage_site_access_wr ON public.signage_site_access
  FOR ALL TO authenticated
  USING (public.signage_is_manager())
  WITH CHECK (public.signage_is_manager());

-- ============================================================================
-- 2. Scope helpers.
-- ============================================================================

-- Screen ids explicitly granted to the current user.
CREATE OR REPLACE FUNCTION public.signage_my_screen_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(sa.screen_id), ARRAY[]::uuid[])
  FROM public.signage_screen_access sa
  JOIN public.team t ON t.id = sa.team_id
  WHERE t.supabase_user_id = (SELECT auth.uid());
$$;

-- Site ids the current user holds a FULL-site grant on.
CREATE OR REPLACE FUNCTION public.signage_my_site_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(sa.site_id), ARRAY[]::uuid[])
  FROM public.signage_site_access sa
  JOIN public.team t ON t.id = sa.team_id
  WHERE t.supabase_user_id = (SELECT auth.uid());
$$;

-- Areas that the current user's granted screens belong to.
CREATE OR REPLACE FUNCTION public.signage_my_screen_area_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT s.area_id) FILTER (WHERE s.area_id IS NOT NULL), ARRAY[]::uuid[])
  FROM public.signage_screens s
  WHERE s.id = ANY (public.signage_my_screen_ids());
$$;

-- Buildings that the current user's granted screens sit in.
CREATE OR REPLACE FUNCTION public.signage_my_screen_buildings()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT s.building) FILTER (WHERE s.building IS NOT NULL), ARRAY[]::text[])
  FROM public.signage_screens s
  WHERE s.id = ANY (public.signage_my_screen_ids());
$$;

-- Does the user have any grant at all? (No grants = legacy "sees everything".)
CREATE OR REPLACE FUNCTION public.signage_has_any_grant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cardinality(public.signage_my_site_ids()) > 0
      OR cardinality(public.signage_my_screen_ids()) > 0;
$$;

-- Full run of a site: manager, legacy no-grant user, or an explicit site grant.
CREATE OR REPLACE FUNCTION public.signage_manages_whole_site(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.signage_is_manager()
    OR NOT public.signage_has_any_grant()
    OR (target IS NOT NULL AND target = ANY (public.signage_my_site_ids()));
$$;

-- Reach into a site at all: full run, OR one of the user's granted screens
-- lives there (so they can read the site's branding, ticker and wayfinding).
CREATE OR REPLACE FUNCTION public.signage_can_access_site(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target IS NULL
    OR public.signage_manages_whole_site(target)
    OR EXISTS (
      SELECT 1 FROM public.signage_screens s
      WHERE s.site_id = target
        AND s.id = ANY (public.signage_my_screen_ids())
    );
$$;

-- A single screen.
CREATE OR REPLACE FUNCTION public.signage_can_access_screen(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target IS NULL
    OR public.signage_is_manager()
    OR NOT public.signage_has_any_grant()
    OR target = ANY (public.signage_my_screen_ids())
    OR EXISTS (
      SELECT 1 FROM public.signage_screens s
      WHERE s.id = target
        AND s.site_id = ANY (public.signage_my_site_ids())
    );
$$;

-- These run inside RLS and must not be callable by anon/PUBLIC.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'signage_my_screen_ids()', 'signage_my_site_ids()', 'signage_my_screen_area_ids()',
    'signage_my_screen_buildings()', 'signage_has_any_grant()',
    'signage_manages_whole_site(uuid)', 'signage_can_access_site(uuid)',
    'signage_can_access_screen(uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM public', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;

-- ============================================================================
-- 3. SELECT policies.
-- ============================================================================

-- Screens: a screen-scoped user sees only their granted screens.
ALTER TABLE public.signage_screens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signage_screens_sel" ON public.signage_screens;
CREATE POLICY "signage_screens_sel" ON public.signage_screens
  FOR SELECT TO authenticated
  USING (public.signage_can_access_screen(id));

-- Areas: full-site users see all of a site's areas; screen-scoped users see
-- only the areas their screens belong to.
ALTER TABLE public.signage_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signage_areas_sel" ON public.signage_areas;
CREATE POLICY "signage_areas_sel" ON public.signage_areas
  FOR SELECT TO authenticated
  USING (
    public.signage_manages_whole_site(site_id)
    OR id = ANY (public.signage_my_screen_area_ids())
  );

-- Content and announcements: a screen-scoped user sees the rows that actually
-- reach one of their screens (all-screens rows, or rows targeting their
-- screen / its area / its building).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['signage_content', 'signage_announcements']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_sel" ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY "%1$s_sel" ON public.%1$I
      FOR SELECT TO authenticated
      USING (
        public.signage_manages_whole_site(site_id)
        OR (
          public.signage_can_access_site(site_id)
          AND (
            all_screens
            OR target_screen_ids && public.signage_my_screen_ids()
            OR target_area_ids   && public.signage_my_screen_area_ids()
            OR target_buildings  && public.signage_my_screen_buildings()
          )
        )
      )
    $f$, t);
  END LOOP;
END $$;

-- Wayfinding and visitors stay site-scoped: both are directory data that a
-- screen-scoped user's screen renders, so seeing the site's set is correct.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['signage_wayfinding', 'signage_visitors']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_sel" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_sel" ON public.%I FOR SELECT TO authenticated USING (public.signage_can_access_site(site_id))',
      t, t
    );
  END LOOP;
END $$;
