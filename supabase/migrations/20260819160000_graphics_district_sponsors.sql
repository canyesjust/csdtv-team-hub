-- District sponsors carry into every new show, switched on by default. School
-- and event scoped ones live on the show's own sponsors jsonb.
create table if not exists public.graphics_sponsors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 160),
  tagline     text check (char_length(tagline) <= 300),
  scope       text not null default 'district' check (scope in ('district', 'school')),
  school_code text,
  logo_path   text,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists graphics_sponsors_touch on public.graphics_sponsors;
create trigger graphics_sponsors_touch before update on public.graphics_sponsors
  for each row execute function public.graphics_touch_updated_at();

alter table public.graphics_sponsors enable row level security;
drop policy if exists graphics_sponsors_staff_select on public.graphics_sponsors;
drop policy if exists graphics_sponsors_staff_write on public.graphics_sponsors;
create policy graphics_sponsors_staff_select on public.graphics_sponsors
  for select to authenticated using (public.auth_team_role_is_hub_staff());
create policy graphics_sponsors_staff_write on public.graphics_sponsors
  for all to authenticated
  using (public.auth_team_role_is_hub_staff())
  with check (public.auth_team_role_is_hub_staff());

comment on table public.graphics_sponsors is
  'District and school sponsors. Attached to every new show switched on; untick one on the show if it should not run tonight.';
