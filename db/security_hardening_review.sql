-- ============================================================================
-- Security hardening — REVIEW BEFORE APPLYING.
--
-- These statements address Supabase advisor warnings found in the June 24, 2026
-- security review (see docs/security-review-2026-06-24.md). They are NOT applied
-- automatically because they change data-access behavior; confirm each block
-- against how your clients actually call the database before running it.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- M4 — REVERTED. DO NOT revoke EXECUTE on the auth/permission helper functions.
--
-- The Supabase advisor flags auth_team_id(), is_manager(),
-- auth_team_role_is_hub_staff(), signage_is_manager(), etc. as executable by
-- anon/authenticated. They ARE — and they MUST stay that way: these functions
-- are called from inside RLS policy expressions, and PostgreSQL evaluates a
-- policy as the *querying* role. That role needs EXECUTE on any function the
-- policy calls, even though the function is SECURITY DEFINER. Revoking EXECUTE
-- broke account linking ("permission denied for function
-- auth_team_role_is_hub_staff") and every other RLS path that uses them.
--
-- These advisor findings are therefore ACCEPTED. Unauthorized callers get
-- null/false back anyway (the functions read auth.uid()). Left intentionally.
--
-- The only genuinely safe revoke is anon on the action functions below — they
-- are not used in RLS and anonymous users never call them. (recompute_* and
-- generate_recurring_tasks must remain callable by `authenticated`: the app
-- calls them via supabase.rpc() — productions page, reports page, task
-- recurrence.)
-- ----------------------------------------------------------------------------
revoke execute on function public.generate_recurring_tasks(date) from anon;
revoke execute on function public.recompute_all_estimated_costs() from anon;
revoke execute on function public.recompute_one_estimated_cost(uuid) from anon;


-- ----------------------------------------------------------------------------
-- L3 — Pin search_path on the cost-recompute functions to avoid search-path
-- injection. (CREATE OR REPLACE preserves the body; only the setting changes.)
-- ----------------------------------------------------------------------------
alter function public.recompute_all_estimated_costs() set search_path = public;
alter function public.recompute_one_estimated_cost(uuid) set search_path = public;


-- ----------------------------------------------------------------------------
-- M5 — APPLIED 2026-06-24. Writes on the board control tables are limited to hub
-- staff; auth_team_role_is_hub_staff() returns true for Manager/Staff/Intern/
-- Production Focus and false for 'Student Intern'. The existing *_read SELECT
-- policies (using true) remain, so reads stay open to all authenticated users.
-- ----------------------------------------------------------------------------
drop policy if exists "board_bell_settings_write" on public.board_bell_settings;
create policy "board_bell_settings_manage" on public.board_bell_settings
  for all to authenticated
  using (public.auth_team_role_is_hub_staff())
  with check (public.auth_team_role_is_hub_staff());

drop policy if exists "signage_board_takeover_write" on public.signage_board_takeover;
create policy "signage_board_takeover_manage" on public.signage_board_takeover
  for all to authenticated
  using (public.auth_team_role_is_hub_staff())
  with check (public.auth_team_role_is_hub_staff());


-- ----------------------------------------------------------------------------
-- M6 — APPLIED 2026-06-24. Dropped the broad object-listing policies on the
-- public buckets. Public URL access is unaffected (public buckets serve
-- /object/public/* without RLS); uploads and server-side list/download use the
-- service role, which bypasses RLS.
-- ----------------------------------------------------------------------------
drop policy if exists "lower_third_photos_public_read" on storage.objects;
drop policy if exists "school-logos public read" on storage.objects;
drop policy if exists "sig_assets_public_read" on storage.objects;
drop policy if exists "signage_media_public_read" on storage.objects;
drop policy if exists "signage_submissions_public_read" on storage.objects;
