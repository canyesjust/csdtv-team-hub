-- ============================================================================
-- Multi-location signage — FOUNDATION (phase 1). Idempotent. Run in Supabase.
--
-- Turns the signage system from single-tenant (CIC only) into multi-tenant by
-- location (District Office, CIC, schools). Each site is its own AbleSign
-- workspace, its own settings/theme/colors, and its own screens/areas/content.
-- Per-site colors come from the existing public.school_brand_colors table
-- (linked by school_code).
--
-- This migration only sets up the data model and moves existing data into a
-- "CIC" site. The app code scoping (feed + admin + site switcher + the
-- signage-only role/RLS) lands in the following phases.
-- ============================================================================

-- 1. The locations themselves.
CREATE TABLE IF NOT EXISTS public.signage_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  school_code text,                         -- links to school_brand_colors for site colors
  use_brand_colors boolean NOT NULL DEFAULT false,  -- derive palette from school_brand_colors vs use default_theme
  ablesign_workspace_id text,               -- per-site AbleSign workspace
  ablesign_api_key text,                    -- optional per-site key (else falls back to env)
  center_name text NOT NULL DEFAULT 'Canyons School District',
  weather_lat numeric NOT NULL DEFAULT 40.5649,
  weather_lon numeric NOT NULL DEFAULT -111.8389,
  ticker_extra text,
  default_theme text NOT NULL DEFAULT 'primary',
  logo_url text,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Seed the existing CIC configuration as the first site (from signage_settings).
INSERT INTO public.signage_sites (name, slug, center_name, default_theme, weather_lat, weather_lon, ticker_extra, sort_order)
SELECT
  'Canyons Innovation Center', 'cic',
  COALESCE(s.center_name, 'Canyons Innovation Center'),
  COALESCE(s.default_theme, 'primary'),
  COALESCE(s.weather_lat, 40.5649),
  COALESCE(s.weather_lon, -111.8389),
  s.ticker_extra,
  0
FROM (SELECT * FROM public.signage_settings WHERE id = 1) s
ON CONFLICT (slug) DO NOTHING;

-- Fallback: ensure a CIC site exists even if signage_settings was empty.
INSERT INTO public.signage_sites (name, slug, center_name, sort_order)
VALUES ('Canyons Innovation Center', 'cic', 'Canyons Innovation Center', 0)
ON CONFLICT (slug) DO NOTHING;

-- 3. Stamp every signage table with site_id and default existing rows to CIC.
DO $$
DECLARE cic uuid;
BEGIN
  SELECT id INTO cic FROM public.signage_sites WHERE slug = 'cic';

  ALTER TABLE public.signage_screens       ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.signage_sites(id);
  ALTER TABLE public.signage_areas         ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.signage_sites(id);
  ALTER TABLE public.signage_content       ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.signage_sites(id);
  ALTER TABLE public.signage_announcements ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.signage_sites(id);
  ALTER TABLE public.signage_wayfinding    ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.signage_sites(id);
  ALTER TABLE public.signage_visitors      ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.signage_sites(id);

  UPDATE public.signage_screens       SET site_id = cic WHERE site_id IS NULL;
  UPDATE public.signage_areas         SET site_id = cic WHERE site_id IS NULL;
  UPDATE public.signage_content       SET site_id = cic WHERE site_id IS NULL;
  UPDATE public.signage_announcements SET site_id = cic WHERE site_id IS NULL;
  UPDATE public.signage_wayfinding    SET site_id = cic WHERE site_id IS NULL;
  UPDATE public.signage_visitors      SET site_id = cic WHERE site_id IS NULL;
END $$;

-- Indexes for the new scoping column (these tables are read on every screen poll).
CREATE INDEX IF NOT EXISTS idx_signage_screens_site       ON public.signage_screens (site_id);
CREATE INDEX IF NOT EXISTS idx_signage_areas_site         ON public.signage_areas (site_id);
CREATE INDEX IF NOT EXISTS idx_signage_content_site       ON public.signage_content (site_id, status);
CREATE INDEX IF NOT EXISTS idx_signage_announcements_site ON public.signage_announcements (site_id, active);
CREATE INDEX IF NOT EXISTS idx_signage_wayfinding_site    ON public.signage_wayfinding (site_id);
CREATE INDEX IF NOT EXISTS idx_signage_visitors_site      ON public.signage_visitors (site_id);

-- 4. Which users can manage which sites (many-to-many; a user may have several).
CREATE TABLE IF NOT EXISTS public.signage_site_access (
  team_id uuid NOT NULL REFERENCES public.team(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.signage_sites(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, site_id)
);
CREATE INDEX IF NOT EXISTS idx_signage_site_access_team ON public.signage_site_access (team_id);

-- NOTE: the "signage-only" user role and the RLS policies that enforce
-- per-site access arrive in a later phase, once the app code reads site_id.
-- Until then, managers continue to see everything (defaulted to CIC).
