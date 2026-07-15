-- Close the public (no-login) read exposure of internal ops data.
--
-- RUN THIS AFTER deploying the token-gated /signage board. The board
-- (app/signage/page.tsx) now fetches /api/signage/board with a shared token and
-- the server reads via the service role, so anon no longer needs direct read on
-- these tables. Running this BEFORE the deploy would blank the live board.
--
-- Sensitive PII columns on productions/team were already locked down separately
-- (anon column grants); this removes anon row access entirely.

-- Anon-only "Signage anon select …" policies → drop.
drop policy if exists "Signage anon select productions"        on public.productions;
drop policy if exists "Signage anon select team"               on public.team;
drop policy if exists "Signage anon select production_members" on public.production_members;
drop policy if exists "Signage anon select calendar_events"    on public.calendar_events;
drop policy if exists "Signage anon select schedule_defaults"  on public.schedule_defaults;
drop policy if exists "Signage anon select schedule_overrides" on public.schedule_overrides;

-- Shared anon+authenticated schedule policies → re-scope to team members only
-- (removes anon, keeps team access).
alter policy "schedule_gone_days_select" on public.schedule_gone_days
  to authenticated using (public.auth_team_id() is not null);
alter policy "schedule_office_closed_days_select" on public.schedule_office_closed_days
  to authenticated using (public.auth_team_id() is not null);

-- schools stays anon-readable (public reference data: names, addresses, colors).
