-- Brand library: multi-palette brand colors (up to 8 colors per palette, any number
-- of named palettes per school, default palette named "Primary"), EPS logo support,
-- and a bigger upload cap (enforced in app code; see MAX_BRAND_UPLOAD_BYTES).
--
-- The existing schools.primary_color/secondary_color/accent_color/text_color columns
-- stay as-is (signage sites, admin settings, and the productions page all read them
-- directly for their own theming). The new "Primary" palette's first four color slots
-- are kept in sync with those columns in both directions by the application layer
-- (lib/server/brand-palettes.ts), not by a DB trigger, so this migration only adds the
-- new table and backfills it -- it does not touch the schools table's columns.

-- 1. Allow EPS (vector) logo files alongside PNG/JPG/SVG/DOCX.
alter table public.school_logos drop constraint if exists school_logos_format_check;
alter table public.school_logos
  add constraint school_logos_format_check check (format = any (array['png'::text, 'jpg'::text, 'svg'::text, 'docx'::text, 'eps'::text]));

-- 2. Brand color palettes: one row per named palette per school. Every school gets a
--    default "Primary" palette (backfilled below from its existing 4 color columns).
--    Colors are an 8-slot array; unset slots are null and are not rendered as swatches.
create table if not exists public.school_brand_palettes (
  id uuid primary key default gen_random_uuid(),
  school_code text not null,
  name text not null default 'Primary',
  sort_order integer not null default 0,
  colors text[] not null default array[null, null, null, null, null, null, null, null]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_brand_palettes_colors_len check (cardinality(colors) = 8),
  unique (school_code, name)
);

create index if not exists school_brand_palettes_code_idx
  on public.school_brand_palettes (school_code);

-- All reads/writes run server-side via the service role, same as school_logos.
alter table public.school_brand_palettes enable row level security;

-- Backfill: every school/department/district gets a "Primary" palette seeded from its
-- current primary_color/secondary_color/accent_color/text_color (slots 5-8 start blank).
insert into public.school_brand_palettes (school_code, name, sort_order, colors)
select
  s.code,
  'Primary',
  0,
  array[s.primary_color, s.secondary_color, s.accent_color, s.text_color, null, null, null, null]
from public.schools s
where not exists (
  select 1 from public.school_brand_palettes p
  where p.school_code = s.code and lower(p.name) = 'primary'
);

-- 3. The gallery summary function excludes formats with no image preview from the
--    thumbnail ranking. EPS has no browser-renderable preview either (like docx).
create or replace function public.brand_school_summaries()
returns table (school_code text, logo_count bigint, preview_path text)
language sql
stable
security invoker
set search_path = public
as $$
  with counts as (
    select l.school_code, count(distinct l.category || '||' || l.name) as logo_count
    from public.school_logos l
    group by l.school_code
  ),
  ranked as (
    select
      l.school_code,
      l.storage_path,
      row_number() over (
        partition by l.school_code
        order by
          (case
            when l.is_cover and l.format in ('svg', 'png') then 6
            when l.is_cover then 5
            when l.format = 'svg' then 4
            when lower(l.category) = 'official' and l.format = 'png' then 3
            when l.format = 'png' then 2
            else 1
          end) desc,
          l.id asc
      ) as rn
    from public.school_logos l
    where l.format not in ('docx', 'eps')
  )
  select c.school_code, c.logo_count, r.storage_path
  from counts c
  left join ranked r on r.school_code = c.school_code and r.rn = 1;
$$;

revoke all on function public.brand_school_summaries() from public;
grant execute on function public.brand_school_summaries() to service_role;
