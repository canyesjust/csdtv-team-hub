-- Signage template library (Phase 1).
-- District-curated catalog of templates the admin assigns to locations. A school
-- adds an assigned template, which creates a normal targeted signage_content
-- instance (reusing system_kind rendering). Auto-rebrands to each location.

create table if not exists public.signage_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null default 'Live',
  -- broadcast_board | calendar | national_day | website | designed_slide | image | video
  kind text not null,
  config jsonb not null default '{}'::jsonb,   -- per-kind defaults (html, default url, etc.)
  thumbnail_url text,
  auto_rebrand boolean not null default true,  -- fill location colors/logo at render
  singleton boolean not null default false,    -- only one instance per location
  requires_url boolean not null default false, -- needs a URL on add (calendar/website)
  all_sites boolean not null default false,    -- available to every location
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.signage_template_assignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.signage_templates(id) on delete cascade,
  site_id uuid not null references public.signage_sites(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (template_id, site_id)
);
create index if not exists signage_template_assign_site_idx on public.signage_template_assignments(site_id);

alter table public.signage_templates enable row level security;
alter table public.signage_template_assignments enable row level security;

-- Read: any authenticated dashboard user (catalog is non-sensitive).
-- Write: signage managers only (district admins curate the library).
do $$ begin
  if not exists (select 1 from pg_policies where tablename='signage_templates' and policyname='signage_templates_sel') then
    create policy "signage_templates_sel" on public.signage_templates for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='signage_templates' and policyname='signage_templates_wr') then
    create policy "signage_templates_wr" on public.signage_templates for all to authenticated using (public.signage_is_manager()) with check (public.signage_is_manager());
  end if;
  if not exists (select 1 from pg_policies where tablename='signage_template_assignments' and policyname='signage_template_assign_sel') then
    create policy "signage_template_assign_sel" on public.signage_template_assignments for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='signage_template_assignments' and policyname='signage_template_assign_wr') then
    create policy "signage_template_assign_wr" on public.signage_template_assignments for all to authenticated using (public.signage_is_manager()) with check (public.signage_is_manager());
  end if;
end $$;

-- Seed the existing built-in blocks as the first library entries (available
-- everywhere), so nothing regresses when the school UI switches to the library.
insert into public.signage_templates (name, description, category, kind, singleton, requires_url, all_sites, sort_order)
select v.name, v.description, v.category, v.kind, v.singleton, v.requires_url, v.all_sites, v.sort_order
from (values
  ('What''s coming up on air', 'Upcoming livestreams & board meetings you feature, with date, time & a scan-to-watch QR.', 'Live', 'broadcast_board', true, false, true, 10),
  ('National Day of the day', 'Auto-updates every day to show today''s fun national day.', 'Live', 'national_day', true, false, true, 20),
  ('Calendar', 'Upcoming events from a calendar (ICS/iCal) link you provide.', 'Live', 'calendar', false, true, true, 30),
  ('Website preview', 'A live view of a district web page (the page must allow embedding).', 'Live', 'website', false, true, true, 40)
) as v(name, description, category, kind, singleton, requires_url, all_sites, sort_order)
where not exists (select 1 from public.signage_templates);
