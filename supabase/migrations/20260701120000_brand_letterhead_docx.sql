-- Brand library: allow Word documents (.docx) as a logo/asset format so the new
-- "Letterhead" category can hold editable letterhead files alongside image logos.
--
-- Idempotent: safe to run against the existing remote DB (drops and re-adds the
-- format check) and lets a fresh environment reproduce the schema. Builds on
-- 20260624120000_brand_svg_and_typography.sql, which added 'svg'.

alter table public.school_logos drop constraint if exists school_logos_format_check;
alter table public.school_logos
  add constraint school_logos_format_check
  check (format = any (array['png'::text, 'jpg'::text, 'svg'::text, 'docx'::text]));
