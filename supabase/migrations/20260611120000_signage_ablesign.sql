alter table public.signage_screens
  add column if not exists ablesign_screen_id bigint,
  add column if not exists ablesign_webapp_id bigint,
  add column if not exists ablesign_synced_at timestamptz,
  add column if not exists ablesign_online boolean,
  add column if not exists ablesign_heartbeat_at timestamptz;

create table if not exists public.signage_ablesign_log (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid references public.signage_screens(id) on delete set null,
  action text not null,
  status text not null,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.signage_ablesign_log enable row level security;

drop policy if exists "ablesign_log_sel" on public.signage_ablesign_log;
create policy "ablesign_log_sel" on public.signage_ablesign_log
  for select to authenticated using (true);
