-- Point scheduled email at the Next.js daily digest (replaces legacy daily-summary edge fn).
-- Run once in Supabase SQL Editor after deploying the daily-digest-cron edge function.
--
-- Requires pg_net. Edge function needs verify_jwt = false.
-- Replace YOUR_ANON_JWT with the project's anon key (Settings → API → anon legacy JWT).

INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'daily_digest_cron_token',
  encode(gen_random_bytes(32), 'hex'),
  now()
)
ON CONFLICT (key) DO NOTHING;

SELECT cron.unschedule('daily-summary-email');

SELECT cron.unschedule('daily-staff-digest');

SELECT cron.schedule(
  'daily-staff-digest',
  '0 15 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://pmzhpatxnngiagfzwkul.supabase.co/functions/v1/daily-digest-cron',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'YOUR_ANON_JWT',
      'Authorization', 'Bearer YOUR_ANON_JWT',
      'x-digest-cron-token', (
        SELECT value FROM app_settings WHERE key = 'daily_digest_cron_token' LIMIT 1
      )
    )
  ) AS request_id;
  $$
);
