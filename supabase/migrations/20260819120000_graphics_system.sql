-- ============================================================================
-- Live graphics system: rundown-driven graphics for concerts, games, parades
-- and ceremonies. Separate from the board-meeting graphics, which keep their
-- own tables and output channels.
--
-- Shape: a show owns ordered rows. A row can carry a graphic and an audio cue.
-- The graphics rundown is the show rundown filtered to rows that carry one.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- helpers --
create or replace function public.graphics_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------------------- channels --
-- One row per production machine. URLs belong to machines, not to shows, so a
-- browser source is pasted into OBS once and never touched again.
create table if not exists public.graphics_channels (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$'),
  name          text not null check (char_length(name) between 1 and 80),
  note          text check (char_length(note) <= 200),
  output_token  text not null default encode(gen_random_bytes(24), 'hex'),
  listening     boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------ shows --
create table if not exists public.graphics_shows (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 160),
  event_type     text not null default 'other'
                 check (event_type in ('concert','game','parade','ceremony','other')),
  state          text not null default 'draft'
                 check (state in ('draft','rehearsal','live','done')),
  show_date      date,
  air_at         timestamptz,
  hard_out_at    timestamptz,
  venue          text check (char_length(venue) <= 160),
  school_code    text,
  away_code      text,
  channel_id     uuid references public.graphics_channels(id) on delete set null,
  package_id     uuid,
  production_id  uuid,
  theme_override jsonb,
  sponsors       jsonb not null default '[]'::jsonb,
  started_at     timestamptz,
  ended_at       timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists graphics_shows_channel_idx on public.graphics_shows (channel_id);
create index if not exists graphics_shows_date_idx    on public.graphics_shows (show_date desc);
-- At most one live show per channel.
create unique index if not exists graphics_shows_one_live_per_channel
  on public.graphics_shows (channel_id) where (state = 'live' and channel_id is not null);

-- ----------------------------------------------------------------- blocks --
create table if not exists public.graphics_blocks (
  id          uuid primary key default gen_random_uuid(),
  show_id     uuid not null references public.graphics_shows(id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 60),
  anchor_type text not null default 'none'
              check (anchor_type in ('none','hard_start','hard_out','soft_target')),
  anchor_at   timestamptz,
  sort_order  numeric(12,4) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists graphics_blocks_show_idx on public.graphics_blocks (show_id, sort_order);

-- ------------------------------------------------------------------- rows --
-- sort_order steps by 10 so a row can be inserted between two others without
-- renumbering the whole rundown.
create table if not exists public.graphics_rows (
  id                uuid primary key default gen_random_uuid(),
  show_id           uuid not null references public.graphics_shows(id) on delete cascade,
  block_id          uuid references public.graphics_blocks(id) on delete set null,
  page              text not null default '' check (char_length(page) <= 12),
  slug              text not null default '' check (char_length(slug) <= 200),
  form              text not null default 'LIVE' check (char_length(form) <= 12),
  est_seconds       integer not null default 60 check (est_seconds between 0 and 86400),
  repeat_count      integer not null default 0 check (repeat_count between 0 and 2000),
  per_unit_seconds  integer not null default 0 check (per_unit_seconds between 0 and 600),
  talent            text default '' check (char_length(talent) <= 200),
  video             text default '' check (char_length(video) <= 120),
  camera            text default '' check (char_length(camera) <= 120),
  audio_source      text default '' check (char_length(audio_source) <= 120),
  script            text default '' check (char_length(script) <= 20000),
  ifb               text default '' check (char_length(ifb) <= 2000),
  notes             text default '' check (char_length(notes) <= 2000),
  graphic           jsonb,
  audio_cue         jsonb,
  hold_full         boolean not null default false,
  is_break          boolean not null default false,
  floated           boolean not null default false,
  approved          boolean not null default false,
  sort_order        numeric(12,4) not null default 0,
  started_at        timestamptz,
  ended_at          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists graphics_rows_show_idx on public.graphics_rows (show_id, sort_order);

-- ------------------------------------------------------------------ shelf --
-- Floaters and ad-libs. Never in the running order, never in the timing, and
-- never cleared by a take. This is what the graphics operator owns.
create table if not exists public.graphics_shelf_items (
  id         uuid primary key default gen_random_uuid(),
  show_id    uuid not null references public.graphics_shows(id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 80),
  graphic    jsonb,
  audio_cue  jsonb,
  sort_order numeric(12,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists graphics_shelf_show_idx on public.graphics_shelf_items (show_id, sort_order);

-- ---------------------------------------------------------------- on air ---
-- One row per (show, layer). This doubles as the as-run log source for
-- chapters and the sponsor report.
create table if not exists public.graphics_air (
  show_id     uuid not null references public.graphics_shows(id) on delete cascade,
  layer       text not null check (layer in ('full','lower','corner','ticker')),
  graphic     jsonb not null,
  source      text not null default 'row' check (source in ('row','shelf')),
  row_id      uuid references public.graphics_rows(id) on delete set null,
  out_seconds integer not null default 0 check (out_seconds between 0 and 3600),
  taken_at    timestamptz not null default now(),
  primary key (show_id, layer)
);

create table if not exists public.graphics_air_log (
  id       bigserial primary key,
  show_id  uuid not null references public.graphics_shows(id) on delete cascade,
  layer    text not null,
  graphic  jsonb not null,
  source   text not null default 'row',
  row_id   uuid,
  took_at  timestamptz not null default now(),
  out_at   timestamptz
);
create index if not exists graphics_air_log_show_idx on public.graphics_air_log (show_id, took_at);

-- --------------------------------------------------------------- packages --
create table if not exists public.graphics_packages (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 120),
  event_type   text not null default 'other'
               check (event_type in ('concert','game','parade','ceremony','other')),
  template_ids text[] not null default '{}',
  style        jsonb not null default '{}'::jsonb,
  shelf        jsonb not null default '[]'::jsonb,
  uses         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------ audio assets --
create table if not exists public.graphics_audio_assets (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 160),
  kind             text not null default 'vo' check (kind in ('vo','stinger','bed','sfx')),
  storage_path     text not null,
  mime_type        text not null default 'audio/mpeg',
  duration_seconds numeric(10,2),
  file_size_bytes  bigint,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- rosters --
create table if not exists public.graphics_rosters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 160),
  school_code text,
  sport       text check (char_length(sport) <= 60),
  season      text check (char_length(season) <= 30),
  players     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------- theme overrides ---
-- Brand colours from `schools` are derived into readable on-air values. This
-- table only holds the handful where the automatic derivation is wrong.
create table if not exists public.graphics_theme_overrides (
  school_code text primary key,
  g1          text,
  g2          text,
  g3          text,
  panel       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------- updated_at --
do $$
declare t text;
begin
  foreach t in array array[
    'graphics_channels','graphics_shows','graphics_blocks','graphics_rows',
    'graphics_shelf_items','graphics_packages','graphics_audio_assets',
    'graphics_rosters','graphics_theme_overrides'
  ] loop
    execute format(
      'drop trigger if exists %I_touch on public.%I;
       create trigger %I_touch before update on public.%I
         for each row execute function public.graphics_touch_updated_at();',
      t, t, t, t);
  end loop;
end $$;

-- -------------------------------------------------------------------- RLS --
-- Hub staff read and write everything. Nothing is readable by anon: the public
-- output page reads through a service-role API route gated by a channel token,
-- because a browser source cannot send an Authorization header.
do $$
declare t text;
begin
  foreach t in array array[
    'graphics_channels','graphics_shows','graphics_blocks','graphics_rows',
    'graphics_shelf_items','graphics_air','graphics_air_log','graphics_packages',
    'graphics_audio_assets','graphics_rosters','graphics_theme_overrides'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_staff_select on public.%I;', t, t);
    execute format('drop policy if exists %I_staff_write  on public.%I;', t, t);
    execute format(
      'create policy %I_staff_select on public.%I for select to authenticated
         using (public.auth_team_role_is_hub_staff());', t, t);
    execute format(
      'create policy %I_staff_write on public.%I for all to authenticated
         using (public.auth_team_role_is_hub_staff())
         with check (public.auth_team_role_is_hub_staff());', t, t);
  end loop;
end $$;

comment on table public.graphics_channels is
  'One row per production machine. Output URLs are stable per channel; shows are assigned to channels.';
comment on table public.graphics_air is
  'Current on-air graphic per layer. Row-sourced entries are cleared by the next take; shelf-sourced entries are not.';
