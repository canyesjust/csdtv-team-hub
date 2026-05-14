-- Merge school_brand_colors into schools (single source of truth), then drop school_brand_colors.
-- Run once in Supabase SQL editor after backup. Safe to re-run: IF NOT EXISTS / guarded drops.
-- Order and verification: see db/README-school-brand.md

-- 1) Add brand columns missing on schools
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS title_i text,
  ADD COLUMN IF NOT EXISTS mascot_name text,
  ADD COLUMN IF NOT EXISTS text_color text,
  ADD COLUMN IF NOT EXISTS link_url text;

-- 2) Copy brand data where school name matches exactly (case-insensitive, trimmed)
UPDATE public.schools s
SET
  city = COALESCE(b.city, s.city),
  title_i = COALESCE(b.title_i, s.title_i),
  mascot_name = COALESCE(b.mascot_name, s.mascot_name),
  text_color = COALESCE(b.text_color, s.text_color),
  link_url = COALESCE(b.link_url, s.link_url),
  mascot = CASE
    WHEN b.mascot IS NOT NULL AND trim(b.mascot) <> '' AND trim(b.mascot) <> '-' THEN trim(b.mascot)
    ELSE s.mascot
  END,
  primary_color = COALESCE(b.primary_color, s.primary_color),
  secondary_color = COALESCE(b.secondary_color, s.secondary_color),
  accent_color = COALESCE(b.accent_color, s.accent_color)
FROM public.school_brand_colors b
WHERE b.active = true
  AND lower(trim(s.name)) = lower(trim(b.school_name));

-- 3) Known name mismatches between brand sheet and schools.name
UPDATE public.schools s
SET
  city = COALESCE(b.city, s.city),
  title_i = COALESCE(b.title_i, s.title_i),
  mascot_name = COALESCE(b.mascot_name, s.mascot_name),
  text_color = COALESCE(b.text_color, s.text_color),
  link_url = COALESCE(b.link_url, s.link_url),
  mascot = CASE
    WHEN b.mascot IS NOT NULL AND trim(b.mascot) <> '' AND trim(b.mascot) <> '-' THEN trim(b.mascot)
    ELSE s.mascot
  END,
  primary_color = COALESCE(b.primary_color, s.primary_color),
  secondary_color = COALESCE(b.secondary_color, s.secondary_color),
  accent_color = COALESCE(b.accent_color, s.accent_color)
FROM public.school_brand_colors b
WHERE b.active = true
  AND lower(trim(b.school_name)) = 'mount jordan middle'
  AND s.code = '408';

UPDATE public.schools s
SET
  city = COALESCE(b.city, s.city),
  title_i = COALESCE(b.title_i, s.title_i),
  mascot_name = COALESCE(b.mascot_name, s.mascot_name),
  text_color = COALESCE(b.text_color, s.text_color),
  link_url = COALESCE(b.link_url, s.link_url),
  mascot = CASE
    WHEN b.mascot IS NOT NULL AND trim(b.mascot) <> '' AND trim(b.mascot) <> '-' THEN trim(b.mascot)
    ELSE s.mascot
  END,
  primary_color = COALESCE(b.primary_color, s.primary_color),
  secondary_color = COALESCE(b.secondary_color, s.secondary_color),
  accent_color = COALESCE(b.accent_color, s.accent_color)
FROM public.school_brand_colors b
WHERE b.active = true
  AND lower(trim(b.school_name)) = 'diamond ridge high'
  AND s.code = '750';

UPDATE public.schools s
SET
  city = COALESCE(b.city, s.city),
  title_i = COALESCE(b.title_i, s.title_i),
  mascot_name = COALESCE(b.mascot_name, s.mascot_name),
  text_color = COALESCE(b.text_color, s.text_color),
  link_url = COALESCE(b.link_url, s.link_url),
  mascot = CASE
    WHEN b.mascot IS NOT NULL AND trim(b.mascot) <> '' AND trim(b.mascot) <> '-' THEN trim(b.mascot)
    ELSE s.mascot
  END,
  primary_color = COALESCE(b.primary_color, s.primary_color),
  secondary_color = COALESCE(b.secondary_color, s.secondary_color),
  accent_color = COALESCE(b.accent_color, s.accent_color)
FROM public.school_brand_colors b
WHERE b.active = true
  AND lower(trim(b.school_name)) = 'jordan valley school'
  AND s.code = '810';

UPDATE public.schools s
SET
  city = COALESCE(b.city, s.city),
  title_i = COALESCE(b.title_i, s.title_i),
  mascot_name = COALESCE(b.mascot_name, s.mascot_name),
  text_color = COALESCE(b.text_color, s.text_color),
  link_url = COALESCE(b.link_url, s.link_url),
  mascot = CASE
    WHEN b.mascot IS NOT NULL AND trim(b.mascot) <> '' AND trim(b.mascot) <> '-' THEN trim(b.mascot)
    ELSE s.mascot
  END,
  primary_color = COALESCE(b.primary_color, s.primary_color),
  secondary_color = COALESCE(b.secondary_color, s.secondary_color),
  accent_color = COALESCE(b.accent_color, s.accent_color)
FROM public.school_brand_colors b
WHERE b.active = true
  AND lower(trim(b.school_name)) = 'entrada'
  AND s.code = '981';

-- 4) Brand rows with no matching school row — insert minimal school records (adjust codes in UI if needed)
INSERT INTO public.schools (id, code, name, type, city, title_i, mascot_name, mascot, primary_color, secondary_color, accent_color, text_color, link_url, active)
SELECT
  gen_random_uuid(),
  CASE lower(trim(b.school_name))
    WHEN 'canyons virtual academy' THEN '996'
    WHEN 'life skills academy' THEN '995'
    ELSE '9' || lpad((abs(hashtext(b.school_name)) % 100000)::text, 5, '0')
  END,
  trim(b.school_name),
  'school',
  b.city,
  b.title_i,
  b.mascot_name,
  CASE
    WHEN b.mascot IS NOT NULL AND trim(b.mascot) <> '' AND trim(b.mascot) <> '-' THEN trim(b.mascot)
    ELSE NULL
  END,
  b.primary_color,
  b.secondary_color,
  b.accent_color,
  b.text_color,
  b.link_url,
  COALESCE(b.active, true)
FROM public.school_brand_colors b
WHERE b.active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.schools s
    WHERE lower(trim(s.name)) = lower(trim(b.school_name))
  )
  AND lower(trim(b.school_name)) NOT IN (
    'mount jordan middle',
    'diamond ridge high',
    'jordan valley school',
    'entrada'
  )
ON CONFLICT (code) DO NOTHING;

-- If insert conflicts on code, resolve manually (rare): codes 995/996 reserved above.

-- 5) Optional: backfill school_code on brand side not needed — table dropped next.

-- 6) Drop school_brand_colors (policies, trigger, function, table)
DROP POLICY IF EXISTS school_brand_colors_select_authenticated ON public.school_brand_colors;

DROP TRIGGER IF EXISTS trg_school_brand_colors_updated_at ON public.school_brand_colors;

DROP FUNCTION IF EXISTS public.school_brand_colors_set_updated_at();

DROP TABLE IF EXISTS public.school_brand_colors;
