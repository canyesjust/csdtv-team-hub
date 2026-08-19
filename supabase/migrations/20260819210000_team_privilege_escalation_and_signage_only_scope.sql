-- ============================================================================
-- Two security fixes found while auditing the signage-only tier. Both were
-- reachable in production; the first is critical and predates signage entirely.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CRITICAL: any signed-in user could make themselves a Manager.
--
-- Policy `team_update` was FOR UPDATE TO PUBLIC with
--   USING (is_manager() OR supabase_user_id = auth.uid())
-- and NO WITH CHECK, so Postgres reuses USING as the check. Updating your own
-- row passed both halves no matter WHICH column you changed, and `authenticated`
-- held UPDATE on all 14 columns including `role`. One line in a browser console:
--
--   supabase.from('team').update({ role: 'Manager' }).eq('supabase_user_id', myUid)
--
-- Verified exploitable against production before this migration: a Student
-- Intern became a Manager and is_manager() immediately returned true.
--
-- RLS policies can't compare OLD vs NEW, so the fix is column-level grants.
-- `authenticated` keeps UPDATE only on the fields people genuinely self-edit;
-- everything privileged is service-role only, via the admin API routes.
-- ---------------------------------------------------------------------------

REVOKE UPDATE, INSERT ON public.team FROM authenticated, anon;

-- Settings → Profile writes name/email/avatar_color on your own row
-- (app/dashboard/settings/page.tsx). avatar_url is the avatar upload.
-- supabase_user_id must stay grantable for the onboarding claim (policy
-- `team_link_own_supabase_user`, which only fires when supabase_user_id IS NULL
-- and the JWT email matches); pointing it at anyone else's uid still fails
-- team_update's WITH CHECK.
GRANT UPDATE (name, email, avatar_color, avatar_url, supabase_user_id)
  ON public.team TO authenticated;

-- Give team_update an explicit WITH CHECK so the intent is readable in psql
-- rather than relying on the reused-USING default that caused this.
DROP POLICY IF EXISTS team_update ON public.team;
CREATE POLICY team_update ON public.team
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_manager()) OR supabase_user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.is_manager()) OR supabase_user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. A signage-only editor is not Hub staff.
--
-- `auth_team_role_is_hub_staff()` read team.role only. Someone invited as
-- "Signage only" keeps role = 'Staff' (the invite form's default), so they
-- satisfied it and reached the 17 tables gated on it — productions, tasks,
-- equipment, graphics, onboarding, the team roster — read and write, straight
-- through PostgREST with the public anon key. middleware.ts blocks page
-- navigation, not REST calls, so the UI lock was the only thing holding.
--
-- signage_role = 'editor' means "this person only runs screens". Say so once
-- here instead of in 17 separate policies.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_team_role_is_hub_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team
    WHERE id = public.auth_team_id()
      AND role IN ('Manager', 'Staff', 'Intern', 'Production Focus')
      AND (signage_role IS DISTINCT FROM 'editor' OR role = 'Manager')
  );
$$;

-- ---------------------------------------------------------------------------
-- STILL OPEN, deliberately not changed here: 50 tables have SELECT policies of
-- the form `auth_team_id() IS NOT NULL`, i.e. any team member reads everything.
-- Tightening those is a separate piece of work with real blast radius — see
-- docs/signage-access.md.
-- ---------------------------------------------------------------------------
