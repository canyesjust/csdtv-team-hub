-- School brand color source for thumbnail prompt generation.
-- Run in Supabase SQL editor or via MCP migration.

create table if not exists public.school_brand_colors (
  id uuid primary key default gen_random_uuid(),
  school_code text,
  school_name text not null,
  primary_color text,
  secondary_color text,
  accent_color text,
  mascot text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_brand_colors_hex_check check (
    (primary_color is null or primary_color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$')
    and (secondary_color is null or secondary_color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$')
    and (accent_color is null or accent_color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$')
  )
);

create unique index if not exists school_brand_colors_school_code_uq
  on public.school_brand_colors ((lower(school_code)))
  where school_code is not null;

create unique index if not exists school_brand_colors_school_name_uq
  on public.school_brand_colors ((lower(school_name)));

alter table public.school_brand_colors enable row level security;

drop policy if exists school_brand_colors_select_authenticated on public.school_brand_colors;
create policy school_brand_colors_select_authenticated
on public.school_brand_colors
for select
to authenticated
using (active = true);

create or replace function public.school_brand_colors_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_school_brand_colors_updated_at on public.school_brand_colors;
create trigger trg_school_brand_colors_updated_at
before update on public.school_brand_colors
for each row
execute function public.school_brand_colors_set_updated_at();
