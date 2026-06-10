-- Optional: refresh AbleSign online status every 12 minutes via Supabase pg_cron.
-- Use only if Vercel Cron is unavailable on your plan.
--
-- 1. Set CRON_SECRET in Vercel (same value used below).
-- 2. Replace the Bearer token and SITE_URL before running.

SELECT cron.unschedule('signage-ablesign-health')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'signage-ablesign-health');

SELECT cron.schedule(
  'signage-ablesign-health',
  '*/12 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.csdtvstaff.org/api/signage/ablesign/health',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_CRON_SECRET_HERE'
    )
  );
  $$
);
