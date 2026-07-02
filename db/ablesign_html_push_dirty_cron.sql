-- AbleSign HTML push — FAST "dirty" pass via Supabase pg_cron.
--
-- Run this in the Supabase SQL editor (dashboard), NOT in the repo / Next build.
--
-- Companion to db/ablesign_html_push_cron.sql (the hourly `mode=due` refresh).
-- This one drives the short-cadence `mode=dirty` pass so that content edits and
-- deletions (which flag the affected screens via markScreensDirty) reach the
-- AbleSign sticks within a couple of minutes instead of waiting up to an hour
-- for the next hourly push.
--
--   /api/signage/push-all?mode=dirty  → push ONLY screens flagged dirty by a
--                                       recent edit/delete. A no-op (0 screens)
--                                       when nothing changed, so it's cheap.
--
-- Quiet hours: the route still skips automatic pushes 10pm–5am Mountain Time
-- (enforced in code), so this hourly-safe schedule needs no UTC adjustment.
--
-- Auth: same token as the other signage crons — the route checks the
-- 'x-signage-push-token' header against app_settings.signage_html_push_cron_token.
-- (Created by db/ablesign_html_push_cron.sql; safe to run this file after that.)

SELECT cron.unschedule('signage-html-push-dirty')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'signage-html-push-dirty');

SELECT cron.schedule(
  'signage-html-push-dirty',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.csdtvstaff.org/api/signage/push-all?mode=dirty',
    headers := jsonb_build_object(
      'x-signage-push-token', (SELECT value FROM app_settings WHERE key = 'signage_html_push_cron_token' LIMIT 1)
    )
  );
  $$
);
