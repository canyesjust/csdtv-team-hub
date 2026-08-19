-- Audio playback state. One row per (show, slot). A one shot plays once, a bed
-- loops under until something stops it. The audio output page reads this.
create table if not exists public.graphics_audio_state (
  show_id    uuid not null references public.graphics_shows(id) on delete cascade,
  slot       text not null check (slot in ('oneshot','bed')),
  asset_id   uuid not null references public.graphics_audio_assets(id) on delete cascade,
  gain_db    numeric(5,1) not null default 0 check (gain_db between -60 and 12),
  loop       boolean not null default false,
  started_at timestamptz not null default now(),
  primary key (show_id, slot)
);

alter table public.graphics_shows
  add column if not exists home_roster_id uuid references public.graphics_rosters(id) on delete set null,
  add column if not exists away_roster_id uuid references public.graphics_rosters(id) on delete set null;

alter table public.graphics_audio_state enable row level security;
drop policy if exists graphics_audio_state_staff_select on public.graphics_audio_state;
drop policy if exists graphics_audio_state_staff_write on public.graphics_audio_state;
create policy graphics_audio_state_staff_select on public.graphics_audio_state
  for select to authenticated using (public.auth_team_role_is_hub_staff());
create policy graphics_audio_state_staff_write on public.graphics_audio_state
  for all to authenticated
  using (public.auth_team_role_is_hub_staff())
  with check (public.auth_team_role_is_hub_staff());

insert into storage.buckets (id, name, public)
values ('graphics-audio', 'graphics-audio', false)
on conflict (id) do nothing;

-- Storage is reached through service-role API routes only, same as the rest of
-- the graphics system, so no anon policies here.
drop policy if exists graphics_audio_staff_all on storage.objects;
create policy graphics_audio_staff_all on storage.objects
  for all to authenticated
  using (bucket_id = 'graphics-audio' and public.auth_team_role_is_hub_staff())
  with check (bucket_id = 'graphics-audio' and public.auth_team_role_is_hub_staff());

comment on table public.graphics_audio_state is
  'Current audio per show. Plays out of its own browser source so it has an independent fader in OBS.';
