-- Per-site editable colors. Run in Supabase.
--
-- A site can "Load colors from school" (pulls schools.primary/secondary/accent/
-- text_color by school_code) as a starting point, then you can change any of
-- them in Signage Settings — so a location can use different colors than the
-- official school brand.
--
-- Effective palette when use_brand_colors = true:
--   background <- bg_color, panels <- panel_color (or derived from bg),
--   accent <- accent_color, text <- text_color (or white).
-- When use_brand_colors = false, the site uses its default_theme instead.

ALTER TABLE public.signage_sites
  ADD COLUMN IF NOT EXISTS bg_color text,
  ADD COLUMN IF NOT EXISTS panel_color text,
  ADD COLUMN IF NOT EXISTS accent_color text,
  ADD COLUMN IF NOT EXISTS text_color text;

-- Hex-format guard (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signage_sites_colors_hex_chk') THEN
    ALTER TABLE public.signage_sites ADD CONSTRAINT signage_sites_colors_hex_chk CHECK (
      (bg_color     IS NULL OR bg_color     ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$') AND
      (panel_color  IS NULL OR panel_color  ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$') AND
      (accent_color IS NULL OR accent_color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$') AND
      (text_color   IS NULL OR text_color   ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$')
    );
  END IF;
END $$;
