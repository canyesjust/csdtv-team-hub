-- Canyons Innovation Center signage (areas, screens, content, announcements, wayfinding, visitors, live, settings)

alter table public.team add column if not exists signage_approver boolean not null default false;

create table if not exists public.signage_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  building text,
  floor int,
  slug text unique not null,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.signage_screens (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  area_id uuid references public.signage_areas(id),
  building text,
  floor int,
  orientation text not null default 'landscape',
  layout text not null default 'zoned',
  wayfinding_heading text,
  accepts_takeover boolean not null default true,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists signage_screens_area_idx on public.signage_screens(area_id);

create table if not exists public.signage_content (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'image',
  title text,
  media_path text not null,
  thumb_path text,
  all_screens boolean not null default false,
  target_area_ids uuid[] not null default '{}',
  target_screen_ids uuid[] not null default '{}',
  full_screen boolean not null default false,
  start_date date not null,
  end_date date not null,
  priority int not null default 0,
  status text not null default 'pending',
  submitter_name text,
  submitter_email text,
  requested_note text,
  reject_reason text,
  terms_accepted_at timestamptz,
  reviewed_by uuid references public.team(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists signage_content_resolve_idx on public.signage_content(status, start_date, end_date);

create table if not exists public.signage_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  all_screens boolean not null default false,
  target_area_ids uuid[] not null default '{}',
  target_screen_ids uuid[] not null default '{}',
  start_date date not null,
  end_date date not null,
  priority int not null default 0,
  in_ticker boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists signage_ann_resolve_idx on public.signage_announcements(active, start_date, end_date);

create table if not exists public.signage_wayfinding (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references public.signage_areas(id),
  destination text not null,
  direction text not null,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.signage_visitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  visit_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists signage_visitors_date_idx on public.signage_visitors(visit_date, active);

create table if not exists public.signage_live (
  id int primary key default 1,
  is_live boolean not null default false,
  hls_url text,
  label text,
  all_screens boolean not null default true,
  target_area_ids uuid[] not null default '{}',
  target_screen_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint signage_live_one_row check (id = 1)
);
insert into public.signage_live (id) values (1) on conflict (id) do nothing;

create table if not exists public.signage_settings (
  id int primary key default 1,
  center_name text default 'Canyons Innovation Center',
  weather_lat numeric default 40.5649,
  weather_lon numeric default -111.8389,
  ticker_extra text,
  constraint signage_settings_one_row check (id = 1)
);
insert into public.signage_settings (id) values (1) on conflict (id) do nothing;

alter table public.signage_areas enable row level security;
alter table public.signage_screens enable row level security;
alter table public.signage_content enable row level security;
alter table public.signage_announcements enable row level security;
alter table public.signage_wayfinding enable row level security;
alter table public.signage_visitors enable row level security;
alter table public.signage_live enable row level security;
alter table public.signage_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['signage_areas','signage_screens','signage_content','signage_announcements','signage_wayfinding','signage_visitors','signage_live','signage_settings']
  loop
    execute format('drop policy if exists "%s_sel" on public.%I', t, t);
    execute format('create policy "%s_sel" on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists "%s_wr" on public.%I', t, t);
    execute format('create policy "%s_wr" on public.%I for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)', t, t);
  end loop;
end $$;
