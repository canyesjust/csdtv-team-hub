-- ============================================================================
-- Per-site signage TEMPLATE. Idempotent. Run in Supabase.
--
-- Each site gets a default look that all of its screens inherit: a default
-- layout, which header widgets show (weather / clock / ticker / visitor
-- welcome), and branding (header title, subtitle, logo). Individual screens can
-- still override the layout (signage_screens.layout = 'inherit' means "use the
-- site default"; any other value wins). Theme + colors already live on
-- signage_sites from earlier migrations.
-- ============================================================================

ALTER TABLE public.signage_sites
  ADD COLUMN IF NOT EXISTS default_layout       text    NOT NULL DEFAULT 'zoned',
  ADD COLUMN IF NOT EXISTS show_weather         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_clock           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_ticker          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_visitor_welcome boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS brand_title          text,
  ADD COLUMN IF NOT EXISTS brand_subtitle       text;
-- logo_url already added in signage_sites_foundation.sql

-- Constrain default_layout to the known layouts (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signage_sites_default_layout_chk') THEN
    ALTER TABLE public.signage_sites ADD CONSTRAINT signage_sites_default_layout_chk
      CHECK (default_layout IN ('full_bleed', 'zoned', 'wayfinding'));
  END IF;
END $$;

-- Existing screens keep their explicit layout. New screens may use 'inherit' to
-- follow the site template; the feed treats 'inherit' (or null) as "site default".
-- (No data change needed — signage_screens.layout already defaults to 'zoned'.)
