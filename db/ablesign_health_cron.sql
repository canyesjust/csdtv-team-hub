-- AbleSign online-status refresh — Supabase pg_cron, every 12 minutes.
--
-- Run this in the Supabase SQL editor (dashboard), NOT in the repo / Next build.
-- This is what populates each linked screen's online/offline light. Without it,
-- status stays "unknown/checking" — the app only refreshes on the manual
-- "Refresh online status" button on the Floor plan page otherwise.
--
-- Auth: uses the same durable token as the HTML-push crons
-- (app_settings.signage_html_push_cron_token) — no Vercel CRON_SECRET needed.
-- Run db/ablesign_html_push_cron.sql first if that token doesn't exist yet.

SELECT cron.unschedule('signage-ablesign-health')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'signage-ablesign-health');

SELECT cron.schedule(
  'signage-ablesign-health',
  '*/12 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.csdtvstaff.org/api/signage/ablesign/health',
    headers := jsonb_build_object(
      'x-signage-push-token', (SELECT value FROM app_settings WHERE key = 'signage_html_push_cron_token' LIMIT 1)
    )
  );
  $$
);
