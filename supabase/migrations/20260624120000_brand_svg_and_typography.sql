-- Brand library: SVG (vector) logo support + per-school typography for brand guides.
-- NOTE: the base school_logos table/bucket migrations are still remote-only (see handoff
-- TODO #2); this migration is incremental and assumes school_logos already exists.

-- Allow SVG logos alongside PNG/JPG.
alter table public.school_logos drop constraint if exists school_logos_format_check;
alter table public.school_logos
  add constraint school_logos_format_check check (format = any (array['png'::text, 'jpg'::text, 'svg'::text]));

-- Per-school typography, shown on the printable brand guide.
alter table public.schools add column if not exists heading_font text;
alter table public.schools add column if not exists body_font text;
alter table public.schools add column if not exists font_notes text;
