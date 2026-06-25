-- AbleSign HTML push — scheduled regenerate-and-push via Supabase pg_cron.
--
-- Run this in the Supabase SQL editor (dashboard), NOT in the repo / Next build.
-- The API route it calls lives in the repo:
--   /api/signage/push-all?mode=due   → render all linked screens; the content-hash
--                                       skip means only screens whose HTML actually
--                                       changed (weather, date rollovers, edits)
--                                       get re-pushed.
--   /api/signage/push-all?mode=dirty → (still supported) push only screens flagged
--                                       by a recent content edit. Not scheduled by
--                                       default; the hourly due pass + the manual
--                                       "Regenerate & Push" button cover the need.
--
-- Cadence: one hourly refresh keeps screens from drifting (weather, date-range
-- rollovers) with minimal churn. For "make it live now," staff use the per-screen
-- Regenerate & Push button in the dashboard, which pushes immediately.
--
-- Quiet hours: the route skips automatic refreshes between 10pm and 5am Mountain
-- Time (enforced in code so it tracks daylight saving — that's why the cron is a
-- plain hourly schedule rather than a UTC hour range that would drift twice a
-- year). The hourly call still fires overnight but returns a no-op.
--
-- Auth: matches the other Supabase crons — the route checks the
-- 'x-signage-push-token' header against app_settings.signage_html_push_cron_token,
-- so no Vercel env var or service-role key is embedded here. The token is read
-- from the DB at run time.

-- ── One-time: create the cron auth token if it doesn't exist ───────────────────
INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'signage_html_push_cron_token',
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  now()
)
ON CONFLICT (key) DO NOTHING;

-- ── Hourly refresh ─────────────────────────────────────────────────────────────
SELECT cron.unschedule('signage-html-push-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'signage-html-push-hourly');

SELECT cron.schedule(
  'signage-html-push-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.csdtvstaff.org/api/signage/push-all?mode=due',
    headers := jsonb_build_object(
      'x-signage-push-token', (SELECT value FROM app_settings WHERE key = 'signage_html_push_cron_token' LIMIT 1)
    )
  );
  $$
);
