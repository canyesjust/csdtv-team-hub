-- ============================================================================
-- Signage tables: SELECT only for the browser. All writes are service-role.
--
-- Every signage write in this app already goes through /api/signage/* on the
-- service-role client, which bypasses RLS. Nothing in the browser bundle writes
-- these tables directly. Leaving browser-reachable write policies in place just
-- created a second, unguarded path around the API's access checks: the previous
-- policies tested only "is a signage editor" (and signage_board_takeover tested
-- nothing at all), so a screen-scoped editor could open devtools and insert
-- content aimed at every screen in the district, delete screens, change
-- branding, or start a board-meeting takeover.
--
-- Rather than mirror the whole scope model in RLS and keep the two in step
-- forever, close the path. lib/signage/server-auth.ts stays the single place
-- access is decided, and the API routes stay the single write surface.
--
-- If a future feature needs a direct browser write, add a scoped policy AND the
-- matching table grant deliberately — do not re-open these wholesale.
-- ============================================================================

DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename LIKE 'signage%'
      AND cmd <> 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;

  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'signage%'
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated, anon', r.relname);
  END LOOP;
END $do$;

-- signage_board_takeover was the one table whose only policy was a FOR ALL that
-- no site or screen check ever covered. Make sure it kept a read policy.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'signage_board_takeover' AND cmd = 'SELECT'
  ) THEN
    EXECUTE 'CREATE POLICY signage_board_takeover_sel ON public.signage_board_takeover
             FOR SELECT TO authenticated USING (public.auth_team_id() IS NOT NULL)';
  END IF;
END $do$;
