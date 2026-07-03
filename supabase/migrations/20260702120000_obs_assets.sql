-- OBS Assets: a private library of commercials and OBS scenes that outside operators
-- download from a shared-password-gated public page (/obs), and that logged-in
-- staff/interns upload and manage from the dashboard.
--
-- Storage is private: objects are served only via short-lived signed URLs generated
-- by the service role. There is intentionally NO public storage.objects read policy.

-- Private bucket. Uploads/deletes go through the service role only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'obs-assets',
  'obs-assets',
  false,
  1073741824, -- 1 GB
  ARRAY[
    'video/mp4',
    'video/quicktime',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/json',
    'application/zip',
    'application/x-zip-compressed'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Asset catalog. Writes happen server-side via the service role (which bypasses RLS),
-- so the only policy is a read policy for signed-in hub staff (dashboard manage view).
create table if not exists public.obs_assets (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('commercial', 'scene')),
  name text not null,
  description text,
  filename text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes bigint,
  kind text not null check (kind in ('video', 'image', 'scene')),
  content_hash text,
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.obs_assets enable row level security;

-- Signed-in hub staff may read the catalog (used by the dashboard manage page when it
-- reads directly). All inserts/updates/deletes go through the service role.
drop policy if exists obs_assets_hub_staff_read on public.obs_assets;
create policy obs_assets_hub_staff_read
  on public.obs_assets
  for select
  to authenticated
  using (public.auth_team_role_is_hub_staff());

create index if not exists obs_assets_category_idx on public.obs_assets (category);
create index if not exists obs_assets_enabled_idx on public.obs_assets (enabled);

-- Shared-password gate config for the public /obs page. Single-row table; all access is
-- via the service role (RLS on, no policies). If no row exists the app falls back to the
-- OBS_SITE_PASSWORD env var, and if neither is set the gate is off.
create table if not exists public.obs_access_config (
  id integer primary key default 1 check (id = 1),
  password_hash text,      -- scrypt: 'scrypt$<salthex>$<hashhex>'
  session_token text,      -- opaque token stored in the access cookie; rotates on change
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.obs_access_config enable row level security;
-- No policies: only the server-side service role reads/writes this table.
