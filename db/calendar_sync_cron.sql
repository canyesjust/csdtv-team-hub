-- Calendar suite: ICS sync cron. Applied directly via Supabase MCP (execute_sql +
-- deploy_edge_function), not through this repo -- saved here only as the schema
-- record, per the repo's "SQL also gets saved in db/<feature>.sql" convention.
--
-- Pattern mirrors db/daily_digest_cron.sql: pg_cron calls a Supabase scheduled
-- Edge Function (deployed via the dashboard/MCP, never committed to this repo --
-- see the "never put edge function files in the repo" rule in CLAUDE.md), which
-- in turn calls this app's Next.js route with the CRON_SECRET bearer.
--
-- Next.js route: app/api/cron/calendar-sync/route.ts (in this repo).
-- Edge Function: calendar-sync-cron (Supabase dashboard only).

-- 1. Random shared secret the pg_cron job passes to the edge function, so the
--    edge function can tell a real cron firing from a random request. The
--    edge function then uses its own CRON_SECRET (or falls back to
--    SUPABASE_SERVICE_ROLE_KEY) to authenticate to the Next.js route -- see
--    lib/server/cron-auth.ts, which already accepts either.
insert into app_settings (key, value)
values ('calendar_sync_cron_token', encode(gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- 2. Schedule: every 4 hours. Adjust the cron expression if school feeds need
--    to be checked more/less often.
select cron.schedule(
  'calendar-sync-cron',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pmzhpatxnngiagfzwkul.supabase.co/functions/v1/calendar-sync-cron',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtemhwYXR4bm5naWFnZnp3a3VsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxODAwNDUsImV4cCI6MjA5MDc1NjA0NX0.vyQr8mI_YzdVTN-46aJAnLh5JpX9F3ofN9M7-REUcV8',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtemhwYXR4bm5naWFnZnp3a3VsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxODAwNDUsImV4cCI6MjA5MDc1NjA0NX0.vyQr8mI_YzdVTN-46aJAnLh5JpX9F3ofN9M7-REUcV8',
      -- Public anon key, same one already embedded in every other db/*_cron.sql file in
      -- this repo and shipped in the browser bundle -- not a secret, just a routing key.
      'x-calendar-sync-cron-token', (SELECT value FROM app_settings WHERE key = 'calendar_sync_cron_token' LIMIT 1)
    )
  ) AS request_id;
  $$
);

-- To change the schedule later:
--   select cron.alter_job((select jobid from cron.job where jobname = 'calendar-sync-cron'), schedule := '0 */2 * * *');
-- To run it manually right now (bypasses the schedule):
--   select net.http_post(url := 'https://pmzhpatxnngiagfzwkul.supabase.co/functions/v1/calendar-sync-cron', headers := jsonb_build_object('x-calendar-sync-cron-token', (SELECT value FROM app_settings WHERE key = 'calendar_sync_cron_token' LIMIT 1)));
