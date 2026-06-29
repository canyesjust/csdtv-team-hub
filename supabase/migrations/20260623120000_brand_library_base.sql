-- Brand library base schema. Backfill of objects that were originally applied
-- directly to the remote database and were missing from source control
-- (see docs/full-site-inspection-2026-06.md, finding C2).
--
-- Every statement is idempotent (IF NOT EXISTS / ON CONFLICT / WHERE NOT EXISTS),
-- so this is safe to run against the existing database (it is a no-op there) and
-- it lets a fresh environment (supabase db reset / new project) reproduce the schema.
--
-- This file is intentionally dated BEFORE 20260624120000_brand_svg_and_typography.sql,
-- which builds on this base (adds 'svg' to the format check + schools typography columns).
--
-- Operational DATA changes that were also applied directly to the remote DB are NOT
-- reproduced here (they edit pre-existing rows): added 'Canyons Innovation Center'
-- (code 900); deactivated Bell View Elementary (105), Edgemont Elementary (124),
-- Canyons Transition Academy (840).

-- 1. Public storage bucket for logo files (world-readable; writes go through the service role).
insert into storage.buckets (id, name, public)
values ('school-logos', 'school-logos', true)
on conflict (id) do update set public = true;

drop policy if exists "school-logos public read" on storage.objects;
create policy "school-logos public read"
  on storage.objects for select to public
  using (bucket_id = 'school-logos');

-- 2. Logo metadata: one row per file. Files live at school-logos/<code>/<uuid>.<format>.
create table if not exists public.school_logos (
  id uuid primary key default gen_random_uuid(),
  school_code text not null,
  category text not null default 'Official',
  name text not null,
  format text not null check (format = any (array['png'::text, 'jpg'::text])),
  storage_path text not null,
  sort_order integer not null default 0,
  flagged_for_deletion boolean not null default false,
  flagged_at timestamptz,
  is_cover boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_code, category, name, format)
);

create index if not exists school_logos_code_idx
  on public.school_logos (school_code);
create index if not exists school_logos_cover_idx
  on public.school_logos (school_code) where is_cover;
create index if not exists school_logos_flagged_idx
  on public.school_logos (flagged_for_deletion) where flagged_for_deletion;

-- All reads and writes run server-side via the service role; no anon/authenticated policies.
alter table public.school_logos enable row level security;

-- 3. District brand record (the brand library's org-wide entry). Other school/department
--    rows pre-exist in the schools table.
insert into public.schools (code, name, type, active)
select 'district', 'Canyons School District', 'district', true
where not exists (select 1 from public.schools where code = 'district');
