-- ============================================================================
-- An unassigned signage-only editor reaches nothing.
--
-- The "no grants at all = sees everything" fallback exists to protect people who
-- predate the per-site access model. Someone invited as signage-only
-- (team.signage_role = 'editor', set from Settings → Invite team member) cannot
-- predate it, so for them "unassigned" must mean unassigned, not "the whole
-- district". Without this, inviting someone as signage-only and not yet giving
-- them a screen would hand them every location.
--
-- Mirrors resolveSignageScope() in lib/signage/access-scope.ts — keep in step.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.signage_is_signage_only()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team
    WHERE supabase_user_id = (SELECT auth.uid())
      AND signage_role = 'editor'
      AND lower(role) <> 'manager'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.signage_is_signage_only() FROM public;
GRANT EXECUTE ON FUNCTION public.signage_is_signage_only() TO authenticated;

-- The one place the legacy fallback is decided. Everything else reads through it.
CREATE OR REPLACE FUNCTION public.signage_manages_whole_site(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.signage_is_manager()
    OR (NOT public.signage_has_any_grant() AND NOT public.signage_is_signage_only())
    OR (target IS NOT NULL AND target = ANY (public.signage_my_site_ids()));
$$;

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
    OR (NOT public.signage_has_any_grant() AND NOT public.signage_is_signage_only())
    OR target = ANY (public.signage_my_screen_ids())
    OR EXISTS (
      SELECT 1 FROM public.signage_screens s
      WHERE s.id = target
        AND s.site_id = ANY (public.signage_my_site_ids())
    );
$$;
