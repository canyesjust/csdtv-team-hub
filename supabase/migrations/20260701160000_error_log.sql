-- Site error log. The app writes here (via the service role) when a page throws or an
-- API route hits an unexpected error, so failures are captured and can trigger an email
-- alert instead of only landing in Vercel logs. Service-role only (RLS on, no policies).

create table if not exists public.error_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null default 'client',   -- 'client' | 'server' | 'api'
  message text,
  message_hash text,                      -- for de-duping repeated errors
  stack text,
  url text,
  digest text,                            -- Next.js error digest, when present
  user_agent text,
  emailed boolean not null default false
);

create index if not exists error_log_created_idx on public.error_log (created_at desc);
create index if not exists error_log_hash_idx on public.error_log (message_hash, created_at desc);

alter table public.error_log enable row level security;
-- No policies: only the server-side service role reads/writes this table.
