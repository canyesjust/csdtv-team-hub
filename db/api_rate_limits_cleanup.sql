-- Rate-limit table housekeeping.
--
-- lib/server/rate-limit.ts inserts one row per request into api_rate_limits and
-- counts rows within a short window. Nothing deletes those rows, so without this
-- the table grows forever. This prunes anything older than a day (windows are
-- minutes, so a day is an ample safety margin) on an hourly pg_cron schedule.
--
-- Safe to run multiple times (idempotent).

create or replace function public.prune_api_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.api_rate_limits
  where created_at < now() - interval '1 day';
$$;

-- Keep this helper out of the public REST surface. Revoke FROM PUBLIC because
-- functions are granted to PUBLIC by default (anon/authenticated inherit it).
revoke execute on function public.prune_api_rate_limits() from public;

-- Schedule hourly cleanup via pg_cron (no-op if already scheduled).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('prune_api_rate_limits')
      where exists (select 1 from cron.job where jobname = 'prune_api_rate_limits');
    perform cron.schedule(
      'prune_api_rate_limits',
      '7 * * * *',                       -- hourly at :07
      $cron$ select public.prune_api_rate_limits(); $cron$
    );
  end if;
end;
$$;
