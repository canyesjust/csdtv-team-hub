-- Weekly Team Hub backup (Sunday ~2:00 AM America/Denver ≈ 09:00 UTC).
-- Run once in Supabase SQL Editor after deploying weekly-backup-cron edge function.
--
-- Requires pg_net. Edge function: verify_jwt = false.
-- Replace YOUR_ANON_JWT with the project anon key (Settings → API).

INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'weekly_backup_cron_token',
  encode(gen_random_bytes(32), 'hex'),
  now()
)
ON CONFLICT (key) DO NOTHING;

-- Safe to re-run: unschedule only if the job already exists.
DO $body$
BEGIN
  PERFORM cron.unschedule('weekly-team-hub-backup');
EXCEPTION
  WHEN OTHERS THEN NULL;
END
$body$;

SELECT cron.schedule(
  'weekly-team-hub-backup',
  '0 9 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://pmzhpatxnngiagfzwkul.supabase.co/functions/v1/weekly-backup-cron',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'YOUR_ANON_JWT',
      'Authorization', 'Bearer YOUR_ANON_JWT',
      'x-weekly-backup-cron-token', (
        SELECT value FROM app_settings WHERE key = 'weekly_backup_cron_token' LIMIT 1
      )
    )
  ) AS request_id;
  $$
);
